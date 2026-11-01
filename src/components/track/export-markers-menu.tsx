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
      <Button variant="outline" size="sm" disabled className="rounded-full">
        <DownloadIcon /> Export markers
      </Button>
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
 * The same choices as a submenu, for the track's own menu. Disabled while
 * no comment has a time.
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
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger disabled={timedCommentCount === 0}>
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
