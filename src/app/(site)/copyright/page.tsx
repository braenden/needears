import type { Metadata } from "next";
import Content from "@/content/copyright.mdx";

export const metadata: Metadata = {
  title: "Copyright",
  description: "How to report a track that someone had no right to upload.",
  alternates: { canonical: "/copyright" },
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
