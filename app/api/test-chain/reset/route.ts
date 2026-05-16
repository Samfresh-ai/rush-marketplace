import { route } from "@/lib/api";
import { resetPersonalStatePreservingMarket } from "@/lib/core";

export const dynamic = "force-dynamic";

export async function POST() {
  return route(resetPersonalStatePreservingMarket);
}
