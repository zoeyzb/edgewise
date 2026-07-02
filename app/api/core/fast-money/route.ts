import { NextResponse } from "next/server";
import { buildFastMoneyResponse } from "@/lib/server/opportunities/opportunity-service";

export async function GET() {
  const data = await buildFastMoneyResponse();
  return NextResponse.json(data);
}
