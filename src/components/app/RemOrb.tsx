"use client";

/**
 * The Rem orb from pranillama.com, with an owl face on the lime disk.
 * Lean, blink, nudge, spin, and the listening ring stay. The beak follows playback level.
 */
import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import type { VoiceStatus } from "@/voice/session";
import { beakOpenFromLevel, idleSleepy, orbFace, smoothLevel } from "@/voice/owl";
import s from "./RemOrb.module.css";

const LOOK_RANGE = 180;

export interface OrbHandle {
  setLevel(rms: number): void;
}

function reducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export const RemOrb = forwardRef(function RemOrb({
  state,
  blocked = false,
  hasAnalyser = false,
}: {
  state: VoiceStatus;
  blocked?: boolean;
  hasAnalyser?: boolean;
}, ref: Ref<OrbHandle>) {
  const orb = useRef<HTMLSpanElement>(null);
  const smooth = useRef(0);
  const [hovering, setHovering] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [tracked, setTracked] = useState({ state, hovering, blocked });
  if (tracked.state !== state || tracked.hovering !== hovering || tracked.blocked !== blocked) {
    setTracked({ state, hovering, blocked });
    setElapsed(0);
  }
  const idleFor = tracked.state === state && tracked.hovering === hovering && tracked.blocked === blocked ? elapsed : 0;
  const sleepy = state === "idle" && !blocked && idleSleepy(idleFor, hovering);
  const face = orbFace({ status: state, blocked, sleepy, hasAnalyser });

  useEffect(() => {
    const el = orb.current;
    if (!el) return;
    if (reducedMotion()) {
      el.setAttribute("data-entered", "true");
      return;
    }
    const timer = window.setTimeout(() => el.setAttribute("data-entered", "true"), 1250);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const el = orb.current;
    if (!el) return;
    const target = el.closest("button") ?? el;
    const on = () => setHovering(true);
    const off = () => setHovering(false);
    target.addEventListener("pointerenter", on);
    target.addEventListener("pointerleave", off);
    return () => {
      target.removeEventListener("pointerenter", on);
      target.removeEventListener("pointerleave", off);
    };
  }, []);

  useEffect(() => {
    if (state !== "idle" || hovering || blocked) return;
    const started = performance.now();
    const id = window.setInterval(() => setElapsed(performance.now() - started), 250);
    return () => window.clearInterval(id);
  }, [state, hovering, blocked]);

  useEffect(() => {
    const el = orb.current;
    if (!el) return;
    const clearLook = () => {
      el.style.setProperty("--look-x", "0px");
      el.style.setProperty("--look-y", "0px");
      el.removeAttribute("data-tracking");
    };
    if (reducedMotion()) {
      clearLook();
      return;
    }
    let tracking = false;
    let frame = 0;
    const setLook = (x: number, y: number, on: boolean) => {
      el.style.setProperty("--look-x", `${x}px`);
      el.style.setProperty("--look-y", `${y}px`);
      if (on === tracking) return;
      tracking = on;
      if (on) el.setAttribute("data-tracking", "true");
      else el.removeAttribute("data-tracking");
    };
    const onMove = (event: PointerEvent) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const rect = el.getBoundingClientRect();
        const dx = event.clientX - (rect.left + rect.width / 2);
        const dy = event.clientY - (rect.top + rect.height / 2);
        if (Math.hypot(dx, dy) > LOOK_RANGE) setLook(0, 0, false);
        else setLook(8.5 * Math.max(-1, Math.min(1, dx / 75.6)), 6.5 * Math.max(-1, Math.min(1, dy / 75.6)), true);
      });
    };
    const reset = () => setLook(0, 0, false);
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("blur", reset);
    document.addEventListener("pointerleave", reset);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("blur", reset);
      document.removeEventListener("pointerleave", reset);
      reset();
    };
  }, [state]);

  useEffect(() => {
    const el = orb.current;
    if (!el) return;
    const clear = () => {
      el.removeAttribute("data-nudge");
      el.removeAttribute("data-spin");
    };
    if (reducedMotion() || state !== "idle") {
      clear();
      return;
    }
    let wait = 0;
    let play = 0;
    const arm = (ms: number) => {
      window.clearTimeout(wait);
      wait = window.setTimeout(playOnce, ms);
    };
    const playOnce = () => {
      if (el.getAttribute("data-tracking") === "true") {
        arm(5000);
        return;
      }
      const kind = Math.random() < 0.5 ? "nudge" : "spin";
      clear();
      void el.offsetWidth;
      el.setAttribute(kind === "nudge" ? "data-nudge" : "data-spin", "true");
      window.clearTimeout(play);
      play = window.setTimeout(() => {
        clear();
        arm(11000 + Math.floor(11000 * Math.random()));
      }, kind === "nudge" ? 1100 : 1150);
    };
    arm(8000);
    return () => {
      window.clearTimeout(wait);
      window.clearTimeout(play);
      clear();
    };
  }, [state]);

  useEffect(() => {
    if (face.beak === "level") return;
    smooth.current = 0;
    orb.current?.style.setProperty("--beak", "0");
  }, [face.beak]);

  useImperativeHandle(ref, () => ({
    setLevel(rms: number) {
      smooth.current = smoothLevel(smooth.current, rms);
      const open = beakOpenFromLevel(smooth.current);
      orb.current?.style.setProperty("--beak", open.toFixed(3));
    },
  }), []);

  return (
    <span
      ref={orb}
      className={s.orb}
      data-state={state}
      data-lids={face.lids}
      data-blink={face.blink}
      data-beak={face.beak}
      aria-hidden="true"
    >
      <span className={s.bouncer}>
        <span className={s.ring} />
        <span className={s.face}>
          <span className={s.disk} />
          <span className={`${s.tuft} ${s.tuftLeft}`} />
          <span className={`${s.tuft} ${s.tuftRight}`} />
          <span className={s.eyes}>
            <span className={`${s.socket} ${s.leftEye}`}>
              <span className={s.eye}>
                <span className={s.pupil}><span className={s.catchlight} /></span>
                <span className={s.lid} />
              </span>
            </span>
            <span className={`${s.socket} ${s.rightEye}`}>
              <span className={s.eye}>
                <span className={s.pupil}><span className={s.catchlight} /></span>
                <span className={s.lid} />
              </span>
            </span>
          </span>
          <span className={s.beak}>
            <span className={s.beakUpper} />
            <span className={s.beakLower} />
          </span>
          <span className={s.dots} aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
        </span>
      </span>
    </span>
  );
});
