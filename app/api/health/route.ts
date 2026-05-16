import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const chainEnabled = process.env.USE_CHAIN?.trim() === "true";
  return NextResponse.json({
    ok: true,
    mode: chainEnabled ? "test-chain" : "test-ledger",
    chainEnabled,
  });
}
