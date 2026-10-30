import { Logo, LogoMark, Wordmark } from "@/components/brand/logo";
import { ReputationBadge } from "@/components/reputation-badge";
import { MiniWaveform } from "@/components/track/mini-waveform";
import { Button } from "@/components/ui/button";
import { nightBus } from "@/mocks/tracks";

import { Example, Section, ThemePanels } from "./section";

export function BrandSection() {
  return (
    <Section
      id="brand"
      title="Brand"
      description="Accent: cue, cyan from a cue or monitor light. It stays clear of the Golden ear gold and of SoundCloud orange. Logo: a short waveform with one comment marker above it, which is what Need Ears does. Both picked on 30 October 2026."
    >
      <Example
        title="Accent"
        note="Fill, text and tint, next to the reputation chips and a playing waveform."
      >
        <ThemePanels>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" tabIndex={-1}>
              Comment
            </Button>
            <span className="inline-flex h-7 items-center rounded-full bg-primary-soft px-2.5 text-xs font-medium text-primary-text">
              at 1:42
            </span>
            <ReputationBadge helpful={20} withTooltip={false} />
            <ReputationBadge helpful={80} withTooltip={false} />
          </div>
          <MiniWaveform
            peaks={nightBus.peaks}
            progress={0.42}
            bars={72}
            className="mt-3 h-10"
          />
        </ThemePanels>
      </Example>

      <Example
        title="Logo"
        note="From favicon size (16 px) up. Bars follow the text colour, the marker uses the accent. src/app/icon.svg is the favicon."
      >
        <ThemePanels>
          <div className="flex items-end gap-4">
            {[16, 24, 32, 48, 64].map((size) => (
              <LogoMark key={size} style={{ width: size, height: size }} />
            ))}
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-3">
            <Logo />
            <span
              aria-hidden="true"
              className="inline-flex items-center gap-1.5 rounded-t-md border border-b-0 bg-card px-2 py-1 text-[11px] text-muted-foreground"
            >
              <LogoMark className="size-4" />
              Need Ears
            </span>
          </div>
        </ThemePanels>
      </Example>

      <Example
        title="Wordmark alone"
        note="Monoline lowercase, drawn to match the mark. For the footer or an email."
      >
        <div className="flex flex-wrap items-end gap-8">
          <Wordmark className="h-4" />
          <Wordmark className="h-6" />
          <Wordmark className="h-10" />
        </div>
      </Example>
    </Section>
  );
}
