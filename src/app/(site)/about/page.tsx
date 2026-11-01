import type { Metadata } from "next";
import Content from "@/content/about.mdx";

export const metadata: Metadata = {
  title: "About",
  description: "What Need Ears is, why it exists and who runs it.",
  alternates: { canonical: "/about" },
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
