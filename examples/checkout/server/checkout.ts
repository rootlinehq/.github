import { randomUUID } from "node:crypto";
import type { Checkout, CheckoutStatus, DemoMode } from "../src/types";
import { DemoError, type PaymentGateway } from "./rootline";
import type { PaymentEvent } from "./webhooks";

interface Order {
  id: string;
  status: CheckoutStatus;
  paymentId?: string;
  secret?: string;
  uncertain?: boolean;
}

export class CheckoutStore {
  private readonly orders = new Map<string, Order>();
  private readonly operations = new Map<string, Promise<unknown>>();

  constructor(
    private readonly mode: DemoMode,
    private readonly gateway?: PaymentGateway,
  ) {}

  private async serialized<T>(
    session: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    const previous = this.operations.get(session) ?? Promise.resolve();
    const current = previous.catch(() => undefined).then(operation);
    this.operations.set(session, current);
    try {
      return await current;
    } finally {
      if (this.operations.get(session) === current)
        this.operations.delete(session);
    }
  }

  private view(order: Order, includeSecret = false): Checkout {
    return {
      orderId: order.id,
      status: order.status,
      ...(includeSecret && order.status === "open" && order.secret
        ? { paymentSessionSecret: order.secret }
        : {}),
    };
  }

  private async refresh(order: Order) {
    if (order.uncertain) {
      throw new DemoError(
        "creation_uncertain",
        `Payment creation is unresolved. Check reference ${order.id} in the staging dashboard, then start over.`,
        409,
      );
    }
    if (this.mode === "staging" && order.paymentId && this.gateway) {
      const payment = await this.gateway.get(order.paymentId, order.id);
      order.status = payment.checkout_status;
    }
  }

  checkout(session: string): Promise<Checkout> {
    return this.serialized(session, async () => {
      const existing = this.orders.get(session);
      if (existing) {
        await this.refresh(existing);
        return this.view(existing, true);
      }
      if (this.mode === "staging" && !this.gateway) {
        throw new DemoError(
          "setup_required",
          "Add your staging API key and account ID to .env, then restart the server.",
          503,
        );
      }
      const order: Order = { id: `cafe_${randomUUID()}`, status: "open" };
      this.orders.set(session, order);
      if (this.gateway && this.mode === "staging") {
        try {
          const payment = await this.gateway.create(order.id);
          order.paymentId = payment.id;
          order.secret = payment.payment_session_secret;
          order.status = payment.checkout_status;
        } catch (error) {
          if (
            error instanceof DemoError &&
            error.code === "creation_rejected"
          ) {
            this.orders.delete(session);
            throw error;
          }
          order.uncertain = true;
          throw new DemoError(
            "creation_uncertain",
            `Payment creation is unresolved. Check reference ${order.id} in the staging dashboard, then start over.`,
            409,
          );
        }
      }
      return this.view(order, true);
    });
  }

  status(session: string): Promise<Checkout> {
    return this.serialized(session, async () => {
      const order = this.orders.get(session);
      if (!order)
        throw new DemoError(
          "order_missing",
          "This demo order is no longer available. The server may have restarted.",
          404,
        );
      await this.refresh(order);
      return this.view(order);
    });
  }

  // Forgets the browser's order so a new one can be created. Nothing changes
  // in Rootline: an open payment expires on its own, and an unresolved
  // creation is reconciled in the dashboard by its reference.
  restart(session: string): Promise<void> {
    return this.serialized(session, async () => {
      if (!this.orders.delete(session))
        throw new DemoError(
          "order_missing",
          "There is no demo order to restart.",
          404,
        );
    });
  }

  // Applies a verified webhook to the matching order. Setting the status is
  // idempotent, so redelivered events are harmless.
  applyWebhook(event: PaymentEvent): Promise<boolean> {
    const entry = [...this.orders].find(
      ([, order]) =>
        order.paymentId === event.paymentId && order.id === event.reference,
    );
    if (!entry) return Promise.resolve(false);
    const [session, order] = entry;
    return this.serialized(session, async () => {
      order.status = event.status;
      return true;
    });
  }

  simulate(session: string, status: CheckoutStatus): Promise<Checkout> {
    return this.serialized(session, async () => {
      if (this.mode !== "preview")
        throw new DemoError(
          "not_available",
          "Simulation is available only in preview mode.",
          404,
        );
      const order = this.orders.get(session);
      if (!order)
        throw new DemoError(
          "order_missing",
          "Start the preview checkout first.",
          404,
        );
      order.status = status;
      return this.view(order);
    });
  }
}
