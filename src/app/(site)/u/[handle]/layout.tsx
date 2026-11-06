import { notFound, redirect } from "next/navigation";
import { currentHandleFor } from "@/lib/data/profiles";
import { loadProfile } from "./load";

// Answers a missing profile with a real 404 before the page's loading
// state starts streaming (after that the status can no longer change). An
// old handle goes to the profile's current one, with a temporary redirect:
// someone else may take the old handle later.
export default async function ProfileLayout({
  children,
  params,
}: LayoutProps<"/u/[handle]">) {
  const { handle } = await params;
  if (!(await loadProfile(handle))) {
    const current = await currentHandleFor(handle);
    if (current) redirect(`/u/${current}`);
    notFound();
  }
  return children;
}
