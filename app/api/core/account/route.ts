import { NextResponse } from "next/server";
import { buildAccountResponse } from "@/lib/api/responses";

export async function GET() {
  return NextResponse.json(await buildAccountResponse());
}
