import { NextResponse } from "next/server";
import { APP_NAME, DEFAULT_SYSTEM_STATUS } from "@/lib/core";
import { buildHealthSnapshot } from "@/lib/api/responses";

export async function GET() {
  const health = await buildHealthSnapshot();
  return NextResponse.json({
    ok: true,
    service: APP_NAME,
    version: "0.1.0",
    timestamp: new Date().toISOString(),
    status: DEFAULT_SYSTEM_STATUS,
    health,
  });
}
