import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Geist } from "next/font/google";
import { headers } from "next/headers";
import { ThemeProvider } from "@/components/theme-provider";
import { LazyToaster } from "@/components/lazy-toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { site, siteUrl } from "@/config/site";
import { cn } from "@/lib/utils";

// display "optional": text paints once with the fallback (metrics matched
// by next/font) instead of swapping late, which kept moving the LCP.
const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist",
  display: "optional",
});
// Every page is rendered per request: the CSP nonce (src/proxy.ts) must be
// on every script, and a prerendered shell cannot carry one. This tells
// Cache Components that an empty static shell is intended.
export const instant = false;

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: { default: site.name, template: `%s · ${site.name}` },
  description: site.description,
  applicationName: site.name,
  openGraph: { siteName: site.name, type: "website" },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = {
  // Matches the dark background, the default theme.
  themeColor: "#171513",
  colorScheme: "dark light",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn("h-full antialiased", geist.variable)}
    >
      <body className="min-h-full">
        <ThemeProvider nonce={nonce}>
          <TooltipProvider delayDuration={300}>
            {children}
            <LazyToaster />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
