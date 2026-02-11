export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

function upstreamBase() {
  const u = process.env.CSRAI_UPSTREAM || process.env.NEXT_PUBLIC_API_BASE || "";
  return u.replace(/\/$/, "");
}

export async function GET(req: Request, context: any) {
  const upstream = upstreamBase();
  if (!upstream) {
    return NextResponse.json({ detail: "CSRAI_UPSTREAM env is missing" }, { status: 500 });
  }

  const params = await context?.params; // Next가 Promise로 줄 수도 있음
  const jobId = params?.jobId;

  if (!jobId) {
    return NextResponse.json({ detail: "jobId missing" }, { status: 400 });
  }

  const res = await fetch(`${upstream}/api/jobs/${jobId}`, { method: "GET" });
  const buf = await res.arrayBuffer();

  return new NextResponse(buf, {
    status: res.status,
    headers: {
      "content-type": res.headers.get("content-type") || "application/json",
      "cache-control": "no-store",
    },
  });
}
