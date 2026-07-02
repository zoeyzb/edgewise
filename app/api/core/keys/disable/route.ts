import { NextResponse } from "next/server";
import { disableKeySafe } from "@/lib/server/keys/key-service";
import { sanitizeClientPayload } from "@/lib/server/boundary";

export async function POST(request: Request) {
  const body = await request.json();
  if (!body.id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }
  const result = await disableKeySafe(body.id);
  if (!result.ok) {
    return NextResponse.json({ error: result.message }, { status: 404 });
  }
  return NextResponse.json(sanitizeClientPayload({ ok: true, key: result.key }));
}
