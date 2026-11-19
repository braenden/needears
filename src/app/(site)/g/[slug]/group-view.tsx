"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { EllipsisIcon, Loader2Icon, PlusIcon } from "lucide-react";
import { toast } from "sonner";

import { displayNameOf, UserAvatar } from "@/components/common/user-avatar";
import { GROUP_COPY, membersBy } from "@/components/groups/copy";
import { DeleteGroupDialog } from "@/components/groups/delete-group-dialog";
import { DeleteGroupTrackDialog } from "@/components/groups/delete-group-track-dialog";
import { Lock } from "@/components/groups/group-bits";
import { PAGE_TITLE, Page } from "@/components/shell/page";
import { type PlayableTrack, TrackList } from "@/components/track/track-list";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { GROUP_MEMBERS_MAX } from "@/config/limits";
import type { Group, GroupMember, GroupRole, JoinAsk } from "@/lib/data/groups";
import { cn } from "@/lib/utils";
import { answerAsk, leaveGroup, removeMember } from "../../groups/actions";

const MEMBERS_SHOWN = 12;

type Pending =
  { kind: "remove"; member: GroupMember } | { kind: "leave" } | null;

/** A group's page, for its members: the tracks, and who is in it. */
export function GroupView({
  group,
  role,
  tracks,
  members,
  asks,
  ownTracks,
}: {
  group: Group;
  role: GroupRole;
  tracks: PlayableTrack[];
  members: GroupMember[];
  /** Who asked to join. Only the owner gets them. */
  asks: JoinAsk[];
  ownTracks: number;
}) {
  const router = useRouter();
  const isOwner = role === "owner";
  const [pending, setPending] = useState<Pending>(null);
  const [showAll, setShowAll] = useState(false);
  const [deletingGroup, setDeletingGroup] = useState(false);
  const [deletingTrack, setDeletingTrack] = useState<PlayableTrack | null>(
    null,
  );

  const needs = tracks.filter((t) => t.needs_ears);
  const rest = tracks.filter((t) => !t.needs_ears);
  const shownMembers = showAll ? members : members.slice(0, MEMBERS_SHOWN);
  const owner = members.find((m) => m.role === "owner");

  // The owner's ⋯ on each track: delete it, for everyone.
  const trackMenu = (track: PlayableTrack) =>
    isOwner ? (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`More for ${track.title}`}
            className="touch-hit text-muted-foreground"
          >
            <EllipsisIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            variant="destructive"
            onSelect={() => setDeletingTrack(track)}
          >
            Delete track
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ) : null;

  const askList =
    isOwner && asks.length > 0 ? (
      <AskList
        group={group}
        asks={asks}
        full={group.members_count >= GROUP_MEMBERS_MAX}
      />
    ) : null;

  return (
    <Page>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="min-w-0">
          <h1 className={cn(PAGE_TITLE, "break-words")}>
            {group.name}
            <Lock className="ml-2" />
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {membersBy(
              group.members_count,
              owner ? displayNameOf(owner) : null,
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" asChild>
            <Link
              href={`/upload?${new URLSearchParams({ group: group.slug })}`}
            >
              <PlusIcon aria-hidden="true" />
              Upload to group
            </Link>
          </Button>
        </div>
      </div>

      {/* The asks once: on phones before the tracks, so the owner sees
          them at once; on wide screens at the top of the right column. */}
      <div className="mt-8 grid gap-12 lg:grid-cols-[minmax(0,1fr)_17rem] lg:grid-rows-[auto_1fr] xl:gap-x-16">
        {askList ? (
          <div className="lg:col-start-2 lg:row-start-1">{askList}</div>
        ) : null}
        <div className="grid content-start gap-10 lg:col-start-1 lg:row-span-2 lg:row-start-1">
          {tracks.length === 0 ? (
            <div className="grid gap-2 border-t pt-6">
              <p className="text-muted-foreground">{GROUP_COPY.noTracks}</p>
              {isOwner ? (
                <p className="max-w-prose text-sm text-muted-foreground">
                  {GROUP_COPY.noTracksOwner(group.name)}
                </p>
              ) : null}
            </div>
          ) : null}
          {needs.length > 0 ? (
            <section aria-labelledby="group-needs-ears">
              <h2
                id="group-needs-ears"
                className="flex items-baseline gap-1.5 border-b pb-2 text-lg font-semibold"
              >
                Needs ears
                <span
                  className="font-normal text-muted-foreground"
                  data-numeric
                >
                  {needs.length}
                </span>
              </h2>
              <TrackList
                tracks={needs}
                label="Needs ears"
                showPlace={false}
                menuFor={trackMenu}
              />
            </section>
          ) : null}
          {rest.length > 0 ? (
            <section aria-labelledby="group-latest">
              <h2
                id="group-latest"
                className="border-b pb-2 text-lg font-semibold"
              >
                Latest
              </h2>
              <TrackList
                tracks={rest}
                label="Latest"
                showPlace={false}
                menuFor={trackMenu}
              />
            </section>
          ) : null}
        </div>

        <aside
          className={cn(
            "grid content-start gap-10 lg:sticky lg:top-24 lg:col-start-2 lg:self-start",
            askList ? "lg:row-start-2" : "lg:row-span-2 lg:row-start-1",
          )}
        >
          <section aria-labelledby="group-members">
            <h2 id="group-members" className="text-sm font-semibold">
              Members{" "}
              <span className="font-normal text-muted-foreground" data-numeric>
                {group.members_count}
              </span>
            </h2>
            <ul className="mt-3 grid grid-cols-[minmax(0,1fr)] gap-1">
              {shownMembers.map((member) => (
                <li key={member.id} className="flex items-center gap-3 py-1">
                  <UserAvatar profile={member} size="sm" />
                  <Link
                    href={`/u/${member.handle}`}
                    className="min-w-0 flex-1 truncate rounded-xs text-sm focus-ring outline-none hover:underline hover:underline-offset-4"
                  >
                    {displayNameOf(member)}
                    {member.role === "owner" ? (
                      <span className="text-muted-foreground"> · Owner</span>
                    ) : null}
                  </Link>
                  {isOwner && member.role !== "owner" ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          aria-label={`More for ${displayNameOf(member)}`}
                          className="touch-hit text-muted-foreground"
                        >
                          <EllipsisIcon />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          variant="destructive"
                          onSelect={() =>
                            setPending({ kind: "remove", member })
                          }
                        >
                          Remove from group
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : null}
                </li>
              ))}
            </ul>
            {!showAll && members.length > MEMBERS_SHOWN ? (
              <button
                type="button"
                onClick={() => setShowAll(true)}
                className="mt-2 rounded-xs text-sm text-muted-foreground focus-ring outline-none hover:text-foreground"
              >
                Show all {group.members_count}
              </button>
            ) : null}
            <div className="mt-8 border-t pt-4">
              <button
                type="button"
                onClick={() =>
                  isOwner
                    ? setDeletingGroup(true)
                    : setPending({ kind: "leave" })
                }
                className="rounded-xs text-sm text-destructive focus-ring outline-none"
              >
                {isOwner ? "Delete group" : "Leave group"}
              </button>
            </div>
          </section>
        </aside>
      </div>

      <GroupDialog
        pending={pending}
        group={group}
        ownTracks={ownTracks}
        onClose={() => setPending(null)}
        onLeft={() => {
          toast.success(GROUP_COPY.left(group.name));
          router.push("/groups");
        }}
      />
      {isOwner ? (
        <>
          <DeleteGroupDialog
            open={deletingGroup}
            onOpenChange={setDeletingGroup}
            group={group}
          />
          <DeleteGroupTrackDialog
            // The owner's own tracks too: as the owner, also when reported.
            track={
              deletingTrack
                ? {
                    id: deletingTrack.id,
                    title: deletingTrack.title,
                    artist: displayNameOf(deletingTrack.owner),
                  }
                : null
            }
            own={!!deletingTrack && deletingTrack.owner.id === owner?.id}
            onClose={() => setDeletingTrack(null)}
            onDeleted={() => {
              setDeletingTrack(null);
              router.refresh();
            }}
          />
        </>
      ) : null}
    </Page>
  );
}

/** The owner lets people in one by one, the first to ask first. */
function AskList({
  group,
  asks,
  full,
}: {
  group: Group;
  asks: JoinAsk[];
  full: boolean;
}) {
  const router = useRouter();
  const [answering, setAnswering] = useState<string | null>(null);
  // Answered ones go from the list at once; the page catches up after.
  const [answered, setAnswered] = useState<Set<string>>(() => new Set());
  const waiting = asks.filter((a) => !answered.has(a.id));
  if (waiting.length === 0) return null;

  async function answer(ask: JoinAsk, accept: boolean) {
    setAnswering(ask.id);
    const result = await answerAsk(group.id, ask.id, accept).catch(() => null);
    setAnswering(null);
    if (!result?.ok) {
      toast.error(GROUP_COPY.broke);
      return;
    }
    setAnswered((set) => new Set(set).add(ask.id));
    if (accept) {
      toast.success(GROUP_COPY.isIn(displayNameOf(ask)));
      // Into the member list.
      router.refresh();
    }
  }

  return (
    <section aria-labelledby="group-asks">
      <h2 id="group-asks" className="text-sm font-semibold">
        {GROUP_COPY.asksHeading}{" "}
        <span className="font-normal text-muted-foreground" data-numeric>
          {waiting.length}
        </span>
      </h2>
      <ul className="mt-3 grid grid-cols-[minmax(0,1fr)] gap-1">
        {waiting.map((ask) => {
          const name = displayNameOf(ask);
          const busy = answering === ask.id;
          return (
            <li key={ask.id} className="flex items-center gap-2 py-1">
              <UserAvatar profile={ask} size="sm" />
              <Link
                href={`/u/${ask.handle}`}
                className="min-w-0 flex-1 truncate rounded-xs text-sm focus-ring outline-none hover:underline hover:underline-offset-4"
              >
                {name}
              </Link>
              <Button
                type="button"
                variant="outline"
                size="xs"
                disabled={full || busy}
                aria-label={`${GROUP_COPY.letIn} ${name}`}
                onClick={() => void answer(ask, true)}
              >
                {GROUP_COPY.letIn}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                disabled={busy}
                aria-label={`${GROUP_COPY.decline} ${name}`}
                onClick={() => void answer(ask, false)}
              >
                {GROUP_COPY.decline}
              </Button>
            </li>
          );
        })}
      </ul>
      {full ? (
        <p className="mt-2 text-sm text-muted-foreground">
          {GROUP_COPY.fullCantLetIn}
        </p>
      ) : null}
    </section>
  );
}

/** One dialog for the owner's and a member's choices. */
function GroupDialog({
  pending,
  group,
  ownTracks,
  onClose,
  onLeft,
}: {
  pending: Pending;
  group: Group;
  ownTracks: number;
  onClose: () => void;
  onLeft: () => void;
}) {
  const [busy, setBusy] = useState(false);
  // Kept while the dialog closes, so its words do not change on the way out.
  const [shown, setShown] = useState<Pending>(pending);
  if (pending && pending !== shown) setShown(pending);
  const p = pending ?? shown;
  if (!p) return null;

  const remove = p.kind === "remove";
  const title = remove
    ? GROUP_COPY.removeTitle(displayNameOf(p.member))
    : GROUP_COPY.leaveTitle(group.name);
  const body = remove ? GROUP_COPY.removeBody : GROUP_COPY.leaveBody(ownTracks);

  async function confirm() {
    if (!p) return;
    setBusy(true);
    const result = await (
      p.kind === "remove"
        ? removeMember(group.id, p.member.id)
        : leaveGroup(group.id)
    ).catch(() => null);
    setBusy(false);
    if (!result?.ok) {
      toast.error(GROUP_COPY.broke);
      return;
    }
    if (p.kind === "leave") {
      onLeft();
      return;
    }
    onClose();
  }

  return (
    <Dialog open={pending !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{body}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="ghost">
              Cancel
            </Button>
          </DialogClose>
          <Button
            type="button"
            variant="destructive"
            onClick={() => void confirm()}
            disabled={busy}
          >
            {busy ? <Loader2Icon className="animate-spin" /> : null}
            {remove ? "Remove" : "Leave group"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
