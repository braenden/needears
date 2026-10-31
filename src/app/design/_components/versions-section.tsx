"use client";

import { useState } from "react";
import { toast } from "sonner";

import { WaveformPlayer } from "@/components/player/waveform-player";
import { NewVersionDialog } from "@/components/versions/new-version-dialog";
import { VersionPicker } from "@/components/versions/version-picker";
import { useMockAudioUrl } from "@/mocks/audio";
import { nightBus } from "@/mocks/tracks";
import {
  createMockVersionPipeline,
  nightBusVersions,
  versionedComments,
} from "@/mocks/versions";
import { mockPeaks } from "@/mocks/peaks";

import { Example, Section } from "./section";

/**
 * Picker, A/B and the player together. Press play, then A/B: the player keeps
 * the second and keeps playing on the other version.
 */
function VersionsDemo() {
  const [versions, setVersions] = useState(nightBusVersions);
  const [currentId, setCurrentId] = useState("v3");
  const [previousId, setPreviousId] = useState<string | null>(null);
  const current =
    versions.find((v) => v.id === currentId) ?? versions[versions.length - 1]!;
  const audioUrl = useMockAudioUrl(current.duration_ms);
  const [pipeline] = useState(() =>
    createMockVersionPipeline(nightBusVersions.length),
  );
  const versionNumbers = Object.fromEntries(
    versions.map((v) => [v.id, v.version_no]),
  );

  return (
    <div className="grid gap-4">
      <VersionPicker
        versions={versions}
        currentId={current.id}
        previousId={previousId}
        onSelect={(id) => {
          if (id === current.id) return;
          setPreviousId(current.id);
          setCurrentId(id);
        }}
      />
      <WaveformPlayer
        title={nightBus.title}
        durationMs={current.duration_ms}
        peaks={current.peaks}
        audioUrl={audioUrl}
        comments={versionedComments}
        currentVersionId={current.id}
        versionNumbers={versionNumbers}
        keepPosition
      />
      <NewVersionDialog
        trackTitle={nightBus.title}
        versionCount={versions.length}
        pipeline={pipeline}
        onPublished={(version) => {
          setVersions((list) => [
            ...list,
            { ...version, peaks: mockPeaks(version.version_no + 20) },
          ]);
          setPreviousId(current.id);
          setCurrentId(version.id);
          toast.success(`v${version.version_no} is live.`);
        }}
      />
    </div>
  );
}

export function VersionsSection() {
  return (
    <Section
      id="versions"
      title="Versions and A/B"
      description="Owners upload new versions of a track. Listeners pick a version or press A/B to flip to the other one at the same second, without stopping. Comments from other versions stay in the waveform, muted, and say which version they are from."
    >
      <Example
        title="Wired up"
        note="Play, then press A/B. Upload a new version with any audio file name; the processing is faked."
      >
        <VersionsDemo />
      </Example>
      <div className="grid gap-8 lg:grid-cols-2">
        <Example title="Only one version" note="The picker hides itself.">
          <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
            <VersionPicker
              versions={nightBusVersions.slice(0, 1)}
              currentId="v1"
              onSelect={() => {}}
            />
            Nothing shows above the player.
          </div>
        </Example>
        <Example title="At the limit" note="Ten versions, so no more uploads.">
          <NewVersionDialog
            trackTitle={nightBus.title}
            versionCount={10}
            pipeline={createMockVersionPipeline(10)}
            onPublished={() => {}}
          />
        </Example>
      </div>
    </Section>
  );
}
