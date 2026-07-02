import { NextRequest, NextResponse } from "next/server";
import {
  buildKalshiMarketsResponse,
  buildOpportunityScanResponse,
} from "@/lib/server/opportunities/opportunity-service";

export async function GET(req: NextRequest) {
  const oddsEdge = req.nextUrl.searchParams.get("oddsEdge") === "1";
  if (oddsEdge) {
    const data = await buildOpportunityScanResponse({ includeOddsEdge: true });
    return NextResponse.json(data);
  }
  const data = await buildKalshiMarketsResponse();
  return NextResponse.json(data);
}
