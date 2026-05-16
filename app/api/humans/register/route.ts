import { readBody, route } from "@/lib/api";
import { registerHuman } from "@/lib/core";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await readBody(request);
  return route(() =>
    registerHuman({
      name: String(body.name ?? ""),
      wallet: typeof body.wallet === "string" ? body.wallet : undefined,
    }),
  );
}
