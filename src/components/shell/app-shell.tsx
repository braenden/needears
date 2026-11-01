"use client";

import { Suspense } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { BellIcon, MenuIcon, PlusIcon, SearchIcon } from "lucide-react";

import { Logo } from "@/components/brand/logo";
import { SearchField } from "@/components/search/search-field";

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
      className="touch-hit @min-[40rem]:hidden"
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
      className="touch-hit rounded-full"
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
  /** Search box (wide) or search button (narrow). */
  showSearch?: boolean;
  /** Let / focus the search box. Only one header on a page should. */
  searchShortcut?: boolean;
  /** Where the search form goes. */
  searchAction?: string;
};

const SEARCH_CLASSES = "hidden w-full @min-[40rem]:block";

/**
 * The search box in the top bar. On the results page it holds the search,
 * so there is only one box to change it in, and it is ready to type in
 * when nothing has been searched yet.
 */
function HeaderSearch({
  action,
  ...props
}: {
  shortcut: boolean;
  action: string;
  className: string;
}) {
  const pathname = usePathname();
  const params = useSearchParams();
  const onResults = pathname === action;
  // The results page reads at most 100 characters too.
  const query = onResults ? (params.get("q") ?? "").slice(0, 100) : "";
  return (
    <SearchField
      key={query}
      defaultValue={query}
      autoFocus={onResults && !query}
      action={action}
      {...props}
    />
  );
}

/**
 * Top bar. Wide: logo, nav, upload, bell, theme, avatar menu. Narrow (below
 * 640 pixels, a container query so it also works inside the /design phone
 * frame): logo, upload, bell, menu button that opens the rest in a sheet.
 */
export function SiteHeader({
  user,
  isAdmin = false,
  unread = 0,
  navLabel = "Main",
  showSearch = false,
  searchShortcut = true,
  searchAction = "/search",
}: HeaderProps) {
  const pathname = usePathname();
  const uploading = pathname === "/upload";

  return (
    <header className="@container sticky top-0 z-40 border-b bg-background">
      {/* Wide: three zones, with the search in the middle on the same axis
          as the page column below. Narrow: logo left, buttons right. */}
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-4 @min-[40rem]:grid @min-[40rem]:grid-cols-[1fr_minmax(0,30rem)_1fr] @min-[40rem]:gap-6">
        <div className="flex items-center gap-6">
          <Link
            href="/"
            className="-ml-1 shrink-0 rounded-md p-1 focus-ring outline-none"
          >
            <Logo />
          </Link>

          <nav aria-label={navLabel} className="hidden @min-[40rem]:block">
            <ul className="flex items-center gap-1">
              {NAV.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={pathname === item.href ? "page" : undefined}
                    className="touch-hit rounded-md px-2.5 py-1.5 text-sm text-muted-foreground focus-ring outline-none hover:text-foreground aria-[current=page]:text-foreground"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        {showSearch ? (
          <Suspense
            fallback={
              <SearchField
                shortcut={searchShortcut}
                action={searchAction}
                className={SEARCH_CLASSES}
              />
            }
          >
            <HeaderSearch
              shortcut={searchShortcut}
              action={searchAction}
              className={SEARCH_CLASSES}
            />
          </Suspense>
        ) : (
          <div className="hidden @min-[40rem]:block" />
        )}

        <div className="ml-auto flex items-center justify-end gap-1">
          {showSearch ? (
            <Button
              variant="ghost"
              size="icon"
              asChild
              className="touch-hit @min-[40rem]:hidden"
            >
              <Link href={searchAction} aria-label="Search">
                <SearchIcon />
              </Link>
            </Button>
          ) : null}
          {/* Just the plus on the narrowest phones, so the bell fits. On the
              upload page it steps back: it would only lead to itself. */}
          <Button
            asChild
            size="sm"
            variant={uploading ? "secondary" : "default"}
            className="touch-hit mr-1 w-8 px-0 @min-[25rem]:w-auto @min-[25rem]:px-3"
          >
            <Link href="/upload" aria-current={uploading ? "page" : undefined}>
              <PlusIcon />
              <span className="sr-only @min-[25rem]:not-sr-only">Upload</span>
            </Link>
          </Button>
          {user ? (
            <Button
              variant="ghost"
              size="icon"
              asChild
              className="touch-hit relative"
            >
              <Link
                href="/notifications"
                aria-current={
                  pathname === "/notifications" ? "page" : undefined
                }
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
          {/* Signed in, the theme is in the account menu. */}
          <div className="hidden items-center gap-1 @min-[40rem]:flex">
            {user ? (
              <UserMenu user={user} isAdmin={isAdmin} />
            ) : (
              <>
                <ThemeToggle />
                <Button variant="ghost" size="sm" asChild>
                  <Link href="/login">Sign in</Link>
                </Button>
              </>
            )}
          </div>

          <MobileMenu
            user={user}
            isAdmin={isAdmin}
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
          <ul className="flex flex-wrap gap-x-4 gap-y-2 coarse:gap-y-0">
            {LEGAL.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="rounded-xs focus-ring outline-none hover:text-foreground coarse:inline-flex coarse:min-h-11 coarse:items-center"
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
