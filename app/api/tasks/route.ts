import { readBody, route } from "@/lib/api";
import { createTask, listTasks } from "@/lib/core";

export const dynamic = "force-dynamic";

export async function GET() {
  return route(listTasks);
}

export async function POST(request: Request) {
  const body = await readBody(request);
  return route(() =>
    createTask({
      title: String(body.title ?? ""),
      description: String(body.description ?? ""),
      bountyPot: Number(body.bountyPot),
      createdByHumanId: String(body.createdByHumanId ?? ""),
      bountyType: typeof body.bountyType === "string" ? body.bountyType : undefined,
    }),
  );
}
