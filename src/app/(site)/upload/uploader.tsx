"use client";

import { useState } from "react";
import { UploadWizard } from "@/components/upload/upload-wizard";
import { useCoarsePointer } from "@/hooks/use-coarse-pointer";
import { createUploadPipeline } from "@/lib/upload/pipeline";
import type { Genre } from "@/types/view";

export function Uploader({
  genres,
  contactEmail,
}: {
  genres: Genre[];
  contactEmail: string;
}) {
  const [pipeline] = useState(createUploadPipeline);
  const isMobile = useCoarsePointer();
  return (
    <UploadWizard
      pipeline={pipeline}
      genres={genres}
      isMobile={isMobile}
      contactEmail={contactEmail}
    />
  );
}
