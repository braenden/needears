import type { MDXComponents } from "mdx/types";
import Link from "next/link";
import { site } from "@/config/site";
import { cn } from "@/lib/utils";

// Typography and placeholders for the static pages written in MDX
// (src/content). Placeholders read src/config/site.ts, so the contact
// address and dates only have to be filled in there.

const link =
  "text-primary-text underline underline-offset-2 outline-none hover:decoration-2 focus-visible:ring-2 focus-visible:ring-ring rounded-xs";

function ContactEmail() {
  return (
    <a href={`mailto:${site.contactEmail}`} className={link}>
      {site.contactEmail}
    </a>
  );
}

function SourceLink() {
  return (
    <a href={site.githubUrl} className={link} rel="noreferrer">
      {site.githubUrl.replace(/^https:\/\//, "")}
    </a>
  );
}

function LegalUpdated() {
  return <>{site.legalUpdated}</>;
}

const components: MDXComponents = {
  ContactEmail,
  SourceLink,
  LegalUpdated,
  h1: ({ className, ...props }) => (
    <h1
      className={cn(
        "font-display text-3xl leading-[1.05] font-bold tracking-tight sm:text-4xl",
        className,
      )}
      {...props}
    />
  ),
  h2: ({ className, ...props }) => (
    <h2
      className={cn("mt-10 text-xl font-semibold tracking-tight", className)}
      {...props}
    />
  ),
  h3: ({ className, ...props }) => (
    <h3 className={cn("mt-6 font-semibold", className)} {...props} />
  ),
  p: ({ className, ...props }) => (
    <p className={cn("mt-4 leading-relaxed", className)} {...props} />
  ),
  ul: ({ className, ...props }) => (
    <ul
      className={cn("mt-4 list-disc space-y-2 pl-5 leading-relaxed", className)}
      {...props}
    />
  ),
  ol: ({ className, ...props }) => (
    <ol
      className={cn(
        "mt-4 list-decimal space-y-2 pl-5 leading-relaxed",
        className,
      )}
      {...props}
    />
  ),
  strong: ({ className, ...props }) => (
    <strong className={cn("font-semibold", className)} {...props} />
  ),
  table: ({ className, ...props }) => (
    <div className="mt-4 overflow-x-auto rounded-xl border">
      <table className={cn("w-full text-left text-sm", className)} {...props} />
    </div>
  ),
  th: ({ className, ...props }) => (
    <th
      className={cn("border-b bg-muted px-3 py-2 font-semibold", className)}
      {...props}
    />
  ),
  td: ({ className, ...props }) => (
    <td
      className={cn("border-b px-3 py-2 align-top last:border-b-0", className)}
      {...props}
    />
  ),
  a: ({ href = "", children, className, ...props }) =>
    href.startsWith("/") ? (
      <Link href={href} className={cn(link, className)} {...props}>
        {children}
      </Link>
    ) : (
      <a
        href={href}
        rel="noreferrer"
        className={cn(link, className)}
        {...props}
      >
        {children}
      </a>
    ),
};

export function useMDXComponents(): MDXComponents {
  return components;
}
