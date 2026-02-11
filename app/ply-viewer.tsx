"use client";

import React, { useEffect, useRef, useState } from "react";

/**
 * Minimal placeholder viewer.
 * 기존에 three.js/ply 로더 쓰던 코드가 있으면, 그 안에서 url만 이 prop으로 받아서 쓰면 됨.
 */
export default function PLYViewer({ url }: { url: string }) {
  const [msg, setMsg] = useState<string>("");

  useEffect(() => {
    if (!url) return;
    setMsg(`PLY loaded url: ${url}`);
  }, [url]);

  return (
    <div
      style={{
        width: "100%",
        minHeight: 240,
        border: "1px solid #eee",
        borderRadius: 12,
        padding: 12,
        background: "#fafafa",
        overflow: "auto",
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 8 }}>PLYViewer</div>
      <div style={{ fontFamily: "monospace", fontSize: 12, whiteSpace: "pre-wrap" }}>{msg}</div>
      <div style={{ marginTop: 10, color: "#666" }}>
        (여기에 기존 3D 렌더링 코드가 있으면 url만 prop으로 받아서 로드하도록 연결하면 됨)
      </div>
    </div>
  );
}
