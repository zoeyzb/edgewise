import { NextResponse } from "next/server";
import { buildPortfolioResponse } from "@/lib/server/providers/provider-health";

export async function GET() {
  return NextResponse.json(await buildPortfolioResponse());
}
