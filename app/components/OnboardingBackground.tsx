"use client";

import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { ArrowLeft, Check, Palette } from "lucide-react";
import { GradientColorPicker } from "@/app/components/GradientColorPicker";
import { ONBOARDING_COLORS, onboardingGrid } from "@/app/lib/onboarding-background";
import { profileInk } from "@/app/lib/profile";
import styles from "./OnboardingBackground.module.css";

export function OnboardingBackground({ color, onChange, onContinue, onBack, pending, loading, error, onRetry }: {
  color: string; onChange: (color: string) => void; onContinue: () => void;
  onBack: () => void;
  pending: boolean; loading: boolean; error: string; onRetry: () => void;
}) {
  const space = useRef<HTMLDivElement>(null);
  const [grid, setGrid] = useState({ size: 64, count: 4 });
  const [picker, setPicker] = useState(false);
  const ink = profileInk(color);
  useLayoutEffect(() => {
    document.documentElement.classList.add("onboarding-background-active");
    return () => {
      document.documentElement.classList.remove("onboarding-background-active");
      document.documentElement.style.removeProperty("--onboarding-background");
    };
  }, []);
  useLayoutEffect(() => {
    document.documentElement.style.setProperty("--onboarding-background", color);
  }, [color]);
  useLayoutEffect(() => {
    const element = space.current;
    if (!element) return;
    const measure = () => setGrid(onboardingGrid(element.clientWidth, element.clientHeight));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return <section className={styles.screen} aria-labelledby="background-heading"
    style={{ backgroundColor: color, color: ink, "--onboarding-ink": ink, "--onboarding-background": color,
      "--swatch-size": `${grid.size}px` } as CSSProperties}>
    <header className={`auth-flow-header ${styles.navigation}`}>
      <button type="button" className={`auth-back-button ${styles.back}`} aria-label="Back to username"
        disabled={pending} onClick={onBack}><ArrowLeft aria-hidden="true" strokeWidth={2.8} /></button>
    </header>
    <div className={`auth-flow-copy ${styles.heading}`}>
      <h1 id="background-heading">Background</h1>
      <p>Pick a color. You can change it later.</p>
    </div>
    <div ref={space} className={styles.space}>
      <div className={styles.grid} role="group" aria-label="Background colors">
        {ONBOARDING_COLORS.slice(0, grid.count).map((swatch) => <button
          key={swatch.value} type="button" className={styles.swatch}
          aria-label={swatch.name} aria-pressed={color.toUpperCase() === swatch.value}
          style={{ backgroundColor: swatch.value }} disabled={pending}
          onClick={() => onChange(swatch.value)} />)}
      </div>
    </div>
    <footer className={styles.footer}>
      {error ? <p className={styles.error} role="alert">{error}
        {loading ? <button type="button" onClick={onRetry}>Try again</button> : null}
      </p> : null}
      {picker ? <div className={styles.picker}>
        <GradientColorPicker color={color} onChange={(value) => { if (!pending) onChange(value); }} label="Choose any background color" />
      </div> : null}
      <div className={styles.actions}>
        <button type="button" className={styles.palette} disabled={pending}
          aria-label={picker ? "Confirm custom color" : "Choose a custom color"}
          aria-expanded={picker} onClick={() => setPicker(!picker)}>
          {picker ? <Check aria-hidden="true" /> : <Palette aria-hidden="true" />}
        </button>
        <button type="button" className={styles.continue} disabled={pending || loading}
          onClick={onContinue}>{pending ? "Saving…" : "Continue"}</button>
      </div>
    </footer>
  </section>;
}
