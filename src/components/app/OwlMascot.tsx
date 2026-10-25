"use client";

/**
 * Pranil's owl, drawn as layered vectors so the lids, pupils, beak, wings, and head
 * can move on their own. Lime parts use --color-lime. The perch is the talk button.
 */
import { forwardRef, useEffect, useId, useImperativeHandle, useRef, useState, useSyncExternalStore, type Ref } from "react";
import type { VoiceStatus } from "@/voice/session";
import { beakOpenFromLevel, idleSleepy, owlMotion, owlPose, smoothLevel, type OwlPose } from "@/voice/owl";
import s from "./OwlMascot.module.css";

export interface OwlHandle {
  setLevel(rms: number): void;
}

function reducedNow(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function subscribeReduced(onChange: () => void): () => void {
  const media = window.matchMedia("(prefers-reduced-motion: reduce)");
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

function noReduced(): boolean {
  return false;
}

export const OwlTalk = forwardRef(function OwlTalk({
  status,
  blocked,
  awaitingAgent,
  hasAnalyser,
  label,
  disabled,
  onClick,
  buttonRef,
}: {
  status: VoiceStatus;
  blocked: boolean;
  awaitingAgent: boolean;
  hasAnalyser: boolean;
  label: string;
  disabled: boolean;
  onClick(): void;
  buttonRef: Ref<HTMLButtonElement>;
}, ref: Ref<OwlHandle>) {
  const rawId = useId().replace(/:/g, "");
  const reduced = useSyncExternalStore(subscribeReduced, reducedNow, noReduced);
  const [hovering, setHovering] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [tracked, setTracked] = useState({ status, hovering });
  if (tracked.status !== status || tracked.hovering !== hovering) {
    setTracked({ status, hovering });
    setElapsed(0);
  }
  const idleFor = tracked.status === status && tracked.hovering === hovering ? elapsed : 0;
  const sleepy = status === "idle" && idleSleepy(idleFor, hovering);
  const pose: OwlPose = owlPose({ status, blocked, sleepy, awaitingAgent });
  const motion = owlMotion(pose, reduced, hasAnalyser);
  const rootRef = useRef<HTMLDivElement>(null);
  const smooth = useRef(0);

  useEffect(() => {
    if (status !== "idle" || hovering) return;
    const started = performance.now();
    const id = window.setInterval(() => setElapsed(performance.now() - started), 250);
    return () => window.clearInterval(id);
  }, [status, hovering]);

  useEffect(() => {
    if (motion.beak === "level") return;
    smooth.current = 0;
    rootRef.current?.style.setProperty("--beak", "0");
  }, [motion.beak]);

  useImperativeHandle(ref, () => ({
    setLevel(rms: number) {
      smooth.current = smoothLevel(smooth.current, rms);
      const open = beakOpenFromLevel(smooth.current);
      rootRef.current?.style.setProperty("--beak", open.toFixed(3));
    },
  }), []);

  const body = `${rawId}-body`;
  const head = `${rawId}-head`;
  const wing = `${rawId}-wing`;
  const belly = `${rawId}-belly`;
  const iris = `${rawId}-iris`;
  const beak = `${rawId}-beak`;
  const lid = `${rawId}-lid`;

  return (
    <div className={s.unit} onMouseEnter={() => setHovering(true)} onMouseLeave={() => setHovering(false)}>
      <div
        ref={rootRef}
        className={s.owl}
        data-owl=""
        data-pose={pose}
        data-breathe={motion.breathe ? "true" : "false"}
        data-blink={motion.blink}
        data-wing={motion.wing}
        data-waves={motion.waves}
        data-eyes={motion.eyes}
        data-head={motion.head}
        data-dots={motion.dots ? "true" : "false"}
        data-beak={motion.beak}
      >
        <svg viewBox="0 0 200 256" aria-hidden="true">
          <defs>
            <radialGradient id={body} cx="38%" cy="32%" r="72%">
              <stop offset="0%" stopColor="#4a4a4a" />
              <stop offset="42%" stopColor="#1c1c1c" />
              <stop offset="100%" stopColor="#0c0c0c" />
            </radialGradient>
            <radialGradient id={head} cx="40%" cy="34%" r="68%">
              <stop offset="0%" stopColor="#555" />
              <stop offset="46%" stopColor="#1a1a1a" />
              <stop offset="100%" stopColor="#0e0e0e" />
            </radialGradient>
            <radialGradient id={wing} cx="30%" cy="30%" r="75%">
              <stop offset="0%" stopColor="#3a3a3a" />
              <stop offset="100%" stopColor="#101010" />
            </radialGradient>
            <radialGradient id={belly} cx="50%" cy="38%" r="68%">
              <stop offset="0%" stopColor="color-mix(in srgb, var(--color-lime) 72%, white)" />
              <stop offset="100%" stopColor="var(--color-lime)" />
            </radialGradient>
            <radialGradient id={iris} cx="42%" cy="40%" r="70%">
              <stop offset="0%" stopColor="#3a2e28" />
              <stop offset="55%" stopColor="#16110e" />
              <stop offset="100%" stopColor="#070605" />
            </radialGradient>
            <linearGradient id={beak} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f3b15a" />
              <stop offset="55%" stopColor="#e07a2c" />
              <stop offset="100%" stopColor="#c45f16" />
            </linearGradient>
            <radialGradient id={lid} cx="40%" cy="30%" r="75%">
              <stop offset="0%" stopColor="#3a3a3a" />
              <stop offset="100%" stopColor="#141414" />
            </radialGradient>
          </defs>

          <g className={s.dots}>
            <circle className={s.dot} cx="76" cy="18" r="5.2" />
            <circle className={s.dot} cx="92" cy="10" r="5.2" />
            <circle className={s.dot} cx="108" cy="10" r="5.2" />
            <circle className={s.dot} cx="124" cy="18" r="5.2" />
          </g>

          <g className={s.rig}>
            <g className={s.wingLeft}>
              <path fill={`url(#${wing})`} stroke="#6a6a6a" strokeWidth="2" d="M62 132C32 140 16 176 34 208c16 18 42 4 50-22 6-22 2-46-22-54z" />
            </g>
            <g className={`${s.wingRight} ${s.wingBack}`}>
              <path fill={`url(#${wing})`} stroke="#6a6a6a" strokeWidth="2" d="M138 132c30 8 46 44 28 76-16 18-42 4-50-22-6-22-2-46 22-54z" />
            </g>

            <ellipse cx="100" cy="164" rx="54" ry="52" fill={`url(#${body})`} />
            <ellipse cx="84" cy="148" rx="20" ry="12" fill="#fff" opacity="0.05" />
            <ellipse cx="100" cy="180" rx="32" ry="26" fill={`url(#${belly})`} />
            <ellipse cx="100" cy="194" rx="16" ry="10" fill="#0a0a0a" opacity="0.1" />

            <path fill="var(--color-lime)" d="M100 142c-2 0-22-2-34 10 8 6 22 4 34-4z" />
            <path fill="var(--color-lime)" d="M100 142c2 0 22-2 34 10-8 6-22 4-34-4z" />
            <circle cx="100" cy="148" r="6.5" fill="var(--color-lime)" />
            <circle cx="100" cy="146.5" r="2.2" fill="var(--color-paper)" opacity="0.5" />

            <g className={s.head}>
              <path fill={`url(#${head})`} d="M74 64C64 42 58 26 70 16c8 16 12 32 16 48z" />
              <path fill={`url(#${head})`} d="M126 64c10-22 16-38 4-48-8 16-12 32-16 48z" />
              <circle cx="100" cy="98" r="50" fill={`url(#${head})`} />
              <ellipse cx="82" cy="78" rx="16" ry="9" fill="#fff" opacity="0.07" />

              <g className={s.eye}>
                <circle cx="78" cy="100" r="19" fill="var(--color-paper)" />
                <circle cx="78" cy="100" r="12.4" fill={`url(#${iris})`} />
                <g className={s.pupil}>
                  <circle cx="78" cy="101" r="6" fill="#070605" />
                  <circle cx="74" cy="96" r="3.1" fill="#fff" />
                  <circle cx="82" cy="104" r="1.3" fill="#fff" opacity="0.85" />
                </g>
                <ellipse className={s.eyelid} cx="78" cy="100" rx="19" ry="19" fill={`url(#${lid})`} />
              </g>
              <g className={s.eye}>
                <circle cx="122" cy="100" r="19" fill="var(--color-paper)" />
                <circle cx="122" cy="100" r="12.4" fill={`url(#${iris})`} />
                <g className={s.pupil}>
                  <circle cx="122" cy="101" r="6" fill="#070605" />
                  <circle cx="118" cy="96" r="3.1" fill="#fff" />
                  <circle cx="126" cy="104" r="1.3" fill="#fff" opacity="0.85" />
                </g>
                <ellipse className={s.eyelid} cx="122" cy="100" rx="19" ry="19" fill={`url(#${lid})`} />
              </g>

              <path className={s.beakUpper} fill={`url(#${beak})`} d="M100 114c-9 0-14 8-8 16 2-5 5-8 8-8s6 3 8 8c6-8 1-16-8-16z" />
              <path className={s.beakLower} fill={`url(#${beak})`} d="M91 128c2 12 16 12 18 0-3 4-6 6-9 6s-6-2-9-6z" />
              <ellipse className={s.beakUpper} cx="96" cy="120" rx="3" ry="1.6" fill="#fff" opacity="0.35" />
            </g>

            <g className={`${s.wingRight} ${s.wingFront}`}>
              <path fill={`url(#${wing})`} stroke="#6a6a6a" strokeWidth="2" d="M138 132c30 8 46 44 28 76-16 18-42 4-50-22-6-22-2-46 22-54z" />
            </g>
          </g>

          <g className={`${s.waves} ${s.wavesEar}`}>
            <path className={s.wave} d="M168 58c10 8 10 18 0 26" />
            <path className={s.wave} d="M178 48c14 12 14 30 0 42" />
            <path className={s.wave} d="M188 38c18 16 18 42 0 58" />
          </g>
          <g className={`${s.waves} ${s.wavesBeak}`}>
            <path className={s.wave} d="M126 118c8 4 8 12 0 16" />
            <path className={s.wave} d="M136 110c12 7 12 20 0 28" />
            <path className={s.wave} d="M146 102c16 10 16 28 0 40" />
          </g>

          <g fill="#241c16">
            <ellipse cx="86" cy="222" rx="9" ry="5" />
            <ellipse cx="74" cy="232" rx="6.5" ry="4" transform="rotate(-24 74 232)" />
            <ellipse cx="84" cy="238" rx="6" ry="3.8" />
            <ellipse cx="94" cy="232" rx="6" ry="3.8" transform="rotate(18 94 232)" />
            <ellipse cx="114" cy="222" rx="9" ry="5" />
            <ellipse cx="106" cy="232" rx="6" ry="3.8" transform="rotate(-18 106 232)" />
            <ellipse cx="116" cy="238" rx="6" ry="3.8" />
            <ellipse cx="126" cy="232" rx="6.5" ry="4" transform="rotate(24 126 232)" />
          </g>
        </svg>
      </div>
      <button
        ref={buttonRef}
        type="button"
        className={s.perch}
        disabled={disabled}
        aria-label={label}
        onClick={onClick}
      >
        {label}
      </button>
    </div>
  );
});
