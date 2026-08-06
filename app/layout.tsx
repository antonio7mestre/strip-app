import type { Metadata, Viewport } from "next";
import "./globals.css";

const initialThemeColorScript = `
  (() => {
    try {
      const saved = window.localStorage.getItem("strip-draft-v1");
      const blocks = saved ? JSON.parse(saved) : [];
      const firstBlock = Array.isArray(blocks) ? blocks[0] : null;
      const color =
        firstBlock?.type === "text" && typeof firstBlock.backgroundColor === "string"
          ? firstBlock.backgroundColor
          : "#000000";
      document.documentElement.style.backgroundColor = color;
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
        <meta id="strip-theme-color" name="theme-color" content="#ffffff" />
        <script dangerouslySetInnerHTML={{ __html: initialThemeColorScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
