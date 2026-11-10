import type { Metadata } from "next";
import Content from "@/content/guidelines.mdx";
import { Page } from "@/components/shell/page";

export const metadata: Metadata = {
  title: "Community guidelines",
  description: "How to give and take feedback on Need Ears.",
  alternates: { canonical: "/guidelines" },
};

export default function GuidelinesPage() {
  return (
    // The page column, with the text kept to a readable measure inside it.
    <Page width="narrow">
      <article className="max-w-prose">
        <Content />
      </article>
    </Page>
  );
}
