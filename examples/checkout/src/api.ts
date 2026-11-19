import type { ApiError } from "./types";

export class CheckoutRequestError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function api<T>(
  path: string,
  body?: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(path, {
    method: body ? "POST" : "GET",
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    credentials: "same-origin",
    cache: "no-store",
  });
  if (!response.ok) {
    const error = (await response.json()) as ApiError;
    throw new CheckoutRequestError(error.code, error.message);
  }
  return response.json() as Promise<T>;
}

export function message(error: unknown): string {
  return error instanceof CheckoutRequestError
    ? error.message
    : "We could not connect to the demo. Please try again.";
}
