"use client";

import { ArrowLeftRightIcon } from "lucide-react";

import { RelativeTime } from "@/components/common/relative-time";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { TrackVersion } from "@/types/view";

/** The version A/B flips to: the one picked before, or else the one before current. */
export function abPartner(
  versions: TrackVersion[],
  currentId: string,
  previousId?: string | null,
) {
  if (
    previousId &&
    previousId !== currentId &&
    versions.some((v) => v.id === previousId)
  ) {
    return previousId;
  }
  const sorted = [...versions].sort((a, b) => a.version_no - b.version_no);
  const index = sorted.findIndex((v) => v.id === currentId);
  const other = sorted[index - 1] ?? sorted[index + 1];
  return other?.id ?? null;
}

/**
 * Version chips (v1, v2, v3) above the player, an A/B button that flips to the
 * other version at the same second, and the owner's note on what changed.
 * Hidden entirely for a track with one version.
 */
export function VersionPicker({
  versions,
  currentId,
  previousId,
  onSelect,
  className,
}: {
  versions: TrackVersion[];
  currentId: string;
  /** The version picked before this one, so A/B goes back to it. */
  previousId?: string | null;
  onSelect: (versionId: string) => void;
  className?: string;
}) {
  if (versions.length < 2) return null;
  const sorted = [...versions].sort((a, b) => a.version_no - b.version_no);
  const current =
    sorted.find((v) => v.id === currentId) ?? sorted[sorted.length - 1]!;
  const latest = sorted[sorted.length - 1]!;
  const partnerId = abPartner(sorted, current.id, previousId);
  const partner = sorted.find((v) => v.id === partnerId);

  return (
    <div className={cn("@container grid gap-2", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <div
          role="radiogroup"
          aria-label="Version"
          className="flex flex-wrap gap-1.5"
        >
          {sorted.map((version) => {
            const checked = version.id === current.id;
            return (
              <button
                key={version.id}
                type="button"
                role="radio"
                aria-checked={checked}
                // Arrow keys move between versions like a radio group.
                tabIndex={checked ? 0 : -1}
                onClick={() => onSelect(version.id)}
                onKeyDown={(e) => {
                  const index = sorted.indexOf(version);
                  const step =
                    e.key === "ArrowRight" || e.key === "ArrowDown"
                      ? 1
                      : e.key === "ArrowLeft" || e.key === "ArrowUp"
                        ? -1
                        : 0;
                  if (!step) return;
                  e.preventDefault();
                  const next =
                    sorted[(index + step + sorted.length) % sorted.length]!;
                  onSelect(next.id);
                  const group = e.currentTarget.parentElement;
                  requestAnimationFrame(() =>
                    group
                      ?.querySelector<HTMLButtonElement>("[aria-checked=true]")
                      ?.focus(),
                  );
                }}
                className={cn(
                  "inline-flex h-8 items-center gap-1 rounded-full border px-3 text-[13px] font-medium transition-colors duration-(--duration-fast) outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  checked
                    ? "border-transparent bg-foreground text-background"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                v{version.version_no}
                {version.id === latest.id ? (
                  <span
                    className={cn(
                      "text-xs font-normal",
                      checked ? "" : "text-muted-foreground",
                    )}
                  >
                    latest
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
        {partner ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onSelect(partner.id)}
            className="rounded-full"
          >
            <ArrowLeftRightIcon />
            A/B
            <span className="sr-only">: switch to</span>
            <span className="text-muted-foreground">v{partner.version_no}</span>
            <span className="sr-only">at the same second</span>
          </Button>
        ) : null}
      </div>
      <p
        className="text-sm text-pretty text-muted-foreground"
        aria-live="polite"
      >
        <span className="font-medium text-foreground">
          What changed in v{current.version_no}
        </span>
        <span className="text-xs">
          {" "}
          (<RelativeTime date={current.created_at} />)
        </span>
        <span className="mt-0.5 block break-words">
          {current.note?.trim() ||
            (current.version_no === 1
              ? "The first upload."
              : "No notes for this version.")}
        </span>
      </p>
    </div>
  );
}
