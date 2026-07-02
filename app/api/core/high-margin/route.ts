import { NextResponse } from "next/server";
import { buildHighMarginResponse } from "@/lib/server/opportunities/opportunity-service";

export async function GET() {
  const data = await buildHighMarginResponse();
  return NextResponse.json(data);
}
