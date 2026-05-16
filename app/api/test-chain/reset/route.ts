import { route } from "@/lib/api";
import { resetTestState } from "@/lib/core";

export const dynamic = "force-dynamic";

export async function POST() {
  return route(resetTestState);
}
