"use client";

import { DockFooter } from "@/app/components/DockViewport";

import { useLayoutEffect, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { Plus } from "lucide-react";
import { PROFILE_PATHS, readProfileReload, readProfilePresentation, readProfileLayout, saveProfileBackground, saveProfileLayout, saveProfilePresentation, type ProfileLayout } from "@/app/lib/profile-reload";
import { DEFAULT_PROFILE, profileFontInfo, type StripProfile } from "@/app/lib/profile";
import { usernameFromHostname } from "@/app/lib/username";
import { ProfileHeader, profilePageStyle } from "./ProfileEditor";
import { ProfileNavigation, type ProfileView } from "./ProfileNavigation";
import type { useStripProfile } from "./useStripProfile";
import { retainProfileBrowserTheme } from "@/app/lib/profile-browser-theme";
import { useInitialProfileChrome } from "./InitialProfileChrome";

// The same surface owns the fixed tools before and after data loads. Replacing
// the whole loading component used to recreate Safari's fixed white layer.
export function ProfileReload({ controller, owner, profile, username, publicView, view: requestedView, onNavigate, onNew,
  loaded = false, children, mainProps, navigation, dockClassName = "", hideTools = false, hideAdd = false }: {
  controller?: ReturnType<typeof useStripProfile>; owner?: string; profile?: StripProfile;
  username?: string | null; publicView?: boolean; view?: ProfileView; onNavigate?: (view: ProfileView) => void; onNew?: () => void;
  loaded?: boolean; children?: ReactNode; mainProps?: ComponentProps<"main">;
  navigation?: ReactNode; dockClassName?: string; hideTools?: boolean; hideAdd?: boolean;
} = {}) {
  const initialChrome = useInitialProfileChrome();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<ProfileLayout | null>(null);
  const [presentation, setPresentation] = useState<ReturnType<typeof readProfilePresentation>>(null);
  const [path, setPath] = useState<string | null>(initialChrome?.path ?? null);
  useLayoutEffect(() => {
    // Saved skeleton geometry is only needed before content is ready. Reading
    // and setting it on every loaded tab change delays that tab's first paint.
    if (loaded) return;
    const update = () => {
      setPath(location.pathname);
      const saved = readProfileReload();
      setLayout(!owner || saved?.owner === owner ? readProfileLayout(location.pathname, window.innerWidth) : null);
      setPresentation(readProfilePresentation(owner, usernameFromHostname(location.hostname)));
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [owner, requestedView, loaded]);
  const isProfilePage = loaded || (path !== null && PROFILE_PATHS.includes(path));
  const headingProfile = profile ?? (presentation ? { ...DEFAULT_PROFILE, ...presentation, font: profileFontInfo(presentation.font).id } : undefined);
  const headingUsername = username ?? presentation?.username ?? null;
  const showHeading = isProfilePage && headingProfile && headingUsername && controller;
  const isPublic = publicView ?? Boolean(presentation?.owner.startsWith("public:"));
  const showTools = isProfilePage && (publicView === undefined && initialChrome
    ? initialChrome.showTools : !isPublic && Boolean(owner || presentation));
  useLayoutEffect(() => {
    if (showTools) return retainProfileBrowserTheme();
  }, [showTools]);
  const view: ProfileView = requestedView ?? (path === "/drafts" ? "drafts" : path === "/history" ? "history" : path === "/settings" ? "settings" : "library");
  useLayoutEffect(() => {
    scrollRef.current?.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [view]);
  const pageProps = loaded ? mainProps : {
    className: `app-shell route-loading-mode profile-reload${showHeading ? ` library-mode profile-theme-mode${view === "library" ? " profile-mode" : ""}` : ""}`,
    "aria-busy": true as const, "aria-label": "Loading profile",
    style: headingProfile ? profilePageStyle({ profile: headingProfile }) : undefined,
  };
  return <main {...pageProps} className={`${pageProps?.className ?? ""}${showTools ? " profile-scroll-shell" : ""}`}>
    {/* Safari can consume taps that stop root-page momentum. Only the content
        scrolls here; the persistent controls are siblings, never descendants. */}
    <div ref={scrollRef} className="profile-scroll-viewport" tabIndex={showTools ? 0 : undefined} aria-label={showTools ? "Scroll Strips" : undefined}>
    <div className="profile-scroll-content" style={!loaded && layout ? { minHeight: layout.height } : undefined}>
    {loaded ? children : <>{showHeading ? <section className="strip-library">
      {view === "library" ? <ProfileHeader controller={controller} username={headingUsername} displayProfile={headingProfile}
        publicProfile={isPublic ? headingProfile : undefined} loading /> : <header className="library-header"><div className="profile-name">
        <h1>{view === "drafts" ? "Drafts" : view === "history" ? "History" : "Settings"}</h1>
        <div className="profile-meta-row"><p className="profile-handle">{view === "drafts" ? "Pick up where you left off." : view === "history" ? "Revisit the Strips you’ve opened." : "Your account and app details."}</p></div>
      </div></header>}
    </section> : null}
    {layout?.frames.filter(frame => frame.coverId).map((frame, index) => <span key={index} className="profile-reload-frame" aria-hidden="true"
      style={{ left: frame.x, top: frame.y, width: frame.width, height: frame.height }} />)}</>}
    </div>
    </div>
    {showTools && view !== "settings" && !hideAdd ? <button key="profile-add" className="library-add-button" type="button" aria-label="Create a new Strip" disabled={!onNew} onClick={onNew}><Plus aria-hidden="true" /></button> : null}
    {showTools && !hideTools ? <DockFooter key="persistent-composer-dock" className={`composer-dock app-navigation-dock ${dockClassName}`}>
      {navigation ?? <ProfileNavigation view={view} onNavigate={onNavigate} />}
    </DockFooter> : null}
  </main>;
}

export function useProfileReloadPresentation({ ready, owner, username, profile, editing }: {
  ready: boolean; owner: string; username: string | null; profile: StripProfile; editing: boolean;
}) {
  useLayoutEffect(() => {
    if (!ready || !owner || !username || editing) return;
    saveProfilePresentation(owner, profile.background, { username, title: profile.title, font: profile.font, accent: profile.accent });
  }, [ready, owner, username, profile.background, profile.title, profile.font, profile.accent, editing]);
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
    const content = page.querySelector<HTMLElement>(".profile-scroll-content") ?? page;
    page.classList.toggle("is-restored-profile", Boolean(readProfileLayout(location.pathname, window.innerWidth)));
    document.documentElement.style.setProperty("--profile-reload-background", background);
    saveProfileBackground(owner, background);
    let timer = 0;
    const capture = () => {
      const pageBounds = content.getBoundingClientRect();
      const frames = Array.from(content.querySelectorAll<HTMLElement>(
        ".library-cover",
      )).map(element => {
        const rect = element.getBoundingClientRect();
        return { x: rect.left - pageBounds.left, y: rect.top - pageBounds.top,
          width: rect.width, height: rect.height,
          ...(element.classList.contains("library-cover") ? { coverId: element.closest<HTMLElement>(".library-card")?.dataset.libraryId } : {}),
        };
      }).filter(frame => frame.width > 0 && frame.height > 0 && frame.x >= 0 && frame.y >= 0);
      saveProfileLayout(owner, background, location.pathname, {
        width: window.innerWidth, height: content.scrollHeight, frames,
      });
    };
    const schedule = () => {
      window.clearTimeout(timer);
      // Card entrance is staggered by up to 360 ms, then runs for 180 ms.
      timer = window.setTimeout(capture, 600);
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(content);
    page.querySelectorAll(".library-cover, .profile-header, .library-header").forEach(node => observer.observe(node));
    const mutations = new MutationObserver(schedule);
    mutations.observe(page, { childList: true, subtree: true });
    page.addEventListener("load", schedule, true);
    window.addEventListener("resize", schedule);
    schedule();
    return () => { window.clearTimeout(timer); observer.disconnect(); mutations.disconnect(); page.removeEventListener("load", schedule, true); window.removeEventListener("resize", schedule); };
  }, [ready, owner, background, view, editing, opening]);
}
