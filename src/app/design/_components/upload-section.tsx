"use client";

import { UploadWizard } from "@/components/upload/upload-wizard";
import type { UploadState } from "@/components/upload/upload-state";
import { genres } from "@/mocks/genres";
import { mockPeaks } from "@/mocks/peaks";
import { createMockPipeline } from "@/mocks/upload-pipeline";

import { Example, Section } from "./section";

const pipeline = createMockPipeline();
const wav = { name: "night_bus_demo4.wav", size: 41_200_000, isMp3: false };
const peaks = mockPeaks(12);
const details = {
  title: "night bus demo4",
  genre: "house",
  tags: "deep house, vocal chop",
  description: "",
  feedbackWants: ["mix" as const, "arrangement" as const],
  level: "intermediate" as const,
};
const analysed: Partial<UploadState> = {
  file: wav,
  peaks,
  durationMs: 214_000,
  details,
};

const STATES: { title: string; state: Partial<UploadState> }[] = [
  {
    title: "Wrong format",
    state: {
      fileError: "wrong_format",
      file: { name: "cover.png", size: 300_000, isMp3: false },
    },
  },
  {
    title: "Too large",
    state: { fileError: "too_large", file: { ...wav, size: 190_000_000 } },
  },
  {
    title: "Too long",
    state: { fileError: "too_long", fileDurationMs: 972_000, file: wav },
  },
  {
    title: "Phone, over 50 MB",
    state: { fileError: "mobile_too_large", file: wav },
  },
  {
    title: "Decoding failed",
    state: { fileError: "decode_failed", file: wav },
  },
  {
    title: "FLAC not supported",
    state: {
      fileError: "flac_unsupported",
      file: { ...wav, name: "night_bus.flac" },
    },
  },
  {
    title: "Processing",
    state: { file: wav, stage: "waveform", progress: 0.6 },
  },
  {
    title: "Details, encoding in the background",
    state: { ...analysed, step: "details", stage: "encoding", progress: 0.42 },
  },
  {
    title: "Details, missing fields",
    state: {
      ...analysed,
      step: "details",
      encoded: true,
      details: { ...details, title: "", genre: "" },
      detailErrors: {
        title: "Give your track a title.",
        genre: "Pick a genre.",
      },
    },
  },
  {
    title: "Encoding failed",
    state: { ...analysed, step: "details", publishError: "encode_failed" },
  },
  {
    title: "Publish, own work not confirmed",
    state: { ...analysed, step: "publish", encoded: true, ownWorkError: true },
  },
  {
    title: "Publishing",
    state: {
      ...analysed,
      step: "publish",
      encoded: true,
      ownWork: true,
      publishing: true,
      stage: "uploading",
      progress: 0.7,
    },
  },
  {
    title: "Upload interrupted",
    state: {
      ...analysed,
      step: "publish",
      encoded: true,
      ownWork: true,
      publishError: "upload_interrupted",
    },
  },
  {
    title: "Rate limited",
    state: {
      ...analysed,
      step: "publish",
      encoded: true,
      ownWork: true,
      publishError: "rate_limited",
      rateLimit: { limit: 2, retry: "tomorrow" },
    },
  },
  {
    title: "Unknown error",
    state: {
      ...analysed,
      step: "publish",
      encoded: true,
      ownWork: true,
      publishError: "unknown",
    },
  },
  {
    title: "Done",
    state: { ...analysed, step: "done", slug: "k3x9-night-bus" },
  },
];

export function UploadSection() {
  return (
    <Section
      id="upload"
      title="UploadWizard"
      description="Three steps. Processing is faked with timers: put broken, long, encodefail, offline or limit in a file name to try each failure. The waveform shows on the details step while encoding keeps going."
    >
      <Example title="Live, with a fake pipeline">
        <div className="rounded-xl border p-4 sm:p-6">
          <UploadWizard
            pipeline={pipeline}
            genres={genres}
            contactEmail="hello@needears.com"
          />
        </div>
      </Example>
      <Example title="Every state">
        <div className="grid gap-6 lg:grid-cols-2">
          {STATES.map(({ title, state }) => (
            <div key={title} className="min-w-0 rounded-xl border p-4">
              <p className="mb-4 text-xs text-muted-foreground">{title}</p>
              <UploadWizard
                pipeline={pipeline}
                genres={genres}
                initialState={state}
                contactEmail="hello@needears.com"
              />
            </div>
          ))}
        </div>
      </Example>
    </Section>
  );
}
