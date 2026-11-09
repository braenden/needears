"use client";

import { useEffect } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BellIcon, PlusIcon, SearchIcon } from "lucide-react";

import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { Profile } from "@/types/view";

import { SIGN_OUT_FORM } from "./nav";
import { ThemeSegments } from "./theme-toggle";

// The menus need Radix dialogs and dropdowns, a big share of the page's
// JavaScript. They load after the page has painted, behind a look-alike
// avatar, so they never hold up the first render.
const avatarPlaceholder = () => (
  <Button
    variant="ghost"
    size="icon"
    className="touch-hit rounded-full"
    aria-label="Account menu"
    disabled
  >
    <span className="size-6 rounded-full bg-muted" />
  </Button>
);
const MobileMenu = dynamic(() => import("./menus").then((m) => m.MobileMenu), {
  ssr: false,
  loading: avatarPlaceholder,
});
const UserMenu = dynamic(() => import("./menus").then((m) => m.UserMenu), {
  ssr: false,
  loading: avatarPlaceholder,
});

const LEGAL = [
  { href: "/about", label: "About" },
  { href: "/guidelines", label: "Guidelines" },
  { href: "/terms", label: "Terms" },
  { href: "/privacy", label: "Privacy" },
  { href: "/copyright", label: "Copyright" },
];

export type HeaderProps = {
  user:
    | (Pick<Profile, "handle" | "display_name" | "avatar_url"> & {
        /** Signed in, but no username picked yet. */
        needsHandle?: boolean;
      })
    | null;
  /** Shows the Admin link. */
  isAdmin?: boolean;
  unread?: number;
  /** Name for the header's landmark. Unique if a page has several. */
  navLabel?: string;
  /** The search button. */
  showSearch?: boolean;
  /** Let / open the search. Only one header on a page should. */
  searchShortcut?: boolean;
  /** Where the search lives. */
  searchAction?: string;
};

function isEditable(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  );
}

/** / anywhere opens the search, as the search box in the top bar did. */
function useSearchShortcut(enabled: boolean, action: string) {
  const router = useRouter();
  useEffect(() => {
    if (!enabled) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey)
        return;
      if (isEditable(event.target) || document.querySelector("[role=dialog]"))
        return;
      event.preventDefault();
      router.push(action);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled, action, router]);
}

/** An icon button with its name on hover, for a mouse. */
function IconTip({
  label,
  children,
}: {
  label: string;
  children: React.ReactElement;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

const ICON = "touch-hit text-muted-foreground hover:text-foreground";

/**
 * Top bar: the logo (to the feed) on the left; search, Upload, the bell
 * and the account on the right. Signed out: search and Sign in. On the
 * sign in page only the logo, so there is nothing to wander off to. Below
 * 640 pixels (a container query, so it also works in the /design phone
 * frame) Upload is just the plus and the account menu opens as a sheet.
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
  const bare = pathname === "/login";
  const searching = pathname === searchAction;
  // On the search page its own field takes /.
  useSearchShortcut(
    showSearch && searchShortcut && !bare && !searching,
    searchAction,
  );

  return (
    <header
      aria-label={navLabel}
      className="@container sticky top-0 z-40 border-b bg-background"
    >
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-1 px-4">
        <Link
          href="/feed"
          // Safari does not read the name from the SVG's title.
          aria-label="Need Ears"
          className="mr-auto -ml-1 shrink-0 rounded-md p-1 focus-ring outline-none"
        >
          <Logo />
        </Link>
        {bare ? null : (
          <>
            {showSearch ? (
              <IconTip label="Search (/)">
                <Button variant="ghost" size="icon" asChild className={ICON}>
                  <Link
                    href={searchAction}
                    aria-label="Search"
                    aria-current={searching ? "page" : undefined}
                    aria-keyshortcuts={searchShortcut ? "/" : undefined}
                  >
                    <SearchIcon />
                  </Link>
                </Button>
              </IconTip>
            ) : null}
            {user ? (
              <>
                {/* Quiet: blue is for play. Just the plus on phones. */}
                <IconTip label="Upload">
                  <Button
                    asChild
                    size="sm"
                    variant="ghost"
                    className={cn(
                      ICON,
                      "w-9 px-0 @min-[40rem]:w-auto @min-[40rem]:px-3",
                      uploading && "text-foreground",
                    )}
                  >
                    <Link
                      href="/upload"
                      aria-current={uploading ? "page" : undefined}
                    >
                      <PlusIcon />
                      <span className="sr-only @min-[40rem]:not-sr-only">
                        Upload
                      </span>
                    </Link>
                  </Button>
                </IconTip>
                <IconTip label="Notifications">
                  <Button
                    variant="ghost"
                    size="icon"
                    asChild
                    className={cn(ICON, "relative")}
                  >
                    <Link
                      href="/notifications"
                      aria-current={
                        pathname === "/notifications" ? "page" : undefined
                      }
                      aria-label={
                        unread
                          ? `Notifications, ${unread} new`
                          : "Notifications"
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
                </IconTip>
                <div className="hidden @min-[40rem]:block">
                  <UserMenu user={user} isAdmin={isAdmin} />
                </div>
                <div className="@min-[40rem]:hidden">
                  <MobileMenu
                    user={user}
                    isAdmin={isAdmin}
                    pathname={pathname}
                  />
                </div>
              </>
            ) : (
              <Button variant="ghost" size="sm" asChild className="touch-hit">
                <Link href="/login">Sign in</Link>
              </Button>
            )}
          </>
        )}
      </div>
    </header>
  );
}

/** Signed out, the theme is chosen down here (signed in, in the menu). */
function SiteFooter({ signedIn }: { signedIn: boolean }) {
  const pathname = usePathname();
  // Signing in is one task: nothing else on the page.
  if (pathname === "/login") return null;
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
        {signedIn ? null : <ThemeSegments size="sm" className="w-fit" />}
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
      <SiteFooter signedIn={!!header.user} />
    </div>
  );
}
