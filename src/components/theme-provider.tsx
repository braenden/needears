"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

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
      {children}
    </NextThemesProvider>
  );
}
