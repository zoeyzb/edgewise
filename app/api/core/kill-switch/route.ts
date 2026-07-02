import { NextResponse } from "next/server";
import { getAppConfigReport } from "@/lib/core/config";
import {
  getAppKillSwitch,
  isStorageHealthy,
  setAppKillSwitch,
} from "@/lib/server/risk/risk-store";
import { isKillSwitchEngaged } from "@/lib/server/execution/manual-execution";

export async function GET() {
  const config = getAppConfigReport();
  const appKill = await getAppKillSwitch();
  const engaged = await isKillSwitchEngaged();
  const storageOk = await isStorageHealthy();

  return NextResponse.json({
    engaged,
    envKillSwitch: config.killSwitchActive,
    appKillSwitch: appKill,
    blockCode: engaged ? "BLOCKED — KILL_SWITCH_ENABLED" : null,
    storageHealthy: storageOk,
    message: engaged
      ? "Kill switch ON — all real order placement blocked"
      : "Kill switch OFF — execution still requires all per-trade gates",
  });
}

export async function POST(request: Request) {
  const body = await request.json();
  if (typeof body.enabled === "boolean") {
    await setAppKillSwitch(body.enabled);
  }
  const engaged = await isKillSwitchEngaged();
  return NextResponse.json({
    engaged,
    appKillSwitch: await getAppKillSwitch(),
    blockCode: engaged ? "BLOCKED — KILL_SWITCH_ENABLED" : null,
  });
}
