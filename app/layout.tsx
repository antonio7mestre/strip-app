import type { Metadata, Viewport } from "next";
import "./globals.css";

const initialThemeColorScript = `
  (() => {
    try {
      // A saved editor draft must not tint a public Strip before its loader mounts.
      const hostname = window.location.hostname.toLowerCase();
      const path = window.location.pathname;
      const segments = path.split("/").filter(Boolean);
      if (path.startsWith("/strip/") || path.startsWith("/share/") ||
          (/^[a-z0-9]+(?:-[a-z0-9]+)*\\.striiip\\.com$/.test(hostname) &&
           segments.length === 1 && /^[a-zA-Z0-9_-]{8,128}$/.test(segments[0]))) return;
      const saved = window.localStorage.getItem("strip-draft-v1");
      const blocks = saved ? JSON.parse(saved) : [];
      const firstBlock = Array.isArray(blocks) ? blocks[0] : null;
      const color =
        firstBlock?.type === "text" && typeof firstBlock.backgroundColor === "string"
          ? firstBlock.backgroundColor
          : "#000000";
      document.getElementById("strip-theme-color")?.setAttribute("content", color);
      document.documentElement.style.setProperty("--top-safe-area-color", color);
      document.documentElement.style.backgroundColor = color;
    } catch {}
  })();
`;

const initialReloadScrollScript = `
  (() => {
    try {
      const navigationEntry = performance.getEntriesByType("navigation")[0];
      const isReload = navigationEntry
        ? navigationEntry.type === "reload"
        : performance.navigation?.type === 1;
      const hostname = window.location.hostname.toLowerCase();
      const isVanityStripRoute =
        /^[a-z0-9]+(?:-[a-z0-9]+)*\\.striiip\\.com$/.test(hostname) &&
        /^\\/[a-zA-Z0-9_-]{8,128}\\/?$/.test(window.location.pathname);
      const isStripRoute =
        /^\\/(?:edit|strip)\\//.test(window.location.pathname) ||
        isVanityStripRoute;

      if (isReload && isStripRoute && "scrollRestoration" in history) {
        history.scrollRestoration = "manual";
        document.documentElement.dataset.stripReloadScroll = "manual";
      }
    } catch {}
  })();
`;

export const metadata: Metadata = {
  title: "Strip — make something for your friends",
  description: "A personal, visual newsletter made for your friends.",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Strip",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <meta id="strip-theme-color" name="theme-color" content="#000000" />
        <script dangerouslySetInnerHTML={{ __html: initialReloadScrollScript }} />
        <script dangerouslySetInnerHTML={{ __html: initialThemeColorScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
