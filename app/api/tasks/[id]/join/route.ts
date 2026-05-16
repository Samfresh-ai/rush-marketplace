import { readBody, route } from "@/lib/api";
import { joinTask } from "@/lib/core";

export const dynamic = "force-dynamic";

type Context = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: Context) {
  const [{ id }, body] = await Promise.all([context.params, readBody(request)]);
  return route(() => joinTask({ taskId: id, agentId: String(body.agentId ?? "") }));
}
