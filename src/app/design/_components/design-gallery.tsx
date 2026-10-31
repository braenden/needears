"use client";

import { useTheme } from "next-themes";

import { AppShell } from "@/components/shell/app-shell";
import { jonas } from "@/mocks/profiles";

import { AxeCheck } from "./axe-check";
import { BrandSection } from "./brand-section";
import { ChoiceGroup } from "./choice-group";
import { FeedSection } from "./feed-section";
import { PeopleSection } from "./people-section";
import { PlayerSection } from "./player-section";
import { PrimitivesSection } from "./primitives-section";
import { ProfileV11Section } from "./profile-v11-section";
import { ShellSection } from "./shell-section";
import { TokensSection } from "./tokens-section";
import { UploadSection } from "./upload-section";
import { VersionsSection } from "./versions-section";

const CONTENTS = [
  ["brand", "Brand"],
  ["tokens", "Tokens"],
  ["primitives", "Primitives"],
  ["track-page", "Track page"],
  ["player", "WaveformPlayer"],
  ["composer", "CommentComposer"],
  ["comment-list", "CommentList"],
  ["versions", "Versions and A/B"],
  ["track-card", "TrackCard"],
  ["upload", "UploadWizard"],
  ["profile", "ProfileHeader"],
  ["reputation", "ReputationBadge"],
  ["reactions", "ReactionBar"],
  ["empty-states", "EmptyState"],
  ["report", "ReportDialog"],
  ["profile-v11", "Profile photo and badges"],
  ["shell", "AppShell"],
  ["phone", "Phone width"],
  ["themes", "Both themes"],
] as const;

export function DesignGallery() {
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <AppShell user={jonas} unread={2}>
      <div className="mx-auto max-w-6xl px-4 lg:grid lg:grid-cols-[11rem_minmax(0,1fr)] lg:gap-10">
        <nav aria-label="Design system sections" className="hidden lg:block">
          <ul className="sticky top-20 grid gap-0.5 py-10 text-sm">
            {CONTENTS.map(([id, label]) => (
              <li key={id}>
                <a
                  href={`#${id}`}
                  className="block rounded-sm px-2 py-1 text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="min-w-0">
          <header className="py-10">
            <h1 className="font-display text-4xl leading-none font-bold tracking-tight sm:text-6xl">
              Design system
            </h1>
            <p className="mt-4 max-w-prose text-pretty text-muted-foreground">
              Every component in Need Ears v1, on mock data, in every state.
              Only available in development. The waveform is the hero;
              everything else stays quiet.
            </p>
            <div className="mt-6 grid gap-4 rounded-xl border bg-card p-4">
              <div className="flex flex-wrap gap-x-6 gap-y-3">
                <ChoiceGroup<"dark" | "light">
                  label="Theme"
                  value={resolvedTheme === "light" ? "light" : "dark"}
                  onChange={setTheme}
                  options={[
                    { value: "dark", label: "Dark" },
                    { value: "light", label: "Light" },
                  ]}
                />
              </div>
              <AxeCheck />
            </div>
          </header>

          <BrandSection />
          <TokensSection />
          <PrimitivesSection />
          <PlayerSection />
          <VersionsSection />
          <FeedSection />
          <UploadSection />
          <PeopleSection />
          <ProfileV11Section />
          <ShellSection />
        </div>
      </div>
    </AppShell>
  );
}
