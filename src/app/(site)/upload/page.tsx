import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { site } from "@/config/site";
import { getGenres } from "@/lib/data/profiles";
import { getViewer } from "@/lib/data/viewer";
import { Uploader } from "./uploader";

export const metadata: Metadata = {
  title: "Upload a track",
  robots: { index: false },
};

export default async function UploadPage() {
  const [viewer, genres] = await Promise.all([getViewer(), getGenres()]);
  if (!viewer) redirect("/login?next=/upload");
  return (
    <div className="px-4 py-8 sm:py-12">
      <h1 className="sr-only">Upload a track</h1>
      <Uploader genres={genres} contactEmail={site.contactEmail} />
    </div>
  );
}
