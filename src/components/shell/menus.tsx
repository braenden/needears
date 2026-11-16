"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { ChevronRightIcon } from "lucide-react";
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import type { HeaderProps } from "./app-shell";
import { SIGN_OUT_FORM } from "./nav";
import { THEME_CHOICES, useMounted } from "./theme-toggle";

type Account = NonNullable<HeaderProps["user"]>;

const rowClasses =
  "flex h-11 items-center rounded-md px-3 text-[15px] focus-ring outline-none hover:bg-accent aria-[current=page]:bg-accent";

/**
 * The theme as a row like the others in the menu: its name, and the one in
 * use on the right. Choosing the row moves to the next one (dark, light,
 * the system's).
 */
function useThemeRow() {
  const { theme, setTheme } = useTheme();
  const mounted = useMounted();
  const at = THEME_CHOICES.findIndex((choice) => choice.value === theme);
  const next = THEME_CHOICES[(at + 1) % THEME_CHOICES.length];
  return {
    // Only known in the browser.
    label: (mounted && THEME_CHOICES[at]?.label) || "",
    change: () => setTheme(next?.value ?? "dark"),
  };
}

/** The avatar that opens the account menu, on every width. */
function AccountButton({
  user,
  ...props
}: { user: Account } & React.ComponentProps<typeof Button>) {
  return (
    <Button
      variant="ghost"
      size="icon"
      className="touch-hit rounded-full"
      {...props}
    >
      <UserAvatar profile={user} size="sm" anonymous={user.needsHandle} />
      <span className="sr-only">Account menu</span>
    </Button>
  );
}

/**
 * Phones: the avatar opens the account menu as a sheet from the right.
 * The same rows, in the same order, as the menu on wide screens.
 */
export function MobileMenu({
  user,
  isAdmin = false,
  pathname,
}: {
  user: Account;
  isAdmin?: boolean;
  pathname: string;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const close = () => setMenuOpen(false);
  const themeRow = useThemeRow();
  const links = [
    { href: "/settings", label: "Settings" },
    ...(isAdmin ? [{ href: "/admin", label: "Admin" }] : []),
  ];
  return (
    <Dialog open={menuOpen} onOpenChange={setMenuOpen}>
      <DialogTrigger asChild>
        <AccountButton user={user} />
      </DialogTrigger>
      <DialogContent className="top-0 right-0 left-auto h-dvh max-h-none w-[min(20rem,100%)] max-w-none translate-x-0 translate-y-0 content-start rounded-none rounded-l-2xl duration-slow sm:max-w-none data-open:zoom-in-100 data-open:slide-in-from-right data-closed:duration-base data-closed:zoom-out-100 data-closed:slide-out-to-right">
        <DialogTitle className="sr-only">Account</DialogTitle>
        <DialogDescription className="sr-only">
          Your profile, settings and theme
        </DialogDescription>
        <ProfileRow
          user={user}
          pathname={pathname}
          onNavigate={close}
          className="mr-10"
        />
        <nav aria-label="Account">
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
        <button
          type="button"
          onClick={themeRow.change}
          className={`${rowClasses} justify-between text-left`}
        >
          Theme
          <span className="text-muted-foreground">{themeRow.label}</span>
        </button>
        <button
          type="submit"
          form={SIGN_OUT_FORM}
          className={`${rowClasses} text-left text-muted-foreground hover:text-foreground`}
        >
          Sign out
        </button>
      </DialogContent>
    </Dialog>
  );
}

/** At the top of the menu: who you are, and the way to your profile. */
function ProfileRow({
  user,
  pathname,
  onNavigate,
  className,
}: {
  user: Account;
  pathname: string;
  onNavigate?: () => void;
  className?: string;
}) {
  const href = user.needsHandle ? "/welcome" : `/u/${user.handle}`;
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={pathname === href ? "page" : undefined}
      className={`flex items-center gap-3 rounded-md px-3 py-2 focus-ring outline-none hover:bg-accent aria-[current=page]:bg-accent ${className ?? ""}`}
    >
      <UserAvatar profile={user} size="lg" anonymous={user.needsHandle} />
      {user.needsHandle ? (
        <span className="min-w-0 flex-1 font-semibold">Pick a username</span>
      ) : (
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">
            {displayNameOf(user)}
          </span>
          <span className="block truncate text-sm text-muted-foreground">
            @{user.handle}
          </span>
        </span>
      )}
      <ChevronRightIcon
        className="size-4 shrink-0 text-muted-foreground"
        aria-hidden="true"
      />
    </Link>
  );
}

/** Wide screens: the avatar opens the account menu. */
export function UserMenu({
  user,
  isAdmin,
}: {
  user: Account;
  isAdmin: boolean;
}) {
  const themeRow = useThemeRow();
  const [nameShown, setNameShown] = useState(false);
  // When the menu closes, the focus goes back to the avatar. Nobody asked
  // what the button is then, so its name stays away (it used to show and
  // hang there after picking a row).
  const focusComingBack = useRef(false);
  return (
    <DropdownMenu
      onOpenChange={(open) => {
        if (open) setNameShown(false);
      }}
    >
      {/* Its name on hover, like the other icons in the top bar. */}
      <Tooltip
        open={nameShown}
        onOpenChange={(open) => {
          if (open && focusComingBack.current) return;
          setNameShown(open);
        }}
      >
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <AccountButton user={user} />
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>Account</TooltipContent>
      </Tooltip>
      <DropdownMenuContent
        align="end"
        className="w-64"
        onCloseAutoFocus={() => {
          focusComingBack.current = true;
          setTimeout(() => {
            focusComingBack.current = false;
          }, 0);
        }}
      >
        <DropdownMenuItem asChild>
          <Link
            href={user.needsHandle ? "/welcome" : `/u/${user.handle}`}
            className="flex items-center gap-3"
          >
            <UserAvatar profile={user} anonymous={user.needsHandle} />
            {user.needsHandle ? (
              <span className="min-w-0 flex-1 font-semibold">
                Pick a username
              </span>
            ) : (
              <span className="grid min-w-0 flex-1 gap-0">
                <span className="truncate font-semibold">
                  {displayNameOf(user)}
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  @{user.handle}
                </span>
              </span>
            )}
            <ChevronRightIcon
              className="text-muted-foreground"
              aria-hidden="true"
            />
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/settings">Settings</Link>
        </DropdownMenuItem>
        {isAdmin ? (
          <DropdownMenuItem asChild>
            <Link href="/admin">Admin</Link>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem
          // Changing the theme keeps the menu open, so the change shows.
          onSelect={(event) => {
            event.preventDefault();
            themeRow.change();
          }}
          className="justify-between"
        >
          Theme
          <span className="text-muted-foreground">{themeRow.label}</span>
        </DropdownMenuItem>
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
