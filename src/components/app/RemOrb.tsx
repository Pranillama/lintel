"use client";

/**
 * The Rem orb from pranillama.com. Same face, lean, blink, nudge, and spin.
 * Lintel only recolors the black body to --color-lime.
 */
import { useEffect, useRef } from "react";
import type { VoiceStatus } from "@/voice/session";
import s from "./RemOrb.module.css";

const LOOK_RANGE = 180;

function reducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function RemOrb({ state }: { state: VoiceStatus }) {
  const orb = useRef<HTMLSpanElement>(null);

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

  return (
    <span ref={orb} className={s.orb} data-state={state} aria-hidden="true">
      <span className={s.bouncer}>
        <span className={s.ring} />
        <span className={s.face}>
          <span className={s.disk} />
          <span className={s.eyes}>
            <span className={`${s.eye} ${s.leftEye}`} />
            <span className={`${s.eye} ${s.rightEye}`} />
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
}
