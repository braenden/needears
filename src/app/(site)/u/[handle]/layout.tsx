import { notFound } from "next/navigation";
import { loadProfile } from "./load";

// Answers a missing profile with a real 404 before the page's loading
// state starts streaming (after that the status can no longer change).
export default async function ProfileLayout({
  children,
  params,
}: LayoutProps<"/u/[handle]">) {
  const { handle } = await params;
  if (!(await loadProfile(handle))) notFound();
  return children;
}
