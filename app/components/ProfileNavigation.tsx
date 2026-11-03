"use client";

import { Files, History, Settings, UserRound } from "lucide-react";
export type ProfileView = "library" | "drafts" | "history" | "settings";
const destinations = [
  { view: "library", href: "/", label: "Profile", Icon: UserRound },
  { view: "drafts", href: "/drafts", label: "Drafts", Icon: Files },
  { view: "history", href: "/history", label: "History", Icon: History },
  { view: "settings", href: "/settings", label: "Settings", Icon: Settings },
] as const;

export function ProfileNavigation({ view, className = "dock-controls", onNavigate }: {
  view: ProfileView; className?: string; onNavigate?: (view: ProfileView) => void;
}) {
  return <nav className={`${className} app-navigation-controls`} aria-label="Main">
    {destinations.map(({ view: destination, href, label, Icon }) => <a key={destination} href={href}
      data-profile-view={destination}
      className={`app-navigation-button ${view === destination ? "is-active" : ""}`}
      onClick={event => {
        // Real links work before hydration and preserve native new-tab actions.
        // Only suppress navigation after the synchronous section swap succeeds.
        if (!onNavigate || event.defaultPrevented || event.button !== 0 ||
          event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        onNavigate(destination);
        event.preventDefault();
      }}
      aria-label={label} aria-current={view === destination ? "page" : undefined}>
      <span className="app-navigation-icon"><Icon aria-hidden="true" /></span>
      <span className="visually-hidden">{label}</span>
    </a>)}
  </nav>;
}
