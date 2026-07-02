import { NextResponse } from "next/server";
import { buildBacktestingStatusResponse } from "@/lib/server/backtesting/backtest-status";

export async function GET() {
  return NextResponse.json(await buildBacktestingStatusResponse());
}
