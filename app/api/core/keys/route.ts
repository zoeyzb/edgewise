import { NextResponse } from "next/server";
import {
  disableKeySafe,
  enableKeySafe,
  listKeysSafe,
  removeKeySafe,
  updateKeyLabelSafe,
  upsertKeySafe,
} from "@/lib/server/keys/key-service";
import { sanitizeClientPayload } from "@/lib/server/boundary";
import type { KeyProvider } from "@/lib/core/types";

export async function GET() {
  const payload = await listKeysSafe();
  return NextResponse.json(payload);
}

export async function POST(request: Request) {
  const body = await request.json();

  if (body.generate === true) {
    return NextResponse.json(
      sanitizeClientPayload({
        ok: false,
        code: "PROVIDER_KEYS_MUST_BE_CREATED_IN_PROVIDER_DASHBOARD",
      }),
      { status: 400 }
    );
  }

  const result = await upsertKeySafe({
    id: body.id,
    label: body.label,
    provider: body.provider as KeyProvider,
    value: body.value,
    enabled: body.enabled,
    environment: body.environment,
    generate: body.generate,
  });

  if (!result.ok) {
    return NextResponse.json(sanitizeClientPayload(result), { status: 400 });
  }

  return NextResponse.json(result.key);
}

export async function PATCH(request: Request) {
  const body = await request.json();

  if (body.label && body.id) {
    const result = await updateKeyLabelSafe(body.id, body.label);
    if (!result.ok) {
      return NextResponse.json({ error: result.message }, { status: 404 });
    }
    return NextResponse.json(result.key);
  }

  if (typeof body.enabled === "boolean" && body.id) {
    const result = body.enabled
      ? await enableKeySafe(body.id)
      : await disableKeySafe(body.id);
    if (!result.ok) {
      return NextResponse.json({ error: result.message }, { status: 404 });
    }
    return NextResponse.json(result.key);
  }

  return NextResponse.json({ error: "Unsupported patch" }, { status: 400 });
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }
  const result = await removeKeySafe(id);
  return NextResponse.json({ removed: result.ok });
}
