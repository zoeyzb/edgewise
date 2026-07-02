import { NextResponse } from "next/server";
import { buildRiskResponse } from "@/lib/api/responses";
import { updateAppState } from "@/lib/storage/store";
import type { StakeSettings } from "@/lib/core/types";

export async function GET() {
  return NextResponse.json(await buildRiskResponse());
}

export async function POST(request: Request) {
  const body = await request.json();
  if (body.stakeSettings) {
    await updateAppState({
      stakeSettings: body.stakeSettings as StakeSettings,
    });
  }
  return NextResponse.json(await buildRiskResponse());
}
