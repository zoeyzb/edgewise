import { NextResponse } from "next/server";
import { buildProfitabilityResponse } from "@/lib/server/tracking/tracking-service";

export async function GET() {
  return NextResponse.json(await buildProfitabilityResponse());
}
