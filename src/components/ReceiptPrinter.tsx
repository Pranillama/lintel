"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { IBM_Plex_Mono, Poppins } from "next/font/google";
import * as THREE from "three";
import type { BillsResponse } from "@/types/bill";
import { buildReceiptLines, sectionAt } from "./receipt/receiptLines";
import { drawReceipt, PAPER_WIDTH_PX, type DrawnReceipt } from "./receipt/drawReceipt";

const mono = IBM_Plex_Mono({ weight: ["500", "600", "700"], subsets: ["latin"], display: "swap" });
const display = Poppins({ weight: ["400", "500", "600"], subsets: ["latin"], display: "swap" });

/** Bento Lime: dark neutrals plus three light colors. Lime only ever means "needs you". */
const C = { bar: "#0A0A0A", raised: "#262626", paper: "#F2F1EC", muted: "#8C8C86", lime: "#C8F25A" };

export interface ReceiptPrinterProps {
  /** Result of `useQuery(api.bills.queries.listBills)`. `undefined` while loading. */
  response: BillsResponse | undefined;
  /** Scroll distance that prints the whole tab. */
  trackHeight?: string;
  /** When set, the end of the tab offers "Open the AP desk" (the landing page scrolls to the desk). */
  onOpenDesk?: () => void;
}

interface SceneApi {
  setReceipt(r: DrawnReceipt): void;
  dispose(): void;
}

/**
 * Scroll-driven thermal printer. Scrolling through the track feeds the tab out of the printer
 * line by line. Every line comes from `buildReceiptLines(response)`; nothing is hard-coded.
 */
export function ReceiptPrinter({ response, trackHeight = "900vh", onOpenDesk }: ReceiptPrinterProps) {
  const trackRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const fallbackRef = useRef<HTMLDivElement>(null);
  const captionRef = useRef<HTMLSpanElement>(null);
  const countRef = useRef<HTMLSpanElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);
  const hintRef = useRef<HTMLDivElement>(null);
  const [ended, setEnded] = useState(false);
  const apiRef = useRef<SceneApi | null>(null);
  const receiptRef = useRef<DrawnReceipt | null>(null);

  const lines = useMemo(() => (response ? buildReceiptLines(response) : null), [response]);
  const linesRef = useRef(lines);
  useEffect(() => { linesRef.current = lines; }, [lines]);

  // Progress through the scroll track, 0..1.
  const progress = () => {
    const el = trackRef.current;
    if (!el) return 0;
    const r = el.getBoundingClientRect();
    const span = r.height - window.innerHeight;
    return span > 0 ? Math.min(1, Math.max(0, -r.top / span)) : 0;
  };

  // HUD is written straight to the DOM each frame so React does not re-render 60 times a second.
  const updateHud = (p: number, printedPx: number) => {
    const receipt = receiptRef.current;
    const ls = linesRef.current;
    let printed = 0;
    if (receipt) for (const t of receipt.tops) if (t < printedPx) printed++;
    if (countRef.current) countRef.current.textContent = ls ? `${printed} / ${ls.length}` : "—";
    if (fillRef.current) fillRef.current.style.height = `${(p * 100).toFixed(1)}%`;
    if (hintRef.current) hintRef.current.style.opacity = p > 0.02 ? "0" : "1";
    if (captionRef.current) {
      const text = !ls ? "Warming up the printer…" : printed === 0 ? "Closing out?" : sectionAt(ls, printed - 1) ?? "Closing out?";
      if (captionRef.current.textContent !== text) captionRef.current.textContent = text;
    }
    const done = p > 0.985;
    setEnded((prev) => (prev === done ? prev : done));
  };

  // Build the 3D scene once.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true });
    } catch {
      // No WebGL: show the flat receipt and reveal it with scroll instead.
      const box = fallbackRef.current;
      if (box) box.hidden = false;
      const tick = () => {
        const p = progress();
        const canvas = box?.querySelector("canvas");
        if (canvas) canvas.style.clipPath = `inset(0 0 ${((1 - p) * 100).toFixed(1)}% 0)`;
        updateHud(p, p * (receiptRef.current?.height ?? 0));
      };
      window.addEventListener("scroll", tick, { passive: true });
      tick();
      return () => window.removeEventListener("scroll", tick);
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    stage.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(C.bar);
    scene.fog = new THREE.Fog(C.bar, 4.2, 11);
    const camera = new THREE.PerspectiveCamera(34, 1, 0.05, 50);

    scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const key = new THREE.SpotLight(0xfff0d8, 70, 0, 0.62, 0.55, 2);
    key.position.set(0.9, 4.6, 2.6);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.bias = -0.0004;
    key.target.position.set(0, 0.9, -0.3);
    scene.add(key, key.target);
    const rim = new THREE.PointLight(C.lime, 1.2, 6, 2);
    rim.position.set(-2, 1.2, -1.5);
    scene.add(rim);

    const disposables: { dispose(): void }[] = [];
    const track = <T extends { dispose(): void }>(x: T) => (disposables.push(x), x);

    const counter = new THREE.Mesh(track(new THREE.PlaneGeometry(30, 30)), track(new THREE.MeshStandardMaterial({ color: 0x121212, roughness: 0.38, metalness: 0.15 })));
    counter.rotation.x = -Math.PI / 2;
    counter.receiveShadow = true;
    scene.add(counter);

    // printer
    const H = 0.52;
    const shell = track(new THREE.MeshStandardMaterial({ color: 0x1c1c1c, roughness: 0.55, metalness: 0.2 }));
    const base = new THREE.Mesh(track(new THREE.BoxGeometry(1.42, H - 0.04, 1.05)), shell);
    base.position.set(0, (H - 0.04) / 2, -0.12);
    base.castShadow = base.receiveShadow = true;
    const lid = new THREE.Mesh(track(new THREE.BoxGeometry(1.36, 0.04, 0.99)), track(new THREE.MeshStandardMaterial({ color: 0x232323, roughness: 0.4, metalness: 0.25 })));
    lid.position.set(0, H - 0.02, -0.12);
    lid.castShadow = true;
    const slot = new THREE.Mesh(track(new THREE.BoxGeometry(1.1, 0.012, 0.05)), track(new THREE.MeshBasicMaterial({ color: 0x000000 })));
    slot.position.set(0, H + 0.002, 0);
    const cutter = new THREE.Mesh(track(new THREE.BoxGeometry(1.12, 0.03, 0.02)), track(new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.3, metalness: 0.8 })));
    cutter.position.set(0, H + 0.012, 0.035);
    const lc = document.createElement("canvas");
    lc.width = 512;
    lc.height = 96;
    const lg = lc.getContext("2d")!;
    lg.fillStyle = "#1c1c1c"; lg.fillRect(0, 0, 512, 96);
    lg.textBaseline = "middle";
    lg.fillStyle = C.paper; lg.font = `600 40px ${display.style.fontFamily}`; lg.fillText("LINTEL", 28, 50);
    lg.fillStyle = C.muted; lg.font = `500 20px ${mono.style.fontFamily}`; lg.fillText("THERMAL · 80 MM", 220, 52);
    const labelTex = track(new THREE.CanvasTexture(lc));
    labelTex.colorSpace = THREE.SRGBColorSpace;
    const label = new THREE.Mesh(track(new THREE.PlaneGeometry(0.9, 0.17)), track(new THREE.MeshStandardMaterial({ map: labelTex, roughness: 0.6 })));
    label.position.set(-0.18, H * 0.5, 0.405);
    const ledMat = track(new THREE.MeshBasicMaterial({ color: C.lime }));
    const led = new THREE.Mesh(track(new THREE.BoxGeometry(0.05, 0.05, 0.01)), ledMat);
    led.position.set(0.56, H * 0.5, 0.41);
    const ledGlow = new THREE.PointLight(C.lime, 0, 1, 2);
    ledGlow.position.set(0.56, H * 0.5, 0.55);
    const printer = new THREE.Group();
    printer.add(base, lid, slot, cutter, label, led, ledGlow);
    scene.add(printer);

    // paper: a strip of N segments laid along a path out of the slot
    const W = 1.0;
    const N = 900;
    let L = 0.5;
    let geo: THREE.BufferGeometry | null = null;
    let paperMat: THREE.MeshStandardMaterial | null = null;
    let paperTex: THREE.CanvasTexture | null = null;
    const paper = new THREE.Mesh();
    paper.castShadow = paper.receiveShadow = true;
    paper.visible = false;
    scene.add(paper);

    const HS = 1.15, RB = 0.95, TM = 1.28;
    const path = (u: number, t: number): [number, number] => {
      if (u <= 0) return [H + u, 0];
      let y: number, z: number;
      if (u <= HS) { y = H + u; z = 0; }
      else if (u <= HS + RB * TM) { const th = (u - HS) / RB; y = H + HS + RB * Math.sin(th); z = -RB * (1 - Math.cos(th)); }
      else { const d = u - HS - RB * TM; y = H + HS + RB * Math.sin(TM) + d * Math.cos(TM); z = -RB * (1 - Math.cos(TM)) - d * Math.sin(TM); }
      if (!reduce && u > 0.25) z += Math.min(1, (u - 0.25) / 0.8) * 0.018 * Math.sin(u * 4.2 - t * 1.3);
      return [y, z];
    };
    const layout = (visible: number, t: number) => {
      if (!geo) return;
      const pos = geo.attributes.position.array as Float32Array;
      for (let j = 0; j <= N; j++) {
        const u = visible - (j / N) * L;
        const [y, z] = path(u, t);
        for (let i = 0; i < 2; i++) {
          const k = (j * 2 + i) * 3;
          const x = (i - 0.5) * W;
          pos[k] = x; pos[k + 1] = y; pos[k + 2] = z + (u > 0.1 ? 0.035 * x * x : 0);
        }
      }
      geo.attributes.position.needsUpdate = true;
      geo.computeVertexNormals();
      geo.computeBoundingSphere();
    };

    const setReceipt = (r: DrawnReceipt) => {
      geo?.dispose(); paperMat?.dispose(); paperTex?.dispose();
      L = (r.height / PAPER_WIDTH_PX) * W;
      paperTex = new THREE.CanvasTexture(r.canvas);
      paperTex.colorSpace = THREE.SRGBColorSpace;
      paperTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
      geo = new THREE.BufferGeometry();
      const pos = new Float32Array((N + 1) * 2 * 3);
      const uv = new Float32Array((N + 1) * 2 * 2);
      const idx: number[] = [];
      for (let j = 0; j <= N; j++) {
        for (let i = 0; i < 2; i++) { const k = j * 2 + i; uv[k * 2] = i; uv[k * 2 + 1] = 1 - j / N; }
        if (j < N) { const a = j * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
      }
      geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
      geo.setIndex(idx);
      paperMat = new THREE.MeshStandardMaterial({ map: paperTex, side: THREE.DoubleSide, roughness: 0.82, metalness: 0 });
      paper.geometry = geo;
      paper.material = paperMat;
      paper.visible = true;
    };

    const resize = () => {
      const w = stage.clientWidth, h = stage.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / Math.max(1, h);
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(stage);
    resize();

    const STEP = (46 / PAPER_WIDTH_PX) * W / 3;
    let shown = 0, last = performance.now(), blink = 0, raf = 0;
    const frame = (now: number) => {
      const elapsed = (now - last) / 1000;
      const dt = Math.min(0.05, elapsed);
      last = now;
      const p = progress();
      const target = 0.06 + p * (L + 0.2);
      // time-based easing, so a throttled tab catches up instead of lagging
      shown = reduce ? target : shown + (target - shown) * (1 - Math.exp(-elapsed * 7));
      const q = Math.floor(shown / STEP) * STEP;
      layout(q, now / 1000);
      const printing = paper.visible && Math.abs(target - shown) > STEP * 0.5;
      blink += dt;
      const on = printing ? Math.sin(blink * 22) > 0 : true;
      ledMat.color.set(on ? C.lime : "#3b4a1a");
      ledGlow.intensity = printing && on ? 2 : 0.4;
      const fitZ = camera.aspect < 0.85 ? 3.1 / Math.max(0.45, camera.aspect / 0.85) : 3.1;
      const e = reduce ? p : p * p * (3 - 2 * p);
      camera.position.set(reduce ? 0 : Math.sin(now / 4000) * 0.03, H + 1.05 + e * 0.75, fitZ + e * 1.3);
      camera.lookAt(0, H + 1.05 + e * 0.75, -0.35 - e * 1.6);
      renderer.render(scene, camera);
      updateHud(p, ((q - 0.06) / W) * PAPER_WIDTH_PX);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    apiRef.current = {
      setReceipt,
      dispose() {
        cancelAnimationFrame(raf);
        ro.disconnect();
        geo?.dispose(); paperMat?.dispose(); paperTex?.dispose();
        disposables.forEach((d) => d.dispose());
        renderer.dispose();
        renderer.domElement.remove();
      },
    };
    if (receiptRef.current) setReceipt(receiptRef.current);
    return () => { apiRef.current?.dispose(); apiRef.current = null; };
  }, []);

  // Redraw the paper whenever the bills change.
  useEffect(() => {
    if (!lines) return;
    let cancelled = false;
    const families = { mono: mono.style.fontFamily, display: display.style.fontFamily };
    const ready = Promise.all([
      document.fonts.load(`600 25px ${families.mono}`),
      document.fonts.load(`700 230px ${families.mono}`),
      document.fonts.load(`600 40px ${families.display}`),
    ]).catch(() => undefined);
    Promise.race([ready, new Promise((r) => setTimeout(r, 2500))]).then(() => {
      if (cancelled) return;
      const drawn = drawReceipt(lines, families);
      receiptRef.current = drawn;
      apiRef.current?.setReceipt(drawn);
      const box = fallbackRef.current;
      if (box) { box.replaceChildren(drawn.canvas); drawn.canvas.style.width = "100%"; drawn.canvas.style.height = "auto"; }
    });
    return () => { cancelled = true; };
  }, [lines]);

  const replay = () => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    trackRef.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  };

  return (
    <section ref={trackRef} className={`${display.className} relative`} style={{ height: trackHeight, background: C.bar, color: C.paper }} aria-label="Closing tab printed by the AP desk">
      <div className="sticky top-0 h-screen w-full overflow-hidden">
        <div ref={stageRef} className="absolute inset-0" aria-hidden="true" />
        <div ref={fallbackRef} hidden className="relative mx-auto max-w-[520px] pt-28" />

        <div className="pointer-events-none absolute left-1/2 top-6 -translate-x-1/2 whitespace-nowrap text-center text-[clamp(14px,1.6vw,19px)] font-semibold uppercase tracking-[0.14em]" style={{ fontFamily: mono.style.fontFamily }}>
          <span ref={captionRef}>Closing out?</span>
        </div>

        <div className="pointer-events-none absolute right-6 top-1/2 hidden -translate-y-1/2 flex-col items-end gap-2.5 text-[11.5px] tracking-[0.08em] sm:flex" style={{ fontFamily: mono.style.fontFamily, color: C.muted }}>
          <span ref={countRef} className="text-[13px]" style={{ color: C.paper }}>—</span>
          <span>LINES</span>
          <div className="relative h-40 w-[3px] overflow-hidden rounded" style={{ background: C.raised }}>
            <div ref={fillRef} className="absolute inset-x-0 bottom-0" style={{ background: C.lime, height: 0 }} />
          </div>
          <span>FEED</span>
        </div>

        <div ref={hintRef} className="pointer-events-none absolute bottom-7 left-1/2 flex -translate-x-1/2 items-center gap-2.5 text-[13px] transition-opacity" style={{ color: C.muted }}>
          <span className="relative block h-[34px] w-[22px] rounded-xl border-[1.5px]" style={{ borderColor: C.muted }}>
            <span className="absolute left-1/2 top-[7px] block h-[7px] w-[3px] -translate-x-1/2 rounded-sm motion-safe:animate-bounce" style={{ background: C.lime }} />
          </span>
          Scroll to print the tab
        </div>

        {ended && (
          <div className="absolute bottom-7 left-1/2 flex -translate-x-1/2 gap-2.5">
            {onOpenDesk && (
              <button type="button" onClick={onOpenDesk} className="rounded-full px-6 py-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2" style={{ background: C.lime, color: C.bar, outlineColor: C.lime }}>
                Open the AP desk ↓
              </button>
            )}
            <button
              type="button"
              onClick={replay}
              className="rounded-full px-6 py-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
              style={onOpenDesk ? { background: "transparent", color: C.paper, boxShadow: `inset 0 0 0 1.5px ${C.raised}`, outlineColor: C.lime } : { background: C.lime, color: C.bar, outlineColor: C.lime }}
            >
              Print it again
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
