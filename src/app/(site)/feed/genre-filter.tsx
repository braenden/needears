"use client";

import { useId, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDownIcon, Loader2Icon } from "lucide-react";
import type { Genre } from "@/types/view";

/**
 * The genre, as a quiet "All genres" beside the feed's tabs. A real
 * select, so the keyboard and the phone's own picker work.
 */
export function GenreFilter({
  genres,
  value,
  tab,
}: {
  genres: Genre[];
  value: string;
  tab: string;
}) {
  const id = useId();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div className="relative mb-2 flex shrink-0 items-center">
      <label htmlFor={id} className="sr-only">
        Genre
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => {
          const params = new URLSearchParams({ tab });
          if (e.target.value) params.set("genre", e.target.value);
          startTransition(() => router.push(`/feed?${params}`));
        }}
        className="h-7 max-w-40 cursor-pointer appearance-none truncate rounded-md bg-transparent pr-6 pl-1.5 text-[13px] text-muted-foreground focus-ring outline-none hover:bg-accent hover:text-foreground [&_option]:bg-popover [&_option]:text-popover-foreground"
      >
        <option value="">All genres</option>
        {genres.map((g) => (
          <option key={g.slug} value={g.slug}>
            {g.name}
          </option>
        ))}
      </select>
      {pending ? (
        <Loader2Icon
          className="pointer-events-none absolute right-1.5 size-3.5 animate-spin text-muted-foreground"
          aria-hidden="true"
        />
      ) : (
        <ChevronDownIcon
          className="pointer-events-none absolute right-1.5 size-3.5 text-muted-foreground"
          aria-hidden="true"
        />
      )}
    </div>
  );
}
