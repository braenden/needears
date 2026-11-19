"use client";

import { useState } from "react";
import { initialUploadState } from "@/components/upload/upload-state";
import { UploadWizard } from "@/components/upload/upload-wizard";
import { useCoarsePointer } from "@/hooks/use-coarse-pointer";
import { createUploadPipeline } from "@/lib/upload/pipeline";
import type { Genre, TrackLevel } from "@/types/view";

export function Uploader({
  genres,
  contactEmail,
  level,
  group,
  memberOf,
}: {
  genres: Genre[];
  contactEmail: string;
  /** Uploading in this group, from its page. */
  group: { id: string; slug: string; name: string } | null;
  /** The groups the uploader is in, when uploading to the feed. */
  memberOf: { slug: string; name: string }[];
  /** From the last track, as a start. */
  level: TrackLevel | null;
}) {
  const [pipeline] = useState(() => createUploadPipeline(group?.id ?? null));
  const isMobile = useCoarsePointer();
  return (
    <UploadWizard
      pipeline={pipeline}
      genres={genres}
      isMobile={isMobile}
      contactEmail={contactEmail}
      group={group ? { slug: group.slug, name: group.name } : null}
      memberOf={memberOf}
      initialState={{ details: { ...initialUploadState.details, level } }}
    />
  );
}
