import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    ok: true,
    mode: process.env.USE_CHAIN?.trim() === "true" ? "test-chain" : "test-chain",
    chainEnabled: process.env.USE_CHAIN?.trim() === "true",
  });
}
