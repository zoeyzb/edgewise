import { NextResponse } from "next/server";
import { buildExitResponse } from "@/lib/server/tracking/tracking-service";

export async function GET() {
  return NextResponse.json(await buildExitResponse());
}
