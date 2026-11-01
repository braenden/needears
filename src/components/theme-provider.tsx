"use client";

import { useEffect } from "react";
import { ThemeProvider as NextThemesProvider, useTheme } from "next-themes";

// The page background of each theme (--background in globals.css).
const THEME_COLORS = {
  dark: "#171513",
  light: "#f6f5f2",
} as const;

/**
 * Dark is the default. The class lands on <html> as `dark` or `light`.
 * The nonce lets the inline script that sets the class pass the CSP.
 */
export function ThemeProvider({
  children,
  nonce,
}: {
  children: React.ReactNode;
  nonce?: string;
}) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="dark"
      themes={["dark", "light"]}
      enableSystem={false}
      disableTransitionOnChange
      nonce={nonce}
    >
      <ThemeColor />
      {children}
    </NextThemesProvider>
  );
}

/**
 * Colors the browser's toolbar like the page, in either theme. One tag of
 * our own: the page's metadata would put it back to dark on every
 * navigation.
 */
function ThemeColor() {
  const { resolvedTheme } = useTheme();
  useEffect(() => {
    const color =
      resolvedTheme === "light" ? THEME_COLORS.light : THEME_COLORS.dark;
    let meta = document.head.querySelector<HTMLMetaElement>(
      'meta[name="theme-color"]',
    );
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "theme-color";
      document.head.append(meta);
    }
    meta.content = color;
  }, [resolvedTheme]);
  return null;
}
