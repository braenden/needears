"use client";

import { toast } from "sonner";

import { EmptyState } from "@/components/empty-state";
import {
  ProfileHeader,
  ProfileHeaderSkeleton,
} from "@/components/profile/profile-header";
import { ReactionBar } from "@/components/reaction-bar";
import { ReportDialog } from "@/components/report-dialog";
import { ReputationBadge } from "@/components/reputation-badge";
import { Button } from "@/components/ui/button";
import { reputationLevels } from "@/config/reputation";
import {
  jonas,
  longName,
  mia,
  newcomer,
  nora,
  statsFor,
} from "@/mocks/profiles";
import { nightBus } from "@/mocks/tracks";

import { Example, Section } from "./section";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function PeopleSection() {
  return (
    <>
      <Section
        id="profile"
        title="ProfileHeader"
        description="Name in the display face, handle, reputation, member since, bio and three numbers. Own profile shows progress to the next level."
      >
        <Example title="Own profile (Jonas, Trusted ear)">
          <ProfileHeader
            profile={jonas}
            stats={statsFor[jonas.id]!}
            isOwn
            headingLevel={3}
          />
        </Example>
        <Example title="Someone else (Mia, Golden ear)">
          <ProfileHeader
            profile={mia}
            stats={statsFor[mia.id]!}
            headingLevel={3}
          />
        </Example>
        <Example title="Long name and bio, no avatar">
          <ProfileHeader
            profile={longName}
            stats={statsFor[longName.id]!}
            headingLevel={3}
          />
        </Example>
        <Example title="Just got here, own profile">
          <ProfileHeader
            profile={newcomer}
            stats={statsFor[newcomer.id]!}
            isOwn
            headingLevel={3}
          />
        </Example>
        <Example title="Loading">
          <ProfileHeaderSkeleton />
        </Example>
        <div className="grid gap-6 lg:grid-cols-2">
          <Example title="Other user, no tracks">
            <EmptyState
              size="compact"
              title="No tracks yet."
              body="Listening counts too: 12 comments given."
            />
          </Example>
          <Example title="Other user, no tracks, no comments">
            <EmptyState
              size="compact"
              title="No tracks yet."
              body="first_timer_99 just got here."
            />
          </Example>
          <Example title="Own profile, no tracks">
            <EmptyState
              size="compact"
              title="You haven't uploaded anything yet."
              body="Your first track takes about two minutes."
              action={<Button>Upload a track</Button>}
            />
          </Example>
          <Example title="Comments tab, none">
            <EmptyState size="compact" title="No comments yet." />
          </Example>
        </div>
      </Section>

      <Section
        id="reputation"
        title="ReputationBadge"
        description="Discreet chip next to a name. New ears get no chip, except on their own profile. Hover or focus for the explanation."
      >
        <ul className="grid gap-3">
          {reputationLevels.map((level) => (
            <li
              key={level.id}
              className="flex flex-wrap items-center gap-3 text-sm"
            >
              <span className="w-28 text-muted-foreground">
                {level.minHelpful}+ Helpful
              </span>
              <ReputationBadge helpful={level.minHelpful} showNew />
              <span className="text-muted-foreground">{level.description}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section
        id="reactions"
        title="ReactionBar"
        description="Quick reactions on the whole track, and Copy link."
      >
        <Example title="Signed in, one reaction given">
          <ReactionBar
            counts={nightBus.reaction_counts}
            mine={["fire"]}
            signedIn
            shareUrl="https://needears.com/t/k3x9-night-bus"
          />
        </Example>
        <Example title="Signed out, no reactions yet">
          <ReactionBar
            counts={{ fire: 0, heart: 0, eyes: 0, headphones: 0 }}
            mine={[]}
            signedIn={false}
            onSignIn={() => toast("Sign in to react.")}
          />
        </Example>
      </Section>

      <Section
        id="empty-states"
        title="EmptyState"
        description="Every empty screen has a designed state. Texts come from the shared copy."
      >
        <div className="grid gap-6 lg:grid-cols-2">
          <EmptyState
            title={'Nothing found for "night bsu".'}
            body="Check the spelling, or try a shorter word."
          />
          <EmptyState
            title="Nothing yet."
            body="You'll see it here when someone comments on your track or marks your comment as Helpful."
          />
          <EmptyState
            title="We can't find that page."
            body="It may have been moved or removed."
            action={<Button variant="outline">Back to the feed</Button>}
          />
          <EmptyState
            title="Something broke on our side."
            body="Try again, or come back in a minute."
            action={<Button variant="outline">Try again</Button>}
          />
        </div>
      </Section>

      <Section
        id="report"
        title="ReportDialog"
        description="Reason, optional details, send. Pick a reason first. The comment report says rate limited to show that error."
      >
        <div className="flex flex-wrap gap-3">
          <ReportDialog
            target="track"
            trigger={<Button variant="outline">Report a track</Button>}
            onSubmit={async () => {
              await wait(700);
              return { ok: true };
            }}
          />
          <ReportDialog
            target="comment"
            trigger={
              <Button variant="outline">Report a comment (rate limited)</Button>
            }
            onSubmit={async () => {
              await wait(500);
              return { ok: false, error: "rate_limited" };
            }}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Reporter in the demo: {nora.display_name}.
        </p>
      </Section>
    </>
  );
}
