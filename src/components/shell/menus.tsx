"use client";

import { useState } from "react";
import Link from "next/link";
import { MenuIcon } from "lucide-react";
import { useTheme } from "next-themes";

import { displayNameOf, UserAvatar } from "@/components/common/user-avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import type { HeaderProps } from "./app-shell";
import { NAV, SIGN_OUT_FORM } from "./nav";
import { THEME_CHOICES, ThemeSegments, useMounted } from "./theme-toggle";

/** Where "Edit profile" goes: one form with everything on the profile. */
export const EDIT_PROFILE_HREF = "/settings/profile";

const rowClasses =
  "flex h-11 items-center rounded-md px-3 text-[15px] focus-ring outline-none hover:bg-accent aria-[current=page]:bg-accent";

/**
 * Narrow screens: everything behind the menu button, in a sheet. The same
 * order as the account menu on wide screens.
 */
export function MobileMenu({
  user,
  isAdmin = false,
  navLabel = "Main",
  pathname,
}: HeaderProps & { pathname: string }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const close = () => setMenuOpen(false);
  const links = [
    ...NAV,
    ...(user
      ? [
          { href: EDIT_PROFILE_HREF, label: "Edit profile" },
          { href: "/settings", label: "Settings" },
          ...(isAdmin ? [{ href: "/admin", label: "Admin" }] : []),
        ]
      : [{ href: "/login", label: "Sign in" }]),
  ];
  return (
    <Dialog open={menuOpen} onOpenChange={setMenuOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="touch-hit @min-[40rem]:hidden"
          aria-label="Menu"
        >
          <MenuIcon />
        </Button>
      </DialogTrigger>
      <DialogContent className="top-0 right-0 left-auto h-dvh max-h-none w-[min(20rem,100%)] max-w-none translate-x-0 translate-y-0 content-start rounded-none rounded-l-2xl sm:max-w-none data-open:zoom-in-100 data-open:slide-in-from-right data-closed:zoom-out-100 data-closed:slide-out-to-right">
        <DialogTitle className="sr-only">Menu</DialogTitle>
        <DialogDescription className="sr-only">
          Navigation and account
        </DialogDescription>
        {/* Every row starts on the same edge. */}
        {user ? (
          <Link
            href={`/u/${user.handle}`}
            onClick={close}
            aria-current={pathname === `/u/${user.handle}` ? "page" : undefined}
            className="mr-10 flex items-center gap-3 rounded-md px-3 py-2 focus-ring outline-none hover:bg-accent aria-[current=page]:bg-accent"
          >
            <UserAvatar profile={user} size="lg" />
            <span className="min-w-0">
              <span className="block truncate font-semibold">
                {displayNameOf(user)}
              </span>
              <span className="block truncate text-sm text-muted-foreground">
                @{user.handle}
              </span>
            </span>
          </Link>
        ) : null}
        <nav aria-label={`${navLabel}, mobile`}>
          <ul className="grid gap-0.5">
            {links.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={close}
                  aria-current={pathname === item.href ? "page" : undefined}
                  className={rowClasses}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="grid gap-2 border-t px-3 pt-4">
          <p className="text-sm text-muted-foreground">Theme</p>
          <ThemeSegments />
        </div>
        {user ? (
          <button
            type="submit"
            form={SIGN_OUT_FORM}
            className={`${rowClasses} text-left text-muted-foreground hover:text-foreground`}
          >
            Sign out
          </button>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/** Wide screens: the avatar opens the account menu. */
export function UserMenu({
  user,
  isAdmin,
}: {
  user: NonNullable<HeaderProps["user"]>;
  isAdmin: boolean;
}) {
  const { theme, setTheme } = useTheme();
  const mounted = useMounted();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="touch-hit rounded-full">
          <UserAvatar profile={user} />
          <span className="sr-only">Account menu</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
        <DropdownMenuItem asChild>
          <Link href={`/u/${user.handle}`} className="grid gap-0">
            <span className="truncate font-semibold">
              {displayNameOf(user)}
            </span>
            <span className="truncate text-xs text-muted-foreground">
              @{user.handle}
            </span>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href={EDIT_PROFILE_HREF}>Edit profile</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/settings">Settings</Link>
        </DropdownMenuItem>
        {isAdmin ? (
          <DropdownMenuItem asChild>
            <Link href="/admin">Admin</Link>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Theme</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={mounted ? theme : undefined}
          onValueChange={setTheme}
        >
          {THEME_CHOICES.map(({ value, label, Icon }) => (
            <DropdownMenuRadioItem
              key={value}
              value={value}
              // Picking a theme keeps the menu open, so the change shows.
              onSelect={(event) => event.preventDefault()}
            >
              <Icon aria-hidden="true" />
              {label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <button type="submit" form={SIGN_OUT_FORM} className="w-full">
            Sign out
          </button>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
