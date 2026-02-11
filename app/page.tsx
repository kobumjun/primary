"use client";

import React, { useMemo, useState } from "react";
import PLYViewer from "./ply-viewer";

type JobStatus = "queued" | "running" | "done_sparse" | "done_3dgs" | "failed";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE?.replace(/\/$/, "") || "http://127.0.0.1:8000";

export default function Page() {
  const [files, setFiles] = useState<FileList | null>(null);
  const [jobId, setJobId] = useState<string>("");
  const [status, setStatus] = useState<JobStatus | "">("");
  const [error, setError] = useState<string>("");
  const [plyUrl, setPlyUrl] = useState<string>("");
  const [splatUrl, setSplatUrl] = useState<string>("");

  const canStart = useMemo(() => files && files.length >= 2, [files]);

  async function createJob() {
    setError("");
    setPlyUrl("");
    setSplatUrl("");
    setJobId("");
    setStatus("");

    if (!canStart || !files) {
      setError("사진을 최소 2장 이상 선택해줘.");
      return;
    }

    const form = new FormData();
    Array.from(files).forEach((f) => form.append("files", f));

    const res = await fetch(`${API_BASE}/api/jobs`, {
      method: "POST",
      body: form,
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      setError(`Job 생성 실패: ${res.status} ${txt}`);
      return;
    }

    const data = (await res.json()) as { job_id: string; status: JobStatus };
    setJobId(data.job_id);
    setStatus(data.status);

    pollJob(data.job_id);
  }

  async function pollJob(id: string) {
    setError("");

    const tick = async () => {
      const res = await fetch(`${API_BASE}/api/jobs/${id}`, { cache: "no-store" });
      if (!res.ok) {
        setError(`상태 조회 실패: ${res.status}`);
        return;
      }

      const data = (await res.json()) as {
        job_id: string;
        status: JobStatus;
        points_ply_url?: string | null;
        splat_url?: string | null;
        error?: string | null;
        warning?: string | null;
        hint?: string | null;
      };

      setStatus(data.status);

      if (data.status === "failed") {
        setError(data.error || "failed");
        return;
      }

      if (data.status === "done_sparse" || data.status === "done_3dgs") {
        if (data.points_ply_url) setPlyUrl(`${API_BASE}${data.points_ply_url}`);
        if (data.splat_url) setSplatUrl(`${API_BASE}${data.splat_url}`);
        return; // stop polling
      }

      setTimeout(tick, 1200);
    };

    tick();
  }

  return (
    <main style={{ maxWidth: 980, margin: "0 auto", padding: 24 }}>
      <h1 style={{ fontSize: 28, fontWeight: 900, marginBottom: 6 }}>
        CSRAI DEPLOY CHECK ✅
      </h1>
      <p style={{ opacity: 0.75, marginBottom: 18 }}>
        업로드 → (GPU/로컬) 재구성 → PLY 필수 / SPLAT 선택 → 3D 시연
      </p>

      <div
        style={{
          display: "grid",
          gap: 12,
          padding: 16,
          borderRadius: 12,
          border: "1px solid rgba(0,0,0,0.12)",
          background: "rgba(0,0,0,0.03)",
          marginBottom: 18,
        }}
      >
        <input
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => setFiles(e.target.files)}
        />

        <button
          onClick={createJob}
          disabled={!canStart}
          style={{
            height: 44,
            borderRadius: 10,
            border: "none",
            cursor: canStart ? "pointer" : "not-allowed",
            fontWeight: 900,
          }}
        >
          재구성 시작
        </button>

        <div style={{ display: "grid", gap: 6 }}>
          <div>
            <b>API:</b> {API_BASE}
          </div>
          <div>
            <b>jobId:</b> {jobId || "-"}
          </div>
          <div>
            <b>status:</b> {status || "-"}
          </div>
          {error && <div style={{ color: "crimson" }}>{error}</div>}
        </div>
      </div>

      {splatUrl && (
        <div
          style={{
            marginBottom: 18,
            padding: 12,
            border: "1px dashed rgba(0,0,0,0.25)",
            borderRadius: 12,
          }}
        >
          <b>3DGS SPLAT:</b>{" "}
          <a href={splatUrl} target="_blank" rel="noreferrer">
            {splatUrl}
          </a>
          <div style={{ opacity: 0.7, marginTop: 6 }}>
            (SPLAT 뷰어는 다음 단계에서 붙인다. 지금은 링크만 확인)
          </div>
        </div>
      )}

      {plyUrl ? (
        <>
          <h2 style={{ fontSize: 18, fontWeight: 900, marginBottom: 10 }}>
            3D Point Cloud Viewer (PLY)
          </h2>
          <PLYViewer plyUrl={plyUrl} />
          <p style={{ marginTop: 10, opacity: 0.75 }}>
            다운로드:{" "}
            <a href={plyUrl} target="_blank" rel="noreferrer">
              points.ply
            </a>
          </p>
        </>
      ) : (
        <div style={{ opacity: 0.7 }}>
          아직 points.ply가 없어. “재구성 시작” 누르고 done_sparse / done_3dgs까지 가면 뜬다.
        </div>
      )}
    </main>
  );
}
