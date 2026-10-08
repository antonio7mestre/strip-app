"use client";

import { Files, History, Settings, UserRound } from "lucide-react";

export type ProfileView = "library" | "drafts" | "history" | "settings";
const destinations = [
  { view: "library", label: "Profile", Icon: UserRound },
  { view: "drafts", label: "Drafts", Icon: Files },
  { view: "history", label: "History", Icon: History },
  { view: "settings", label: "Settings", Icon: Settings },
] as const;

export function ProfileNavigation({ view, className = "dock-controls", onNavigate }: {
  view: ProfileView; className?: string; onNavigate?: (view: ProfileView) => void;
}) {
  return <nav className={`${className} app-navigation-controls`} aria-label="Main">
    {destinations.map(({ view: destination, label, Icon }) => <button key={destination}
      className={`app-navigation-button ${view === destination ? "is-active" : ""}`}
      type="button" disabled={!onNavigate} onClick={() => onNavigate?.(destination)}
      aria-label={label} aria-current={view === destination ? "page" : undefined}>
      <Icon aria-hidden="true" /><span className="visually-hidden">{label}</span>
    </button>)}
  </nav>;
}
