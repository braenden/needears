"use client";

import { useState, useSyncExternalStore } from "react";
import { UploadWizard } from "@/components/upload/upload-wizard";
import { createUploadPipeline } from "@/lib/upload/pipeline";
import type { Genre } from "@/types/view";

// Phones get the lower file size limit (plan part 7). A coarse pointer is
// a better signal than the screen width for "this is a phone or tablet".
const coarse = "(pointer: coarse)";
function subscribe(callback: () => void) {
  const query = window.matchMedia(coarse);
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}

export function Uploader({
  genres,
  contactEmail,
}: {
  genres: Genre[];
  contactEmail: string;
}) {
  const [pipeline] = useState(createUploadPipeline);
  const isMobile = useSyncExternalStore(
    subscribe,
    () => window.matchMedia(coarse).matches,
    () => false,
  );
  return (
    <UploadWizard
      pipeline={pipeline}
      genres={genres}
      isMobile={isMobile}
      contactEmail={contactEmail}
    />
  );
}
