import type { Metadata } from "next";
import Content from "@/content/guidelines.mdx";

export const metadata: Metadata = {
  title: "Community guidelines",
  description: "How to give and take feedback on Need Ears.",
  alternates: { canonical: "/guidelines" },
};

export default function Page() {
  return (
    <article className="mx-auto w-full max-w-prose px-4 py-10 sm:py-14">
      <Content />
    </article>
  );
}
