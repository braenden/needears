"use client";

import { DownloadIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type MarkerFormat = "csv" | "txt" | "reaper";

const FORMATS: { format: MarkerFormat; label: string; note: string }[] = [
  { format: "csv", label: "CSV", note: "For a spreadsheet or most DAWs" },
  { format: "txt", label: "Text", note: "Times and comments, one per line" },
  {
    format: "reaper",
    label: "Reaper markers",
    note: "Import in Reaper's region and marker manager",
  },
];

/** Why there is nothing to export yet. */
const NOTHING_YET = "No comments with a time yet";

export function markersHref(trackId: string, format: MarkerFormat) {
  return `/api/tracks/${trackId}/markers?format=${format}`;
}

/**
 * "Export markers" on the track page: the timed comments as markers to pull
 * into a DAW. Each item is a plain download link.
 */
export function ExportMarkersMenu({
  trackId,
  timedCommentCount,
  hrefFor = markersHref,
}: {
  trackId: string;
  /** Comments with a time. With none there is nothing to export. */
  timedCommentCount: number;
  hrefFor?: (trackId: string, format: MarkerFormat) => string;
}) {
  if (timedCommentCount === 0) {
    return (
      <span className="inline-flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled
          className="rounded-full"
          aria-describedby={`${trackId}-markers-none`}
        >
          <DownloadIcon /> Export markers
        </Button>
        <span
          id={`${trackId}-markers-none`}
          className="text-xs text-muted-foreground"
        >
          {NOTHING_YET}
        </span>
      </span>
    );
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="rounded-full">
          <DownloadIcon /> Export markers
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="font-normal text-muted-foreground">
          {timedCommentCount} {timedCommentCount === 1 ? "comment" : "comments"}{" "}
          as markers
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {FORMATS.map(({ format, label, note }) => (
          <DropdownMenuItem key={format} asChild>
            <a
              href={hrefFor(trackId, format)}
              download
              className="flex flex-col items-start gap-0.5"
            >
              <span>{label}</span>
              <span className="text-xs text-muted-foreground">{note}</span>
            </a>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * The same choices as a submenu, for the track's own menu. While no comment
 * has a time, a disabled item that says so.
 */
export function ExportMarkersSubmenu({
  trackId,
  timedCommentCount,
  hrefFor = markersHref,
}: {
  trackId: string;
  timedCommentCount: number;
  hrefFor?: (trackId: string, format: MarkerFormat) => string;
}) {
  if (timedCommentCount === 0) {
    return (
      <DropdownMenuItem
        disabled
        className="items-start data-disabled:opacity-100"
      >
        <DownloadIcon className="mt-0.5 opacity-50" />
        <span className="grid gap-0.5">
          <span className="opacity-50">Export markers</span>
          <span className="text-xs text-muted-foreground">{NOTHING_YET}</span>
        </span>
      </DropdownMenuItem>
    );
  }
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <DownloadIcon /> Export markers
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="w-64">
        <DropdownMenuLabel className="font-normal text-muted-foreground">
          {timedCommentCount} {timedCommentCount === 1 ? "comment" : "comments"}{" "}
          as markers
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {FORMATS.map(({ format, label, note }) => (
          <DropdownMenuItem key={format} asChild>
            <a
              href={hrefFor(trackId, format)}
              download
              className="flex flex-col items-start gap-0.5"
            >
              <span>{label}</span>
              <span className="text-xs text-muted-foreground">{note}</span>
            </a>
          </DropdownMenuItem>
        ))}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}
