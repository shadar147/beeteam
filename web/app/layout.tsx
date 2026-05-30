import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { Providers } from "./providers";

// GeistVF.woff is the Geist variable font (weight 100–900) bundled by create-next-app.
// It includes Cyrillic glyphs — no subset restriction needed for local fonts.
const geist = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = { title: "BeeTeam", description: "1-2-1 трекинг для лидов" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" data-theme="light" data-density="regular" className={`${geist.variable} ${geistMono.variable}`}>
      <body><Providers>{children}</Providers></body>
    </html>
  );
}
