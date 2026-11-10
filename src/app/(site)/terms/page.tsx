import type { Metadata } from "next";
import Content from "@/content/terms.mdx";
import { Page } from "@/components/shell/page";

export const metadata: Metadata = {
  title: "Terms of use",
  description: "The rules for using Need Ears.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    // The page column, with the text kept to a readable measure inside it.
    <Page width="narrow">
      <article className="max-w-prose">
        <Content />
      </article>
    </Page>
  );
}
