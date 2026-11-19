import { LockIcon } from "lucide-react";

import { Page } from "@/components/shell/page";
import { site } from "@/config/site";
import { GROUP_COPY } from "./copy";
import { SignInHere } from "./sign-in-here";

/**
 * What someone outside a group sees of one of its tracks, also from a link
 * passed on: nothing but this. No title, no artist, no group.
 */
export function MembersOnly({ signedIn }: { signedIn: boolean }) {
  return (
    <Page width="task">
      <span className="mx-auto grid size-12 place-items-center rounded-full bg-secondary text-muted-foreground">
        <LockIcon className="size-5" aria-hidden="true" />
      </span>
      <h1 className="mt-5 text-2xl font-semibold tracking-tight">
        {GROUP_COPY.membersOnlyTrack}
      </h1>
      <p className="mt-2 text-muted-foreground">
        {signedIn ? GROUP_COPY.notInIt : GROUP_COPY.signInIfIn}
      </p>
      {signedIn ? null : <SignInHere className="mt-6 h-11 w-full" />}
      <p className="mt-10 text-sm text-muted-foreground">
        {GROUP_COPY.somethingWrong}{" "}
        <a
          href={`mailto:${site.contactEmail}`}
          className="text-foreground underline underline-offset-4"
        >
          {site.contactEmail}
        </a>
        .
      </p>
    </Page>
  );
}
