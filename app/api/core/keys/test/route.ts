import { NextResponse } from "next/server";
import { testKalshiPairSafe, testKeySafe } from "@/lib/server/keys/key-service";
import { sanitizeClientPayload } from "@/lib/server/boundary";

export async function POST(request: Request) {
  const body = await request.json();

  if (body.pair === "demo" || body.pair === "prod") {
    const result = await testKalshiPairSafe(body.pair);
    return NextResponse.json(
      sanitizeClientPayload({
        ok: result.ok,
        status: result.status,
        message: result.message,
        errorCategory: result.errorCategory ?? null,
        quotaStatus: result.quotaStatus ?? null,
        environment: result.environment ?? body.pair,
        pairStatus: result.pairStatus ?? null,
      })
    );
  }

  if (!body.id) {
    return NextResponse.json({ error: "Missing id or pair" }, { status: 400 });
  }

  const result = await testKeySafe(body.id);
  return NextResponse.json(
    sanitizeClientPayload({
      ok: result.ok,
      status: result.status,
      message: result.message,
      errorCategory: result.errorCategory ?? null,
      quotaStatus: result.quotaStatus ?? null,
    })
  );
}
