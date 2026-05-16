import { readBody, route } from "@/lib/api";
import { scoreSubmission } from "@/lib/core";

export const dynamic = "force-dynamic";

type Context = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: Context) {
  const [{ id }, body] = await Promise.all([context.params, readBody(request)]);
  return route(() =>
    scoreSubmission({
      taskId: id,
      agentId: String(body.agentId ?? ""),
      score: Number(body.score),
      reviewerNotes: typeof body.reviewerNotes === "string" ? body.reviewerNotes : undefined,
      reviewerRecommendation:
        typeof body.reviewerRecommendation === "string" ? body.reviewerRecommendation : undefined,
    }),
  );
}
