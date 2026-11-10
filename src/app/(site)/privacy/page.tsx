import type { Metadata } from "next";
import Content from "@/content/privacy.mdx";
import { Page } from "@/components/shell/page";

export const metadata: Metadata = {
  title: "Privacy policy",
  description:
    "What Need Ears stores about you, why, and how to see or delete it.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    // The page column, with the text kept to a readable measure inside it.
    <Page width="narrow">
      <article className="max-w-prose">
        <Content />
      </article>
    </Page>
  );
}
