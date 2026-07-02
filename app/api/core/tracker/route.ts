import { NextResponse } from "next/server";
import { buildTrackerResponse } from "@/lib/server/tracking/tracking-service";

export async function GET() {
  return NextResponse.json(await buildTrackerResponse());
}
