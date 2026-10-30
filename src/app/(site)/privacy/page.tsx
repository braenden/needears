import type { Metadata } from "next";
import Content from "@/content/privacy.mdx";

export const metadata: Metadata = {
  title: "Privacy policy",
  description:
    "What Need Ears stores about you, why, and how to see or delete it.",
  alternates: { canonical: "/privacy" },
};

export default function Page() {
  return (
    <article className="mx-auto w-full max-w-prose px-4 py-10 sm:py-14">
      <Content />
    </article>
  );
}
