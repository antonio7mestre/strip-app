"use client";

import { createContext, useContext, type ReactNode } from "react";

export type InitialProfileChrome = { path: string; showTools: boolean; showLanding?: boolean };
const ProfileChromeContext = createContext<InitialProfileChrome | null>(null);

export function InitialProfileChromeProvider({ value, children }: {
  value: InitialProfileChrome | null; children: ReactNode;
}) {
  return <ProfileChromeContext.Provider value={value}>{children}</ProfileChromeContext.Provider>;
}

export const useInitialProfileChrome = () => useContext(ProfileChromeContext);
