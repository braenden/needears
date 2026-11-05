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
}: {
  genres: Genre[];
  contactEmail: string;
  /** From the last track, as a start. */
  level: TrackLevel | null;
}) {
  const [pipeline] = useState(createUploadPipeline);
  const isMobile = useCoarsePointer();
  return (
    <UploadWizard
      pipeline={pipeline}
      genres={genres}
      isMobile={isMobile}
      contactEmail={contactEmail}
      initialState={{ details: { ...initialUploadState.details, level } }}
    />
  );
}
