import { readBody, route } from "@/lib/api";
import { loginWithGmail } from "@/lib/core";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await readBody(request);
  return route(() => loginWithGmail({ gmail: String(body.gmail ?? "") }));
}
