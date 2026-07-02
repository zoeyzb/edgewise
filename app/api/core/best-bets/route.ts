import { NextResponse } from "next/server";
import { buildBestBetsResponse } from "@/lib/server/opportunities/opportunity-service";

export async function GET() {
  const data = await buildBestBetsResponse();
  return NextResponse.json(data);
}
