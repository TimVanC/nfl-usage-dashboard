import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import { PlayerDrawerProvider } from "@/components/PlayerDrawer";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "NFL Usage", template: "%s · NFL Usage" },
  description: "Target share, first-read share, backfield splits, red zone usage and next-week projections for every NFL team.",
};

const NAV = [
  { href: "/", label: "Teams" },
  { href: "/week", label: "Week" },
  { href: "/season", label: "Season" },
  { href: "/projections", label: "Projections" },
  { href: "/definitions", label: "Definitions" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full`}>
      <body className="min-h-full flex flex-col">
        <PlayerDrawerProvider>
          <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur">
            <div className="mx-auto flex max-w-7xl items-center gap-6 px-4 py-3">
              <Link href="/" className="font-semibold tracking-tight text-primary">
                NFL<span className="text-accent">Usage</span>
              </Link>
              <nav className="flex gap-1 text-sm">
                {NAV.map((n) => (
                  <Link key={n.href} href={n.href} className="rounded-md px-3 py-1.5 text-secondary hover:bg-surface-2 hover:text-primary">
                    {n.label}
                  </Link>
                ))}
              </nav>
            </div>
          </header>
          <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">{children}</main>
          <footer className="border-t border-border px-4 py-6 text-xs text-muted">
            <div className="mx-auto max-w-7xl">
              Data: nflverse (play-by-play, snap counts, participation, rosters, schedules) and FTN Data charting via nflverse (CC BY-SA 4.0). Injury status via Sleeper. Not affiliated with the NFL.
            </div>
          </footer>
        </PlayerDrawerProvider>
      </body>
    </html>
  );
}
