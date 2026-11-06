"use client";

import { useId, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDownIcon, Loader2Icon } from "lucide-react";
import type { Genre } from "@/types/view";

/**
 * The genre, as a quiet "All genres" beside the feed's tabs ("Genre" on a
 * phone, where the tabs need the room). A real select, laid invisibly over
 * its label, so the keyboard and the phone's own picker work and it is
 * only as wide as its words.
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
  const picked = genres.find((g) => g.slug === value);

  return (
    <div className="relative mb-2 inline-flex h-7 shrink-0 items-center gap-1 rounded-md px-1.5 text-[13px] whitespace-nowrap text-muted-foreground hover:bg-accent hover:text-foreground has-[select:focus-visible]:outline-2 has-[select:focus-visible]:outline-offset-2 has-[select:focus-visible]:outline-ring">
      <span aria-hidden="true" className="max-w-32 truncate">
        {picked ? (
          picked.name
        ) : (
          <>
            <span className="sm:hidden">Genre</span>
            <span className="hidden sm:inline">All genres</span>
          </>
        )}
      </span>
      {pending ? (
        <Loader2Icon className="size-3.5 animate-spin" aria-hidden="true" />
      ) : (
        <ChevronDownIcon className="size-3.5" aria-hidden="true" />
      )}
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
        className="absolute inset-0 cursor-pointer appearance-none opacity-0 outline-none [&_option]:bg-popover [&_option]:text-popover-foreground"
      >
        <option value="">All genres</option>
        {genres.map((g) => (
          <option key={g.slug} value={g.slug}>
            {g.name}
          </option>
        ))}
      </select>
    </div>
  );
}
