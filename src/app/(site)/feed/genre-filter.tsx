"use client";

import { useId, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2Icon } from "lucide-react";
import { NativeSelect } from "@/components/ui/native-select";
import type { Genre } from "@/types/view";

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
    <div className="flex items-center gap-2">
      <label htmlFor={id} className="text-sm text-muted-foreground">
        Genre
      </label>
      <NativeSelect
        id={id}
        value={value}
        onChange={(e) => {
          const params = new URLSearchParams({ tab });
          if (e.target.value) params.set("genre", e.target.value);
          startTransition(() => router.push(`/feed?${params}`));
        }}
        className="h-9 w-44"
      >
        <option value="">All genres</option>
        {genres.map((g) => (
          <option key={g.slug} value={g.slug}>
            {g.name}
          </option>
        ))}
      </NativeSelect>
      <span className="size-4" aria-hidden="true">
        {pending ? (
          <Loader2Icon className="size-4 animate-spin text-muted-foreground" />
        ) : null}
      </span>
    </div>
  );
}
