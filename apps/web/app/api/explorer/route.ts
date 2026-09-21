import { NextResponse } from "next/server";
import { getExplorer, ApiError } from "@/lib/api";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    return NextResponse.json(await getExplorer(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof ApiError ? e.message : "Explorer unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
