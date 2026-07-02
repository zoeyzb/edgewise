import { NextResponse } from "next/server";
import { buildAutoEngineResponse, handleAutoAction } from "@/lib/server/auto/auto-engine";
import { updateAppState } from "@/lib/storage/store";
import type { AutoLevel, ExecutionMode } from "@/lib/core/types";

export async function GET() {
  return NextResponse.json(await buildAutoEngineResponse());
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));

  if (body.action) {
    await handleAutoAction(String(body.action));
  }

  const patch: { executionMode?: ExecutionMode; autoLevel?: AutoLevel } = {};
  if (body.executionMode) patch.executionMode = body.executionMode;
  if (body.autoLevel) patch.autoLevel = body.autoLevel;

  if (Object.keys(patch).length > 0) {
    await updateAppState(patch);
  }

  return NextResponse.json(await buildAutoEngineResponse());
}
