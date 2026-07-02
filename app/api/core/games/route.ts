import { NextResponse } from "next/server";
import { buildGamesResponse } from "@/lib/server/providers/provider-health";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sport = searchParams.get("sport") ?? "basketball_nba";
  const data = await buildGamesResponse(sport);
  return NextResponse.json(data);
}
