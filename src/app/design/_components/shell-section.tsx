"use client";

import { CommentList } from "@/components/comments/comment-list";
import { WaveformPlayer } from "@/components/player/waveform-player";
import { SiteHeader } from "@/components/shell/app-shell";
import { TrackCard } from "@/components/track/track-card";
import { comments } from "@/mocks/comments";
import { jonas } from "@/mocks/profiles";
import { nightBus, vocalDemo } from "@/mocks/tracks";

import { Example, PhoneFrame, Section, ThemePanels } from "./section";

export function ShellSection() {
  return (
    <>
      <Section
        id="shell"
        title="AppShell"
        description="Skip link, sticky top bar, main and footer. This page itself runs inside it. The bar collapses into a menu sheet on narrow screens (container query)."
      >
        <Example title="Signed out">
          <div className="overflow-hidden rounded-xl border">
            <SiteHeader user={null} navLabel="Demo, signed out" />
          </div>
        </Example>
        <Example title="Signed in, with unread notifications">
          <div className="overflow-hidden rounded-xl border">
            <SiteHeader user={jonas} unread={3} navLabel="Demo, signed in" />
          </div>
        </Example>
      </Section>

      <Section
        id="phone"
        title="Phone width"
        description="375 px wide. Same components, laid out by container queries. Open the menu in the top bar to see the mobile sheet."
      >
        <PhoneFrame>
          <SiteHeader user={jonas} unread={1} navLabel="Demo, phone" />
          <div className="grid gap-4 p-3">
            <WaveformPlayer
              title={nightBus.title}
              durationMs={nightBus.duration_ms}
              peaks={nightBus.peaks}
              comments={comments}
            />
            <CommentList comments={comments.slice(0, 3)} viewer="visitor" />
            <TrackCard track={vocalDemo} />
          </div>
        </PhoneFrame>
      </Section>

      <Section
        id="themes"
        title="Both themes, side by side"
        description="The same card and comment in dark and light, whatever theme the page is in."
      >
        <ThemePanels>
          <div className="grid gap-3">
            <TrackCard track={nightBus} progress={0.3} />
            <CommentList comments={comments.slice(0, 2)} viewer="owner" />
          </div>
        </ThemePanels>
      </Section>
    </>
  );
}
