"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

type Props = {
  plyUrl: string;
};

type PlyData = {
  positions: Float32Array;
  colors?: Uint8Array; // RGB
};

function parsePLY(text: string): PlyData {
  // ASCII PLY only (fast & enough for MVP)
  const lines = text.split(/\r?\n/);
  if (!lines[0]?.startsWith("ply")) throw new Error("Not a PLY file");

  let i = 0;
  let vertexCount = 0;
  let hasColor = false;

  // header
  for (; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith("element vertex")) {
      const parts = line.split(/\s+/);
      vertexCount = parseInt(parts[2] || "0", 10);
    }
    if (line === "property uchar red") hasColor = true;
    if (line === "end_header") {
      i++;
      break;
    }
  }

  if (!vertexCount) throw new Error("PLY vertex count not found");

  const pos = new Float32Array(vertexCount * 3);
  const col = hasColor ? new Uint8Array(vertexCount * 3) : undefined;

  let v = 0;
  for (; i < lines.length && v < vertexCount; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const parts = line.split(/\s+/);
    if (parts.length < 3) continue;

    const x = Number(parts[0]);
    const y = Number(parts[1]);
    const z = Number(parts[2]);

    pos[v * 3 + 0] = x;
    pos[v * 3 + 1] = y;
    pos[v * 3 + 2] = z;

    if (col && parts.length >= 6) {
      col[v * 3 + 0] = Math.max(0, Math.min(255, Number(parts[3]) || 0));
      col[v * 3 + 1] = Math.max(0, Math.min(255, Number(parts[4]) || 0));
      col[v * 3 + 2] = Math.max(0, Math.min(255, Number(parts[5]) || 0));
    }
    v++;
  }

  return { positions: pos, colors: col };
}

export default function PLYViewer({ plyUrl }: Props) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const [err, setErr] = useState<string>("");

  const size = useMemo(() => ({ w: 920, h: 560 }), []);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        setErr("");
        const res = await fetch(plyUrl, { cache: "no-store" });
        if (!res.ok) throw new Error(`Failed to fetch PLY: ${res.status}`);
        const text = await res.text();
        const data = parsePLY(text);
        if (cancelled) return;

        const mount = mountRef.current;
        if (!mount) return;

        // cleanup old renderer
        if (rendererRef.current) {
          rendererRef.current.dispose();
          rendererRef.current = null;
          mount.innerHTML = "";
        }

        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0xffffff);

        const camera = new THREE.PerspectiveCamera(60, size.w / size.h, 0.01, 5000);
        camera.position.set(0, 0, 2);

        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(size.w, size.h);
        rendererRef.current = renderer;
        mount.appendChild(renderer.domElement);

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.BufferAttribute(data.positions, 3));

        if (data.colors) {
          const colors = new Float32Array(data.colors.length);
          for (let i = 0; i < data.colors.length; i++) colors[i] = data.colors[i] / 255;
          geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
        }

        geometry.computeBoundingSphere();

        const material = new THREE.PointsMaterial({
          size: 0.008,
          vertexColors: Boolean(data.colors),
          color: data.colors ? undefined : new THREE.Color(0x111111),
        });

        const points = new THREE.Points(geometry, material);
        scene.add(points);

        // fit camera
        const bs = geometry.boundingSphere;
        if (bs) {
          const radius = Math.max(bs.radius, 1e-6);
          const dist = radius / Math.tan((camera.fov * Math.PI) / 360);
          camera.position.set(bs.center.x, bs.center.y, bs.center.z + dist * 1.2);
          camera.lookAt(bs.center);
        }

        // super simple orbit (drag rotate)
        let isDown = false;
        let lastX = 0;
        let lastY = 0;
        let yaw = 0;
        let pitch = 0;

        const onDown = (e: PointerEvent) => {
          isDown = true;
          lastX = e.clientX;
          lastY = e.clientY;
          (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        };
        const onUp = () => {
          isDown = false;
        };
        const onMove = (e: PointerEvent) => {
          if (!isDown) return;
          const dx = e.clientX - lastX;
          const dy = e.clientY - lastY;
          lastX = e.clientX;
          lastY = e.clientY;
          yaw += dx * 0.005;
          pitch += dy * 0.005;
          pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, pitch));

          const bs2 = geometry.boundingSphere;
          if (!bs2) return;
          const r = camera.position.distanceTo(bs2.center);

          const x = bs2.center.x + r * Math.cos(pitch) * Math.sin(yaw);
          const y = bs2.center.y + r * Math.sin(pitch);
          const z = bs2.center.z + r * Math.cos(pitch) * Math.cos(yaw);
          camera.position.set(x, y, z);
          camera.lookAt(bs2.center);
        };

        renderer.domElement.addEventListener("pointerdown", onDown);
        window.addEventListener("pointerup", onUp);
        window.addEventListener("pointermove", onMove);

        const animate = () => {
          if (cancelled) return;
          renderer.render(scene, camera);
          requestAnimationFrame(animate);
        };
        animate();

        // resize (optional)
        const ro = new ResizeObserver(() => {
          if (!mountRef.current || !rendererRef.current) return;
        });
        ro.observe(mount);

        return () => {
          ro.disconnect();
          renderer.domElement.removeEventListener("pointerdown", onDown);
          window.removeEventListener("pointerup", onUp);
          window.removeEventListener("pointermove", onMove);
        };
      } catch (e: any) {
        setErr(e?.message || String(e));
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [plyUrl, size.h, size.w]);

  return (
    <div style={{ display: "grid", gap: 8 }}>
      {err && <div style={{ color: "crimson" }}>{err}</div>}
      <div
        ref={mountRef}
        style={{
          width: "100%",
          maxWidth: size.w,
          height: size.h,
          borderRadius: 12,
          border: "1px solid rgba(0,0,0,0.12)",
          overflow: "hidden",
          background: "#fff",
        }}
      />
      <div style={{ opacity: 0.7, fontSize: 13 }}>
        드래그: 회전
      </div>
    </div>
  );
}
