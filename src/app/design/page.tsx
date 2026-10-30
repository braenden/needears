import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { DesignGallery } from "./_components/design-gallery";

export const metadata: Metadata = {
  title: "Design system | Need Ears",
  robots: { index: false, follow: false },
};

/** Living style guide. Development only: production builds return 404. */
export default function DesignPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <DesignGallery />;
}
