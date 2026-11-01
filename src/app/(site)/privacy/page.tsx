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
    // The page column, with the text kept to a readable measure inside it.
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:py-14">
      <article className="max-w-prose">
        <Content />
      </article>
    </div>
  );
}
