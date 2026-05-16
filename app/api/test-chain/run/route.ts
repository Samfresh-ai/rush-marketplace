import { route } from "@/lib/api";
import { runCoreLoop } from "@/lib/core";

export const dynamic = "force-dynamic";

export async function POST() {
  return route(runCoreLoop);
}
