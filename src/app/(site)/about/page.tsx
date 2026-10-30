import type { Metadata } from "next";
import Content from "@/content/about.mdx";

export const metadata: Metadata = {
  title: "About",
  description: "What Need Ears is, why it exists and who runs it.",
  alternates: { canonical: "/about" },
};

export default function Page() {
  return (
    <article className="mx-auto w-full max-w-prose px-4 py-10 sm:py-14">
      <Content />
    </article>
  );
}
