"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Loader2Icon, LockIcon } from "lucide-react";
import { toast } from "sonner";

import { GROUP_COPY, membersBy } from "@/components/groups/copy";
import { SignInHere } from "@/components/groups/sign-in-here";
import { Page } from "@/components/shell/page";
import { Button } from "@/components/ui/button";
import type { Group, GroupStatus } from "@/lib/data/groups";
import { askToJoin, withdrawAsk } from "../../groups/actions";

type State =
  | "signed_out"
  | "can_ask"
  | "asked"
  | "full"
  | "ask_later"
  | "removed"
  | "too_many";

/** "26 November", the day someone can ask again. */
function day(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
  });
}

function stateOf(status: GroupStatus | null, signedIn: boolean): State {
  if (!signedIn || !status) return "signed_out";
  if (status.removed) return "removed";
  if (status.asked) return "asked";
  if (status.ask_again_at) return "ask_later";
  if (status.is_full) return "full";
  return "can_ask";
}

/**
 * What someone outside a group sees of it: its name, its owner and how
 * many are in it, and the way in. No tracks and no members.
 */
export function GroupCard({
  group,
  status,
  signedIn,
  onboarded,
}: {
  group: Group;
  status: GroupStatus | null;
  signedIn: boolean;
  onboarded: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [state, setState] = useState<State>(() => stateOf(status, signedIn));
  const [busy, setBusy] = useState(false);
  const owner = group.owner
    ? group.owner.display_name || group.owner.handle
    : null;

  async function ask() {
    if (!onboarded) {
      router.push(`/welcome?${new URLSearchParams({ next: pathname })}`);
      return;
    }
    setBusy(true);
    const result = await askToJoin(group.id).catch(() => null);
    setBusy(false);
    if (result?.ok) {
      if (result.value === "member") {
        router.refresh();
        return;
      }
      setState("asked");
      // One at a time: this one, not the welcome from just before.
      toast.dismiss();
      toast.success(GROUP_COPY.askedToast(group.name));
      return;
    }
    switch (result?.error) {
      case "handle_required":
        router.push(`/welcome?${new URLSearchParams({ next: pathname })}`);
        return;
      case "group_full":
        setState("full");
        return;
      case "removed_from_group":
        setState("removed");
        return;
      case "rate_limited":
        setState("too_many");
        return;
      case "asked_recently":
        // The page knows the day: read it again.
        router.refresh();
        setState("ask_later");
        return;
      default:
        toast.error(GROUP_COPY.broke);
    }
  }

  async function cancel() {
    setBusy(true);
    const result = await withdrawAsk(group.id).catch(() => null);
    setBusy(false);
    if (result?.ok) {
      setState("can_ask");
      return;
    }
    toast.error(GROUP_COPY.broke);
  }

  const spinner = busy ? <Loader2Icon className="animate-spin" /> : null;

  return (
    <Page width="task">
      <span className="mx-auto grid size-12 place-items-center rounded-full bg-secondary text-muted-foreground">
        <LockIcon className="size-5" aria-hidden="true" />
      </span>
      <h1 className="mt-5 font-display text-3xl font-bold tracking-tight break-words">
        {group.name}
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {membersBy(group.members_count, owner)}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        {GROUP_COPY.cardWhat}
      </p>
      {/* As tall in every state, so nothing moves when it changes. */}
      <div className="mt-8 grid min-h-24 content-start justify-items-center gap-3">
        {state === "signed_out" ? (
          <SignInHere label={GROUP_COPY.signInToAsk} className="h-11 w-full" />
        ) : state === "can_ask" ? (
          <Button
            type="button"
            size="lg"
            className="h-11 w-full"
            disabled={busy}
            onClick={() => void ask()}
          >
            {spinner}
            {GROUP_COPY.askToJoin}
          </Button>
        ) : state === "asked" ? (
          <>
            <p role="status" className="text-muted-foreground">
              {GROUP_COPY.asked(owner ?? "the owner")}
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => void cancel()}
            >
              {spinner}
              {GROUP_COPY.cancelAsk}
            </Button>
          </>
        ) : (
          <p role="status" className="text-muted-foreground">
            {state === "full"
              ? GROUP_COPY.full
              : state === "removed"
                ? GROUP_COPY.removed
                : state === "too_many"
                  ? GROUP_COPY.tooManyAsks
                  : status?.ask_again_at
                    ? GROUP_COPY.askAgainOn(day(status.ask_again_at))
                    : GROUP_COPY.broke}
          </p>
        )}
      </div>
    </Page>
  );
}
