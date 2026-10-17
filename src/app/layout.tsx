import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Suspense } from "react";
import { Nav } from "@/components/nav";
import { getCurrentUser } from "@/server/session";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"], display: "swap" });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"], display: "swap" });

const appUrl = process.env.APP_URL ?? "http://localhost:3100";

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: { default: "Coursemates", template: "%s · Coursemates" },
  description: "Find or start a study group for your course, schedule meetups, and get a reminder before each one.",
  applicationName: "Coursemates",
  robots: { index: true, follow: true },
  openGraph: { title: "Coursemates", description: "Study groups for your courses.", type: "website", url: appUrl },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfbf9" },
    { media: "(prefers-color-scheme: dark)", color: "#121316" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <Suspense fallback={<Nav user={null} pending />}>
          <NavWithUser />
        </Suspense>
        <main id="main" className="mx-auto w-full max-w-4xl flex-1 px-4 py-6 sm:px-6">
          {children}
        </main>
        <footer className="border-t border-border">
          <div className="mx-auto flex w-full max-w-4xl flex-wrap items-center justify-between gap-2 px-4 py-4 text-sm text-muted sm:px-6">
            <span>Coursemates · study groups for your courses</span>
            <nav aria-label="Footer">
              <ul className="flex gap-4">
                <li>
                  <a className="hover:underline" href="/privacy">
                    Privacy
                  </a>
                </li>
                <li>
                  <a className="hover:underline" href="https://github.com/Tajaddin/fullstack-ts-product" rel="noopener">
                    Source
                  </a>
                </li>
              </ul>
            </nav>
          </div>
        </footer>
      </body>
    </html>
  );
}

async function NavWithUser() {
  const user = await getCurrentUser();
  return <Nav user={user} />;
}
