import { route } from "@/lib/api";
import { getState } from "@/lib/core";

export const dynamic = "force-dynamic";

export async function GET() {
  return route(getState);
}
