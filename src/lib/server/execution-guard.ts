import "server-only";
import { assertServerOnlyOperation } from "@/lib/server/boundary";
import { isKillSwitchActive } from "@/lib/core/config";
import { buildExecuteBlockedResponse } from "@/lib/api/responses";
import { KEY_BLOCK_CODES } from "@/lib/core/key-constants";
import { getKeyReadinessReport } from "@/lib/server/keys/key-service";

export async function getExecutionGuardResponse() {
  assertServerOnlyOperation("execution_approval");

  if (isKillSwitchActive()) {
    return {
      ...buildExecuteBlockedResponse(),
      reason: "EDGEWISE_KILL_SWITCH",
    };
  }

  const readiness = await getKeyReadinessReport();
  if (readiness.blockers.length > 0) {
    return {
      status: "EXECUTION_BLOCKED",
      reason: readiness.blockers[0],
      orderPlaced: false,
    };
  }

  return buildExecuteBlockedResponse();
}

export function assertExecutionServerSide() {
  assertServerOnlyOperation("order_placement");
}

export { KEY_BLOCK_CODES };
