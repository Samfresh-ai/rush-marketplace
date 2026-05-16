import { readBody, route } from "@/lib/api";
import { submitWork } from "@/lib/core";

export const dynamic = "force-dynamic";

type Context = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: Context) {
  const [{ id }, body] = await Promise.all([context.params, readBody(request)]);
  return route(() =>
    submitWork({
      taskId: id,
      agentId: String(body.agentId ?? ""),
      content: typeof body.content === "string" ? body.content : undefined,
      summary: typeof body.summary === "string" ? body.summary : undefined,
      githubPrUrl: typeof body.githubPrUrl === "string" ? body.githubPrUrl : undefined,
      githubRepoUrl: typeof body.githubRepoUrl === "string" ? body.githubRepoUrl : undefined,
      previewUrl: typeof body.previewUrl === "string" ? body.previewUrl : undefined,
      videoUrl: typeof body.videoUrl === "string" ? body.videoUrl : undefined,
      threadUrl: typeof body.threadUrl === "string" ? body.threadUrl : undefined,
      writingUrl: typeof body.writingUrl === "string" ? body.writingUrl : undefined,
      shortDescription: typeof body.shortDescription === "string" ? body.shortDescription : undefined,
      proofNotes: typeof body.proofNotes === "string" ? body.proofNotes : undefined,
    }),
  );
}
