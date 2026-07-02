import { NextResponse } from "next/server";
import { buildCoreHealthResponse, buildHealthSnapshot } from "@/lib/api/responses";
import { getAppConfigReport } from "@/lib/core/config";
import { getEncryptionMode } from "@/lib/server/crypto";
import { getKeyReadinessReport } from "@/lib/server/keys/key-service";
import { buildProviderHealthReport } from "@/lib/server/providers/provider-health";

export async function GET() {
  const [health, readiness, config, providers] = await Promise.all([
    buildHealthSnapshot(),
    getKeyReadinessReport(),
    Promise.resolve(getAppConfigReport()),
    buildProviderHealthReport(),
  ]);

  return NextResponse.json({
    ...buildCoreHealthResponse(),
    ...health,
    encryptionMode: getEncryptionMode(),
    killSwitchActive: config.killSwitchActive,
    realMoneyTradingEnabled: config.realMoneyTradingEnabled,
    keyReadiness: {
      kalshiDemoConfigured: readiness.kalshiDemoConfigured,
      kalshiProdConfigured: readiness.kalshiProdConfigured,
      oddsConfigured: readiness.oddsConfigured,
      blockers: readiness.blockers,
    },
    envConfig: {
      secretSafety: config.secretSafety,
      encryptionKeyState: config.encryptionKeyState,
    },
    providers,
    healthColors: {
      executionReadiness: providers.executionReadiness,
      note: providers.executionReadinessNote,
    },
  });
}
