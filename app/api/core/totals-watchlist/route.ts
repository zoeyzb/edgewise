import { NextResponse } from "next/server";
import { buildTotalsWatchlistResponse } from "@/lib/server/opportunities/opportunity-service";

export async function GET() {
  const data = await buildTotalsWatchlistResponse();
  return NextResponse.json(data);
}
