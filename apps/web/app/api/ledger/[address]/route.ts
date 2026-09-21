import { NextRequest, NextResponse } from "next/server";
export const dynamic = "force-dynamic";
/** Read-only same-origin relay. The browser never receives a database URL or credential. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ address: string }> },
) {
  const { address } = await params;
  if (!/^0x[0-9a-fA-F]{40}$/.test(address))
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  const cursor = request.nextUrl.searchParams.get("cursor"),
    limit = request.nextUrl.searchParams.get("limit") ?? "20";
  if (
    (cursor && cursor.length > 1024) ||
    !/^\d{1,3}$/.test(limit) ||
    Number(limit) < 1 ||
    Number(limit) > 100
  )
    return NextResponse.json({ error: "Invalid pagination" }, { status: 400 });
  const query = new URLSearchParams({ limit });
  if (cursor !== null) query.set("cursor", cursor);
  try {
    const base =
      process.env.API_URL ??
      process.env.NEXT_PUBLIC_API_URL ??
      "http://127.0.0.1:3001";
    const response = await fetch(
      `${base}/v1/address/${address.toLowerCase()}/ledger?${query}`,
      { cache: "no-store", signal: AbortSignal.timeout(20000) },
    );
    const body = await response.json();
    const headers: Record<string, string> = { "Cache-Control": "no-store" };
    const retry = response.headers.get("Retry-After");
    if (retry) headers["Retry-After"] = retry;
    return NextResponse.json(body, { status: response.status, headers });
  } catch {
    return NextResponse.json(
      { error: "Ledger service unavailable. Try again." },
      { status: 503 },
    );
  }
}
