import { NextResponse } from "next/server";
import { buildProviderHealthReport } from "@/lib/server/providers/provider-health";

export async function GET() {
  return NextResponse.json(await buildProviderHealthReport());
}
