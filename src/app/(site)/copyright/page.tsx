import type { Metadata } from "next";
import Content from "@/content/copyright.mdx";
import { Page } from "@/components/shell/page";

export const metadata: Metadata = {
  title: "Copyright",
  description: "How to report a track that someone had no right to upload.",
  alternates: { canonical: "/copyright" },
};

export default function CopyrightPage() {
  return (
    // The page column, with the text kept to a readable measure inside it.
    <Page width="narrow">
      <article className="max-w-prose">
        <Content />
      </article>
    </Page>
  );
}
