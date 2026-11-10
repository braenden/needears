import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { DesignGallery } from "./_components/design-gallery";

// In production this page is a 404, and keeps the site's plain title.
export const metadata: Metadata = {
  ...(process.env.NODE_ENV === "production" ? {} : { title: "Design system" }),
  robots: { index: false, follow: false },
};

/** Living style guide. Development only: production builds return 404. */
export default function DesignPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <DesignGallery />;
}
