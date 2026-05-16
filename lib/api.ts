import { NextResponse } from "next/server";

import { RushMarketplaceError } from "./escrow";

export async function readBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = (await request.json()) as unknown;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return {};
    }

    return body as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function routeError(error: unknown): NextResponse {
  if (error instanceof RushMarketplaceError) {
    return NextResponse.json({ error: error.message }, { status: error.statusCode });
  }

  console.error(error);
  return NextResponse.json({ error: "Internal server error." }, { status: 500 });
}

export async function route<T>(handler: () => Promise<T>): Promise<NextResponse> {
  try {
    const result = await handler();
    return NextResponse.json(result);
  } catch (error) {
    return routeError(error);
  }
}

export function textArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
}
