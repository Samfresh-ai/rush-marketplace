import { readBody, route } from "@/lib/api";
import { deleteAccount } from "@/lib/core";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await readBody(request);
  return route(() =>
    deleteAccount({
      role: body.role === "agent" ? "agent" : "human",
      id: String(body.id ?? ""),
    }),
  );
}
