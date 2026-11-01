"use client";

import { useState } from "react";
import Link from "next/link";
import { MenuIcon } from "lucide-react";

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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import type { HeaderProps } from "./app-shell";
import { NAV, SIGN_OUT_FORM } from "./nav";
import { ThemeToggle } from "./theme-toggle";

/** Narrow screens: everything behind the menu button, in a sheet. */
export function MobileMenu({
  user,
  isAdmin = false,
  navLabel = "Main",
  pathname,
}: HeaderProps & { pathname: string }) {
  const [menuOpen, setMenuOpen] = useState(false);
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
        {user ? (
          <div className="flex items-center gap-3 pr-10">
            <UserAvatar profile={user} size="lg" />
            <div className="min-w-0">
              <p className="truncate font-semibold">{displayNameOf(user)}</p>
              <p className="truncate text-sm text-muted-foreground">
                @{user.handle}
              </p>
            </div>
          </div>
        ) : null}
        <nav aria-label={`${navLabel}, mobile`}>
          <ul className="grid gap-0.5">
            {[
              ...NAV,
              ...(user
                ? [
                    { href: `/u/${user.handle}`, label: "Your profile" },
                    { href: "/settings", label: "Settings" },
                    ...(isAdmin ? [{ href: "/admin", label: "Admin" }] : []),
                  ]
                : [{ href: "/login", label: "Sign in" }]),
            ].map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={() => setMenuOpen(false)}
                  aria-current={pathname === item.href ? "page" : undefined}
                  className="flex h-11 items-center rounded-md px-3 text-[15px] outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring aria-[current=page]:bg-accent"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="flex items-center justify-between border-t pt-4 text-sm text-muted-foreground">
          Theme
          <ThemeToggle />
        </div>
        {user ? (
          <Button
            type="submit"
            form={SIGN_OUT_FORM}
            variant="ghost"
            className="justify-start text-muted-foreground"
          >
            Sign out
          </Button>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export function UserMenu({
  user,
  isAdmin,
}: {
  user: NonNullable<HeaderProps["user"]>;
  isAdmin: boolean;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="touch-hit rounded-full">
          <UserAvatar profile={user} />
          <span className="sr-only">Account menu</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel className="font-normal">
          <span className="block truncate font-semibold text-foreground">
            {displayNameOf(user)}
          </span>
          <span className="block truncate text-xs text-muted-foreground">
            @{user.handle}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href={`/u/${user.handle}`}>Your profile</Link>
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
        <DropdownMenuItem asChild>
          <button type="submit" form={SIGN_OUT_FORM} className="w-full">
            Sign out
          </button>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
