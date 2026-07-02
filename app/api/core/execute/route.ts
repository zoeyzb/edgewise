import { NextResponse } from "next/server";
import { executeManualOrder } from "@/lib/server/execution/manual-execution";
import { getManualExecutionStatus } from "@/lib/server/execution/manual-execution";

export async function POST(request: Request) {
  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const opportunityId =
    typeof body.opportunityId === "string" ? body.opportunityId : null;

  if (!opportunityId) {
    return NextResponse.json({
      status: "EXECUTION_BLOCKED",
      reason: "Server-known opportunityId required — browser stake/price/side ignored",
      failedGate: "OPPORTUNITY_NOT_FOUND",
      orderPlaced: false,
    });
  }

  const result = await executeManualOrder({ opportunityId });
  return NextResponse.json(result);
}

export async function GET() {
  const status = await getManualExecutionStatus();
  return NextResponse.json({
    status: status.enabled ? "MANUAL_EXECUTION_READY" : "EXECUTION_BLOCKED",
    ...status,
    orderPlaced: false,
    note: "POST with { opportunityId } only — all values recalculated server-side",
  });
}
