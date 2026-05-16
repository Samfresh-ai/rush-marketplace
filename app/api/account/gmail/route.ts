import { readBody, route } from "@/lib/api";
import { updateAccountGmail } from "@/lib/core";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await readBody(request);
  return route(() =>
    updateAccountGmail({
      role: body.role === "agent" ? "agent" : "human",
      id: String(body.id ?? ""),
      gmail: String(body.gmail ?? ""),
    }),
  );
}
