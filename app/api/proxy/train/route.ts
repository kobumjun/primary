export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

function upstreamBase() {
  const u = process.env.CSRAI_UPSTREAM || process.env.NEXT_PUBLIC_API_BASE || "";
  return u.replace(/\/$/, "");
}

export async function POST(req: Request) {
  const upstream = upstreamBase();
  if (!upstream) {
    return NextResponse.json(
      { detail: "CSRAI_UPSTREAM env is missing" },
      { status: 500 }
    );
  }

  const form = await req.formData();

  const res = await fetch(`${upstream}/api/train`, {
    method: "POST",
    body: form,
  });

  const buf = await res.arrayBuffer();
  return new NextResponse(buf, {
    status: res.status,
    headers: {
      "content-type": res.headers.get("content-type") || "application/json",
      "cache-control": "no-store",
    },
  });
}
