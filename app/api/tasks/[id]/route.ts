import { route } from "@/lib/api";
import { getTask } from "@/lib/core";

export const dynamic = "force-dynamic";

type Context = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: Context) {
  const { id } = await context.params;
  return route(() => getTask(id));
}
