"use client";

import { useState } from "react";

import { NewVersionDialog } from "@/components/versions/new-version-dialog";
import { useCoarsePointer } from "@/hooks/use-coarse-pointer";
import { createVersionPipeline } from "@/lib/upload/pipeline";
import type { TrackVersion } from "@/types/view";

/** The owner's "Upload a new version", with the real browser pipeline. */
export function NewVersion({
  trackId,
  trackTitle,
  versionCount,
  onPublished,
  onLive,
  onClose,
}: {
  trackId: string;
  trackTitle: string;
  versionCount: number;
  onPublished: (version: TrackVersion) => void;
  /** The moment it is published, while the dialog still says so. */
  onLive?: (version: TrackVersion) => void;
  /** Opened from the track's menu; runs when the dialog closes. */
  onClose?: () => void;
}) {
  const [pipeline] = useState(() => createVersionPipeline(trackId));
  const isMobile = useCoarsePointer();
  return (
    <NewVersionDialog
      trackTitle={trackTitle}
      versionCount={versionCount}
      pipeline={pipeline}
      onPublished={onPublished}
      onLive={onLive}
      isMobile={isMobile}
      onClose={onClose}
    />
  );
}
