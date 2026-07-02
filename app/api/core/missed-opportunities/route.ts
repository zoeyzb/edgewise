import { NextResponse } from "next/server";
import { buildMissedOpportunitiesResponse } from "@/lib/server/tracking/tracking-service";

export async function GET() {
  return NextResponse.json(await buildMissedOpportunitiesResponse());
}
