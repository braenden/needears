import type { Metadata } from "next";
import Content from "@/content/about.mdx";
import { Page } from "@/components/shell/page";

export const metadata: Metadata = {
  title: "About",
  description: "What Need Ears is, why it exists and who runs it.",
  alternates: { canonical: "/about" },
};

export default function AboutPage() {
  return (
    // The page column, with the text kept to a readable measure inside it.
    <Page width="narrow">
      <article className="max-w-prose">
        <Content />
      </article>
    </Page>
  );
}
