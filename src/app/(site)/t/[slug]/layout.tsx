import { notFound } from "next/navigation";
import { trackPageExists } from "@/lib/data/tracks";

// Answers a missing track with a real 404 before the page's loading state
// starts streaming (after that the status can no longer change).
export default async function TrackLayout({
  children,
  params,
}: LayoutProps<"/t/[slug]">) {
  const { slug } = await params;
  if (!(await trackPageExists(slug))) notFound();
  return children;
}
