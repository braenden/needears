import { cn } from "@/lib/utils";

const FRAME = {
  // As wide as the top bar and the footer, so the content starts under
  // the logo: the home page, the feed, a track, a profile and search.
  wide: "max-w-6xl pt-6 pb-10 sm:pt-10",
  // A column for reading and filling in: settings, notifications, upload,
  // admin and the text pages.
  narrow: "max-w-3xl pt-6 pb-10 sm:pt-10",
  // One short task and nothing else (sign in, pick a username, an error):
  // the narrow column with more air above, the task centred in it.
  task: "max-w-3xl py-16 sm:py-24",
} as const;

/**
 * The frame around a page's content. Every page uses it, so pages of the
 * same width share their left edge and their title sits at the same
 * height: nothing moves when going from one to the next.
 */
export function Page({
  width = "wide",
  as: Tag = "div",
  className,
  children,
  ...props
}: Omit<React.ComponentProps<"div">, "ref"> & {
  width?: keyof typeof FRAME;
  as?: "div" | "article";
}) {
  return (
    <Tag
      className={cn("mx-auto w-full px-4", FRAME[width], className)}
      {...props}
    >
      {width === "task" ? (
        <div className="mx-auto max-w-sm text-center">{children}</div>
      ) : (
        children
      )}
    </Tag>
  );
}

/** How a page's title looks, for titles that are not a PageTitle. */
export const PAGE_TITLE =
  "font-display text-3xl leading-[1.05] font-bold tracking-tight sm:text-4xl";

/** The page's title: one size on every page. */
export function PageTitle({ className, ...props }: React.ComponentProps<"h1">) {
  return <h1 className={cn(PAGE_TITLE, className)} {...props} />;
}
