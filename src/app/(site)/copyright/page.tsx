import type { Metadata } from "next";
import Content from "@/content/copyright.mdx";

export const metadata: Metadata = {
  title: "Copyright",
  description: "How to report a track that someone had no right to upload.",
  alternates: { canonical: "/copyright" },
};

export default function Page() {
  return (
    <article className="mx-auto w-full max-w-prose px-4 py-10 sm:py-14">
      <Content />
    </article>
  );
}
