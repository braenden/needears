import type { Metadata } from "next";
import Content from "@/content/terms.mdx";

export const metadata: Metadata = {
  title: "Terms of use",
  description: "The rules for using Need Ears.",
  alternates: { canonical: "/terms" },
};

export default function Page() {
  return (
    <article className="mx-auto w-full max-w-prose px-4 py-10 sm:py-14">
      <Content />
    </article>
  );
}
