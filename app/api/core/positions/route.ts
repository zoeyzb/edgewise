import { NextResponse } from "next/server";
import { buildPositionsResponse } from "@/lib/server/tracking/tracking-service";

export async function GET() {
  return NextResponse.json(await buildPositionsResponse());
}
