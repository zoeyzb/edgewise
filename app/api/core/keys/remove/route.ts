import { NextResponse } from "next/server";
import { removeKeySafe } from "@/lib/server/keys/key-service";

export async function POST(request: Request) {
  const body = await request.json();
  if (!body.id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }
  const result = await removeKeySafe(body.id);
  return NextResponse.json({ removed: result.ok });
}
