"use client";

export const dynamic = "force-dynamic";

import React, { useEffect, useMemo, useState } from "react";
import JSZip from "jszip";
import PLYViewer from "./ply-viewer";

type AnyObj = Record<string, any>;

const UPSTREAM_HINT =
  (process.env.NEXT_PUBLIC_API_BASE || "").replace(/\/$/, "") ||
  "(set NEXT_PUBLIC_API_BASE optional)";

// ✅ 브라우저는 같은 도메인(=Vercel)만 호출한다. CORS 회피.
const PROXY_BASE = "/api/proxy";

export default function Page() {
  const [files, setFiles] = useState<FileList | null>(null);

  const [isUploading, setIsUploading] = useState(false);
  const [isPolling, setIsPolling] = useState(true);

  const [jobId, setJobId] = useState<string>("");
  const [statusJson, setStatusJson] = useState<AnyObj | null>(null);
  const [error, setError] = useState<string>("");

  const canStart = useMemo(() => !!files && files.length >= 2, [files]);

  const plyUrl = useMemo(() => {
    if (!jobId) return "";
    // ✅ ply도 프록시로
    return `${PROXY_BASE}/jobs/${jobId}/gaussians.ply`;
  }, [jobId]);

  async function buildZipBlob(selected: FileList): Promise<Blob> {
    const zip = new JSZip();
    const arr = Array.from(selected).sort((a, b) => a.name.localeCompare(b.name));

    for (let i = 0; i < arr.length; i++) {
      const f = arr[i];
      const ext = (f.name.split(".").pop() || "jpg").toLowerCase();
      const safeExt = ["jpg", "jpeg", "png", "webp"].includes(ext) ? ext : "jpg";
      const fname = String(i).padStart(3, "0") + "." + safeExt;
      zip.file(fname, f);
    }

    return await zip.generateAsync({ type: "blob" });
  }

  async function startTrain() {
    setError("");
    setStatusJson(null);
    setJobId("");

    if (!files || files.length < 2) {
      setError("이미지 최소 2장 필요");
      return;
    }

    setIsUploading(true);
    try {
      const zipBlob = await buildZipBlob(files);

      const form = new FormData();
      form.append("images_zip", zipBlob, "images.zip");

      const res = await fetch(`${PROXY_BASE}/train`, {
        method: "POST",
        body: form,
      });

      const text = await res.text();
      let data: AnyObj = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        throw new Error(`train 응답이 JSON이 아님: ${text.slice(0, 200)}`);
      }

      if (!res.ok) {
        const msg = data?.detail
          ? typeof data.detail === "string"
            ? data.detail
            : JSON.stringify(data.detail)
          : JSON.stringify(data);
        throw new Error(`train 실패 (${res.status}): ${msg}`);
      }

      const jid = data.job_id || data.jobId || data.id;
      if (!jid) throw new Error(`job_id를 못 받음: ${JSON.stringify(data)}`);

      setJobId(String(jid));
      setStatusJson(data);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setIsUploading(false);
    }
  }

  async function fetchStatus(jid: string) {
    const res = await fetch(`${PROXY_BASE}/jobs/${jid}`, { method: "GET" });
    const text = await res.text();

    let data: AnyObj = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { raw: text };
    }

    if (!res.ok) {
      const msg = data?.detail
        ? typeof data.detail === "string"
          ? data.detail
          : JSON.stringify(data.detail)
        : JSON.stringify(data);
      throw new Error(`status 실패 (${res.status}): ${msg}`);
    }

    return data;
  }

  useEffect(() => {
    let timer: any;

    async function tick() {
      if (!isPolling) return;
      if (!jobId) return;

      try {
        const data = await fetchStatus(jobId);
        setStatusJson(data);
      } catch (e: any) {
        setError(e?.message || String(e));
      }
    }

    if (isPolling && jobId) {
      tick();
      timer = setInterval(tick, 2500);
    }

    return () => timer && clearInterval(timer);
  }, [isPolling, jobId]);

  return (
    <main style={{ padding: 32, maxWidth: 980, margin: "0 auto" }}>
      <h1 style={{ fontSize: 26, fontWeight: 800, marginBottom: 8 }}>
        CSRAI TRAIN TEST 🧪
      </h1>

      <div style={{ marginTop: 14 }}>
        <input
          type="file"
          multiple
          accept="image/*"
          onChange={(e) => setFiles(e.target.files)}
        />
        <div style={{ marginTop: 8, color: "#666" }}>
          {files?.length ? `${files.length}개 파일 선택됨` : "선택한 파일 없음"}
        </div>
      </div>

      <div style={{ marginTop: 16 }}>
        <button
          onClick={startTrain}
          disabled={!canStart || isUploading}
          style={{
            padding: "10px 14px",
            borderRadius: 10,
            border: "1px solid #ddd",
            cursor: !canStart || isUploading ? "not-allowed" : "pointer",
            fontWeight: 700,
          }}
        >
          {isUploading ? "업로드/zip 생성 중..." : "재구성 시작 (train)"}
        </button>

        <label style={{ marginLeft: 14, userSelect: "none" }}>
          <input
            type="checkbox"
            checked={isPolling}
            onChange={(e) => setIsPolling(e.target.checked)}
            disabled={!jobId}
            style={{ marginRight: 8 }}
          />
          자동 폴링 (2.5s)
        </label>

        <button
          onClick={async () => {
            if (!jobId) return;
            setError("");
            try {
              const data = await fetchStatus(jobId);
              setStatusJson(data);
            } catch (e: any) {
              setError(e?.message || String(e));
            }
          }}
          disabled={!jobId}
          style={{
            padding: "10px 14px",
            marginLeft: 10,
            borderRadius: 10,
            border: "1px solid #ddd",
            cursor: !jobId ? "not-allowed" : "pointer",
            fontWeight: 700,
          }}
        >
          상태 1회 체크
        </button>
      </div>

      <div style={{ marginTop: 14, color: "#444" }}>
        <div>
          <b>Upstream hint:</b> {UPSTREAM_HINT}
        </div>
        <div>
          <b>Proxy:</b> {PROXY_BASE}
        </div>
        <div>
          <b>jobId:</b> {jobId || "-"}
        </div>
      </div>

      {error && (
        <div style={{ marginTop: 14, color: "#b91c1c", fontWeight: 700 }}>
          {error}
        </div>
      )}

      {statusJson && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontWeight: 800, marginBottom: 8 }}>status json</div>
          <pre
            style={{
              padding: 12,
              border: "1px solid #eee",
              borderRadius: 12,
              background: "#fafafa",
              overflow: "auto",
              maxHeight: 240,
              fontSize: 12,
              lineHeight: 1.4,
            }}
          >
            {JSON.stringify(statusJson, null, 2)}
          </pre>
        </div>
      )}

      {jobId && (
        <div style={{ marginTop: 24 }}>
          <div style={{ fontWeight: 800, marginBottom: 8 }}>
            3D Preview (gaussians.ply)
          </div>
          <div style={{ marginBottom: 10, fontSize: 13, color: "#555" }}>
            ply URL:
            <div style={{ fontFamily: "monospace" }}>{plyUrl}</div>
          </div>
          <PLYViewer plyUrl={plyUrl} />
        </div>
      )}
    </main>
  );
}
