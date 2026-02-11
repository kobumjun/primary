"use client";

import React, { useMemo, useState, useEffect } from "react";
import PLYViewer from "./ply-viewer";

type StatusType = "queued" | "running" | "done" | "failed" | "";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE?.replace(/\/$/, "") || "";

export default function Page() {
  const [files, setFiles] = useState<FileList | null>(null);
  const [jobId, setJobId] = useState<string>("");
  const [status, setStatus] = useState<StatusType>("");
  const [error, setError] = useState<string>("");
  const [plyUrl, setPlyUrl] = useState<string>("");

  const canStart = useMemo(() => files && files.length >= 2, [files]);

  async function startTrain() {
    if (!API_BASE) {
      setError("NEXT_PUBLIC_API_BASE 설정 안됨");
      return;
    }

    if (!canStart || !files) {
      setError("이미지 최소 2장 필요");
      return;
    }

    setError("");
    setStatus("");
    setJobId("");
    setPlyUrl("");

    const form = new FormData();
    Array.from(files).forEach((f) => form.append("files", f));

    try {
      const res = await fetch(`${API_BASE}/train`, {
        method: "POST",
        body: form,
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text);
      }

      const data = await res.json();
      setJobId(data.job_id);
      setStatus("queued");
    } catch (err: any) {
      setError("train 요청 실패: " + err.message);
    }
  }

  useEffect(() => {
    if (!jobId) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/status/${jobId}`);
        if (!res.ok) return;

        const data = await res.json();
        setStatus(data.status);

        if (data.status === "done") {
          clearInterval(interval);
          setPlyUrl(`${API_BASE}/download/${jobId}`);
        }

        if (data.status === "failed") {
          clearInterval(interval);
        }
      } catch (e) {}
    }, 3000);

    return () => clearInterval(interval);
  }, [jobId]);

  return (
    <main style={{ padding: 40 }}>
      <h1>CSRAI TRAIN TEST ��</h1>

      <input
        type="file"
        multiple
        accept="image/*"
        onChange={(e) => setFiles(e.target.files)}
      />

      <br />
      <br />

      <button onClick={startTrain} disabled={!canStart}>
        재구성 시작
      </button>

      {error && (
        <div style={{ color: "red", marginTop: 20 }}>
          {error}
        </div>
      )}

      {jobId && (
        <div style={{ marginTop: 20 }}>
          <div>Job ID: {jobId}</div>
          <div>Status: {status}</div>
        </div>
      )}

      {plyUrl && (
        <div style={{ marginTop: 40 }}>
          <h3>PLY Viewer</h3>
          <PLYViewer plyUrl={plyUrl} />
        </div>
      )}
    </main>
  );
}
