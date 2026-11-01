import type { Metadata } from "next";
import Content from "@/content/terms.mdx";

export const metadata: Metadata = {
  title: "Terms of use",
  description: "The rules for using Need Ears.",
  alternates: { canonical: "/terms" },
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
