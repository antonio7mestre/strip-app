"use client";

import { useLayoutEffect, useState } from "react";
import { readProfileLayout, saveProfileBackground, saveProfileLayout, type ProfileLayout } from "@/app/lib/profile-reload";

export function ProfileReload() {
  const [layout, setLayout] = useState<ProfileLayout | null>(null);
  useLayoutEffect(() => {
    const update = () => setLayout(readProfileLayout(location.pathname, window.innerWidth));
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  return <main className="app-shell route-loading-mode profile-reload" aria-busy="true" aria-label="Loading profile"
    style={layout ? { minHeight: layout.height } : undefined}>
    {layout?.frames.map((frame, index) => <span key={index} className="profile-reload-frame" aria-hidden="true"
      style={{ left: frame.x, top: frame.y, width: frame.width, height: frame.height }} />)}
  </main>;
}

/** Capture only settled, saved layouts. Selection and entrance transforms must
 * never become the next reload's skeleton positions. */
export function useProfileReloadLayout({ ready, owner, background, view, editing, opening }: {
  ready: boolean; owner: string; background: string; view: string; editing: boolean; opening: boolean;
}) {
  useLayoutEffect(() => {
    if (!ready || !owner || editing || opening) return;
    const page = document.querySelector<HTMLElement>(".profile-theme-mode");
    if (!page) return;
    page.classList.toggle("is-restored-profile", Boolean(readProfileLayout(location.pathname, window.innerWidth)));
    document.documentElement.style.setProperty("--profile-reload-background", background);
    saveProfileBackground(owner, background);
    let timer = 0;
    const capture = () => {
      const frames = Array.from(page.querySelectorAll<HTMLElement>(
        ".library-cover, .library-card h2, .profile-name h1, .profile-meta-row, .settings-card",
      )).map(element => {
        const rect = element.getBoundingClientRect();
        return { x: rect.left + window.scrollX, y: rect.top + window.scrollY,
          width: rect.width, height: rect.height,
          ...(element.classList.contains("library-cover") ? { coverId: element.closest<HTMLElement>(".library-card")?.dataset.libraryId } : {}),
        };
      }).filter(frame => frame.width > 0 && frame.height > 0 && frame.x >= 0 && frame.y >= 0);
      saveProfileLayout(owner, background, location.pathname, {
        width: window.innerWidth, height: page.scrollHeight, frames,
      });
    };
    const schedule = () => {
      window.clearTimeout(timer);
      // Card entrance is staggered by up to 360 ms, then runs for 180 ms.
      timer = window.setTimeout(capture, 600);
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(page);
    page.querySelectorAll(".library-cover, .profile-header, .library-header").forEach(node => observer.observe(node));
    const mutations = new MutationObserver(schedule);
    mutations.observe(page, { childList: true, subtree: true });
    page.addEventListener("load", schedule, true);
    window.addEventListener("resize", schedule);
    schedule();
    return () => { window.clearTimeout(timer); observer.disconnect(); mutations.disconnect(); page.removeEventListener("load", schedule, true); window.removeEventListener("resize", schedule); };
  }, [ready, owner, background, view, editing, opening]);
}
