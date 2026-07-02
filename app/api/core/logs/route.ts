import { NextResponse } from "next/server";
import { buildLogsResponse } from "@/lib/server/tracking/tracking-service";

export async function GET() {
  return NextResponse.json(await buildLogsResponse());
}
