"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Button } from "@/components/ui/button";

/** "Sign in", and back to this page after. */
export function SignInHere({
  className,
  label = "Sign in",
}: {
  className?: string;
  label?: string;
}) {
  const pathname = usePathname();
  return (
    <Button size="lg" className={className} asChild>
      <Link href={`/login?${new URLSearchParams({ next: pathname })}`}>
        {label}
      </Link>
    </Button>
  );
}
