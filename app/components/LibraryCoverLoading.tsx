"use client";

import { createContext, useState, type ReactNode } from "react";
import { createCoverLoadQueue } from "@/app/lib/library-cover-loading";

export const LibraryCoverLoadingContext = createContext<ReturnType<typeof createCoverLoadQueue> | null>(null);

export function LibraryCoverLoading({ children }: { children: ReactNode }) {
  const [queue] = useState(createCoverLoadQueue);
  return <LibraryCoverLoadingContext.Provider value={queue}>{children}</LibraryCoverLoadingContext.Provider>;
}
