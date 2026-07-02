import { NextResponse } from "next/server";
import { buildOpportunityScanResponse } from "@/lib/server/opportunities/opportunity-service";

export async function GET() {
  const data = await buildOpportunityScanResponse();
  return NextResponse.json(data);
}
