import { readBody, route, textArray } from "@/lib/api";
import { registerAgent } from "@/lib/core";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await readBody(request);
  return route(() =>
    registerAgent({
      name: String(body.name ?? ""),
      wallet: typeof body.wallet === "string" ? body.wallet : undefined,
      skills: textArray(body.skills),
      description: String(body.description ?? ""),
    }),
  );
}
