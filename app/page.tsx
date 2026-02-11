"use client";

export const dynamic = "force-dynamic";

import React, { useEffect, useMemo, useState } from "react";
import JSZip from "jszip";
import PLYViewer from "./ply-viewer";

type JobStatus = "queued" | "running" | "done_sparse" | "done_3dgs" | "failed";

type AnyObj = Record<string, any>;

const API_BASE =
  (process.env.NEXT_PUBLIC_API_BASE || "").replace(/\/$/, "") ||
  "http://127.0.0.1:8000";

async function zipImages(files: FileList): Promise<Blob> {
  const zip = new JSZip();
  Array.from(files).forEach((f, i) => {
    const ext = (f.name.split(".").pop() || "jpg").toLowerCase();
    zip.file(`img_${String(i).padStart(3, "0")}.${ext}`, f);
  });

  // 압축은 CPU/시간만 잡아먹어서 STORE 권장 (서버가 어차피 받기만 하면 됨)
  return await zip.generateAsync({ type: "blob", compression: "STORE" });
}

export default function Page() {
  const [files, setFiles] = useState<FileList | null>(null);

  const [jobId, setJobId] = useState<string>("");
  const [status, setStatus] = useState<JobStatus | "">("");
  const [statusJson, setStatusJson] = useState<AnyObj | null>(null);

  const [isUploading, setIsUploading] = useState(false);
  const [isPolling, setIsPolling] = useState(true);

  const [error, setError] = useState<string>("");

  const plyUrl = useMemo(() => {
    if (!jobId) return "";
    return `${API_BASE}/api/jobs/${jobId}/gaussians.ply`;
  }, [jobId]);

  const canStart = useMemo(() => !!files && files.length >= 2, [files]);

  async function startTrain() {
    setError("");
    setJobId("");
    setStatus("");
    setStatusJson(null);

    if (!files || !canStart) {
      setError("사진을 최소 2장 이상 선택해줘.");
      return;
    }

    try {
      setIsUploading(true);

      // 1) zip 생성
      const zipBlob = await zipImages(files);

      // 2) Runpod FastAPI 스펙: multipart/form-data with images_zip
      const form = new FormData();
      form.append("images_zip", zipBlob, "images.zip");

      const res = await fetch(`${API_BASE}/api/train`, {
        method: "POST",
        body: form,
      });

      const text = await res.text();
      let data: AnyObj;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(`train 응답이 JSON이 아님: ${text.slice(0, 200)}`);
      }

      if (!res.ok) {
        throw new Error(`train 실패 ${res.status}: ${JSON.stringify(data)}`);
      }

      const id = data.job_id || data.jobId || data.id;
      if (!id) {
        throw new Error(`train 응답에 job_id 없음: ${JSON.stringify(data)}`);
      }

      setJobId(String(id));
      setStatus(String(data.status || "queued") as any);
      setStatusJson(data);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setIsUploading(false);
    }
  }

  async function checkOnce() {
    if (!jobId) return;
    setError("");

    try {
      const res = await fetch(`${API_BASE}/api/jobs/${jobId}`, { method: "GET" });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(`status 실패 ${res.status}: ${JSON.stringify(data)}`);
      }

      setStatusJson(data);
      if (data.status) setStatus(data.status);

      // done이면 자동으로 plyUrl이 활성화됨
    } catch (e: any) {
      setError(e?.message || String(e));
    }
  }

  useEffect(() => {
    if (!isPolling || !jobId) return;

    const t = setInterval(() => {
      checkOnce();
    }, 2500);

    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPolling, jobId]);

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: 24, fontFamily: "system-ui" }}>
      <h1 style={{ fontSize: 28, marginBottom: 6 }}>CSRAI TRAIN TEST 🧪</h1>
      <div style={{ color: "#666", marginBottom: 18 }}>
        업로드(직접 Runpod) → /api/train → job 생성 → /api/jobs/&lt;id&gt; 폴링 → gaussians.ply
      </div>

      <div style={{ border: "1px solid #eee", borderRadius: 12, padding: 16 }}>
        <div style={{ marginBottom: 12 }}>
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => setFiles(e.target.files)}
          />
          <div style={{ marginTop: 8, color: "#444" }}>
            {files ? `${files.length}개 파일 선택됨` : "파일 선택 안 됨"}
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <button
            onClick={startTrain}
            disabled={!canStart || isUploading}
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              border: "1px solid #ddd",
              background: isUploading ? "#f5f5f5" : "white",
              cursor: isUploading ? "not-allowed" : "pointer",
              fontWeight: 700,
            }}
          >
            {isUploading ? "업로드/요청 중..." : "재구성 시작 (train)"}
          </button>

          <label style={{ display: "flex", gap: 8, alignItems: "center", color: "#333" }}>
            <input
              type="checkbox"
              checked={isPolling}
              onChange={(e) => setIsPolling(e.target.checked)}
              disabled={!jobId}
            />
            자동 폴링 (2.5s)
          </label>

          <button
            onClick={checkOnce}
            disabled={!jobId}
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              border: "1px solid #ddd",
              background: "white",
              cursor: !jobId ? "not-allowed" : "pointer",
              fontWeight: 700,
            }}
          >
            상태 1회 체크
          </button>
        </div>

        <div style={{ marginTop: 14, lineHeight: 1.7 }}>
          <div><b>API:</b> {API_BASE}</div>
          <div><b>jobId:</b> {jobId || "-"}</div>
          <div><b>status:</b> {status || "-"}</div>
        </div>

        {error && (
          <div style={{ marginTop: 14, color: "#b91c1c", fontWeight: 700, whiteSpace: "pre-wrap" }}>
            {error}
          </div>
        )}

        {statusJson && (
          <div style={{ marginTop: 14 }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>status json</div>
            <pre style={{ background: "#fafafa", border: "1px solid #eee", padding: 12, borderRadius: 10, overflowX: "auto" }}>
              {JSON.stringify(statusJson, null, 2)}
            </pre>
          </div>
        )}

        {!!plyUrl && (status === "done_sparse" || status === "done_3dgs") && (
          <div style={{ marginTop: 14 }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>PLY</div>
            <div style={{ marginBottom: 8 }}>
              <a href={plyUrl} target="_blank" rel="noreferrer">
                gaussians.ply 열기/다운로드
              </a>
            </div>
            <PLYViewer url={plyUrl} />
          </div>
        )}
      </div>

      <div style={{ marginTop: 14, color: "#666" }}>
        ⚠️ Vercel /api/proxy 같은 서버리스 경유 업로드는 “FUNCTION_PAYLOAD_TOO_LARGE”로 터짐 → 반드시 Runpod로 직접 업로드.
      </div>
    </main>
  );
}
