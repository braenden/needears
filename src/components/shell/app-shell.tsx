"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BellIcon, MenuIcon, PlusIcon } from "lucide-react";

import { Logo } from "@/components/brand/logo";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Profile } from "@/types/view";

import { ThemeToggle } from "./theme-toggle";

import { NAV, SIGN_OUT_FORM } from "./nav";

// The menus need Radix dialogs and dropdowns, a big share of the page's
// JavaScript. They load after the page has painted, behind look-alike
// buttons, so they never hold up the first render.
const MobileMenu = dynamic(() => import("./menus").then((m) => m.MobileMenu), {
  ssr: false,
  loading: () => (
    <Button
      variant="ghost"
      size="icon"
      className="@3xl:hidden"
      aria-label="Menu"
      disabled
    >
      <MenuIcon />
    </Button>
  ),
});

const UserMenu = dynamic(() => import("./menus").then((m) => m.UserMenu), {
  ssr: false,
  loading: () => (
    <Button
      variant="ghost"
      size="icon"
      className="rounded-full"
      aria-label="Account menu"
      disabled
    >
      <span className="size-8 rounded-full bg-muted" />
    </Button>
  ),
});

const LEGAL = [
  { href: "/about", label: "About" },
  { href: "/guidelines", label: "Guidelines" },
  { href: "/terms", label: "Terms" },
  { href: "/privacy", label: "Privacy" },
  { href: "/copyright", label: "Copyright" },
];

export type HeaderProps = {
  user: Pick<Profile, "handle" | "display_name" | "avatar_url"> | null;
  /** Shows the Admin link. */
  isAdmin?: boolean;
  unread?: number;
  /** Name for the nav landmark. Needs to be unique if there are several on a page. */
  navLabel?: string;
};

/**
 * Top bar. Wide: logo, nav, upload, bell, theme, avatar menu. Narrow (container
 * query, so it also works inside the /design phone frame): logo, upload,
 * menu button that opens the rest in a sheet.
 */
export function SiteHeader({
  user,
  isAdmin = false,
  unread = 0,
  navLabel = "Main",
}: HeaderProps) {
  const pathname = usePathname();

  return (
    <header className="@container sticky top-0 z-40 border-b bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-4 @3xl:gap-6">
        <Link
          href="/"
          className="-ml-1 rounded-md p-1 outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Logo />
        </Link>

        <nav aria-label={navLabel} className="hidden @3xl:block">
          <ul className="flex items-center gap-1">
            {NAV.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={pathname === item.href ? "page" : undefined}
                  className="rounded-md px-2.5 py-1.5 text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring aria-[current=page]:text-foreground"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="ml-auto flex items-center gap-1">
          <Button asChild size="sm" className="mr-1">
            <Link href="/upload">
              <PlusIcon />
              Upload
            </Link>
          </Button>
          <div className="hidden items-center gap-1 @3xl:flex">
            {user ? (
              <Button variant="ghost" size="icon" asChild className="relative">
                <Link
                  href="/notifications"
                  aria-label={
                    unread ? `Notifications, ${unread} new` : "Notifications"
                  }
                >
                  <BellIcon />
                  {unread ? (
                    <span
                      aria-hidden="true"
                      className="absolute top-1.5 right-1.5 size-2 rounded-full bg-primary ring-2 ring-background"
                    />
                  ) : null}
                </Link>
              </Button>
            ) : null}
            <ThemeToggle />
            {user ? (
              <UserMenu user={user} isAdmin={isAdmin} />
            ) : (
              <Button variant="ghost" size="sm" asChild>
                <Link href="/login">Sign in</Link>
              </Button>
            )}
          </div>

          <MobileMenu
            user={user}
            isAdmin={isAdmin}
            unread={unread}
            navLabel={navLabel}
            pathname={pathname}
          />
        </div>
      </div>
    </header>
  );
}

function SiteFooter() {
  return (
    <footer className="mt-24 border-t">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <p>Need Ears is free and open source.</p>
        <nav aria-label="Legal and info">
          <ul className="flex flex-wrap gap-x-4 gap-y-2">
            {LEGAL.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="rounded-xs outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </footer>
  );
}

/** Page frame: skip link, top bar, main, footer. */
export function AppShell({
  children,
  className,
  ...header
}: HeaderProps & { children: React.ReactNode; className?: string }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="fixed top-2 left-2 z-50 -translate-y-16 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-transform focus-visible:translate-y-0 focus-visible:outline-none"
      >
        Skip to content
      </a>
      <SiteHeader {...header} />
      {header.user ? (
        <form id={SIGN_OUT_FORM} action="/auth/signout" method="post" hidden />
      ) : null}
      <main
        id="main"
        tabIndex={-1}
        className={cn("flex-1 outline-none", className)}
      >
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
