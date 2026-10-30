"use client";

import { useId, useReducer, useRef, useState } from "react";
import Link from "next/link";
import {
  CheckIcon,
  FileAudioIcon,
  Loader2Icon,
  UploadIcon,
} from "lucide-react";

import { MiniWaveform } from "@/components/track/mini-waveform";
import { Button } from "@/components/ui/button";
import { fieldClasses, Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FEEDBACK_WANT_LABELS, LEVEL_LABELS } from "@/config/labels";
import { DESCRIPTION_MAX } from "@/config/limits";
import { formatTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import type { TrackLevel, FeedbackWant } from "@/types/view";

import {
  type Details,
  extensionOf,
  type FileError,
  initialUploadState,
  type ProcessingStage,
  type PublishError,
  UPLOAD_LIMITS,
  uploadReducer,
  type UploadState,
  validateFile,
} from "./upload-state";

/**
 * The browser pipeline, as an interface. The real
 * one (Web Audio, lamejs worker, signed upload) lives in src/lib/upload/pipeline.ts; /design
 * and the tests pass fakes.
 */
export type UploadPipeline = {
  analyze: (
    file: File,
    onProgress: (stage: "decoding" | "waveform", progress: number) => void,
  ) => Promise<
    | { ok: true; peaks: number[]; durationMs: number }
    | { ok: false; error: "decode_failed" | "flac_unsupported" }
  >;
  /** Only called for files that are not mp3. Resolves false if encoding failed. */
  encode: (
    file: File,
    onProgress: (progress: number) => void,
  ) => Promise<boolean>;
  publish: (
    details: Details,
    onProgress: (progress: number) => void,
  ) => Promise<
    | { ok: true; slug: string }
    | {
        ok: false;
        error: "upload_interrupted" | "rate_limited" | "unknown";
        rateLimit?: { limit: number; retry: string };
      }
  >;
};

const STEPS = [
  { key: "file", label: "File" },
  { key: "details", label: "Details" },
  { key: "publish", label: "Publish" },
] as const;

const STAGE_LABELS: Record<ProcessingStage, string> = {
  decoding: "Reading your file…",
  waveform: "Drawing the waveform…",
  encoding: "Getting it ready to stream…",
  uploading: "Uploading…",
};

const FEEDBACK_ORDER: FeedbackWant[] = [
  "mix",
  "arrangement",
  "vocals",
  "sound_design",
  "vibe",
];

const LEVEL_ORDER: TrackLevel[] = ["beginner", "intermediate", "advanced"];

function fileErrorText(error: FileError, durationMs: number | null) {
  switch (error) {
    case "wrong_format":
      return "We can't use that file. Try mp3, wav, aiff or flac.";
    case "too_large":
      return "That file is over 150 MB. Export a shorter or smaller version and try again.";
    case "mobile_too_large":
      return "Big files need more memory than a phone can spare. Upload from a computer for files over 50 MB.";
    case "too_long":
      return `Tracks can be up to 15 minutes. This one is ${formatTime(durationMs ?? 0)}.`;
    case "decode_failed":
      return "We couldn't read that file. It may be damaged, or your browser can't open it. Try exporting it again as wav or mp3.";
    case "flac_unsupported":
      return "Your browser can't open FLAC. Convert it to wav first, or try another browser.";
  }
}

function publishErrorText(
  error: PublishError,
  rateLimit: UploadState["rateLimit"],
  contactEmail?: string,
) {
  switch (error) {
    case "upload_interrupted":
      return "The upload stopped. Check your connection and try again. Your details are still here.";
    case "rate_limited":
      return `You've hit today's upload limit (${rateLimit?.limit ?? 2} per day for now). Try again ${rateLimit?.retry ?? "tomorrow"}.`;
    case "encode_failed":
      return "Something went wrong while preparing the stream. Try again, or upload an mp3.";
    case "unknown":
      return `Something broke on our side. Try again in a minute.${contactEmail ? ` If it keeps happening, tell us at ${contactEmail}.` : ""}`;
  }
}

export function UploadWizard({
  pipeline,
  genres,
  isMobile = false,
  contactEmail,
  initialState,
  className,
}: {
  pipeline: UploadPipeline;
  genres: { slug: string; name: string }[];
  isMobile?: boolean;
  contactEmail?: string;
  /** Seed any state, for /design and tests. */
  initialState?: Partial<UploadState>;
  className?: string;
}) {
  const [state, dispatch] = useReducer(uploadReducer, {
    ...initialUploadState,
    ...initialState,
  });
  const fileRef = useRef<File | null>(null);
  const runRef = useRef(0);
  const encodingRef = useRef<Promise<boolean> | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  async function handleFile(file: File) {
    const run = ++runRef.current;
    const info = {
      name: file.name,
      size: file.size,
      isMp3: extensionOf(file.name) === "mp3",
    };
    const error = validateFile(file, { isMobile });
    if (error) {
      dispatch({ type: "file_rejected", file: info, error });
      return;
    }
    fileRef.current = file;
    dispatch({ type: "file_accepted", file: info });
    const result = await pipeline.analyze(file, (stage, progress) => {
      if (run === runRef.current) dispatch({ type: "stage", stage, progress });
    });
    if (run !== runRef.current) return;
    if (!result.ok) {
      dispatch({ type: "file_rejected", file: info, error: result.error });
      return;
    }
    if (result.durationMs > UPLOAD_LIMITS.maxDurationMs) {
      dispatch({
        type: "file_rejected",
        file: info,
        error: "too_long",
        durationMs: result.durationMs,
      });
      return;
    }
    dispatch({
      type: "analyzed",
      peaks: result.peaks,
      durationMs: result.durationMs,
    });
    headingRef.current?.focus();
    if (!info.isMp3) startEncoding(file, run);
  }

  function startEncoding(file: File, run: number) {
    encodingRef.current = pipeline
      .encode(file, (progress) => {
        if (run === runRef.current)
          dispatch({ type: "stage", stage: "encoding", progress });
      })
      .then((ok) => {
        if (run === runRef.current)
          dispatch({ type: ok ? "encoded" : "encode_failed" });
        return ok;
      });
  }

  async function publish() {
    if (!state.ownWork) {
      dispatch({ type: "publish_start" });
      return;
    }
    dispatch({ type: "publish_start" });
    if (!state.encoded) {
      if (!encodingRef.current && fileRef.current) {
        startEncoding(fileRef.current, runRef.current);
      }
      const ok = encodingRef.current ? await encodingRef.current : true;
      if (!ok) {
        dispatch({ type: "publish_failed", error: "encode_failed" });
        encodingRef.current = null;
        return;
      }
    }
    dispatch({ type: "stage", stage: "uploading", progress: 0 });
    const result = await pipeline.publish(state.details, (progress) =>
      dispatch({ type: "stage", stage: "uploading", progress }),
    );
    if (result.ok) {
      dispatch({ type: "published", slug: result.slug });
      headingRef.current?.focus();
    } else {
      dispatch({
        type: "publish_failed",
        error: result.error,
        rateLimit: result.rateLimit,
      });
    }
  }

  const stepIndex =
    state.step === "done" ? 3 : STEPS.findIndex((s) => s.key === state.step);
  const headings = {
    file: "Upload a track",
    details: "Tell people about it",
    publish: "Ready to publish",
    done: "Done. Your track is live.",
  };

  return (
    <div className={cn("@container mx-auto w-full max-w-2xl", className)}>
      <ol
        className="mb-6 flex items-center gap-2 text-sm"
        aria-label="Upload steps"
      >
        {STEPS.map((step, index) => {
          const done = index < stepIndex;
          const current = index === stepIndex;
          return (
            <li
              key={step.key}
              aria-current={current ? "step" : undefined}
              className="flex min-w-0 flex-1 items-center gap-2"
            >
              <span
                className={cn(
                  "grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold",
                  done && "bg-primary text-primary-foreground",
                  current && "bg-foreground text-background",
                  !done && !current && "border text-muted-foreground",
                )}
              >
                {done ? (
                  <CheckIcon className="size-3.5" aria-hidden="true" />
                ) : (
                  index + 1
                )}
              </span>
              <span
                className={cn(
                  "truncate",
                  current
                    ? "font-medium text-foreground"
                    : "text-muted-foreground",
                )}
              >
                {step.label}
                {done ? <span className="sr-only"> (done)</span> : null}
              </span>
              {index < STEPS.length - 1 ? (
                <span aria-hidden="true" className="h-px flex-1 bg-border" />
              ) : null}
            </li>
          );
        })}
      </ol>

      <h2
        ref={headingRef}
        tabIndex={-1}
        className="font-display text-2xl font-bold tracking-tight outline-none @md:text-3xl"
      >
        {headings[state.step]}
      </h2>

      <div className="mt-5">
        {state.step === "file" ? (
          <FileStep
            state={state}
            onFile={handleFile}
            onReset={() => dispatch({ type: "reset" })}
          />
        ) : null}
        {state.step === "details" ? (
          <DetailsStep
            state={state}
            genres={genres}
            onEdit={(details) => dispatch({ type: "edit", details })}
            onNext={() => dispatch({ type: "to_publish" })}
          />
        ) : null}
        {state.step === "publish" ? (
          <PublishStep
            state={state}
            genres={genres}
            contactEmail={contactEmail}
            onOwnWork={(value) => dispatch({ type: "own_work", value })}
            onBack={() => dispatch({ type: "back" })}
            onPublish={() => void publish()}
          />
        ) : null}
        {state.step === "done" ? <DoneStep slug={state.slug} /> : null}
      </div>
    </div>
  );
}

function ProgressBar({ value, label }: { value: number; label: string }) {
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value * 100)}
      className="h-1.5 overflow-hidden rounded-full bg-muted"
    >
      <div
        className="h-full rounded-full bg-primary transition-[width] duration-(--duration-base)"
        style={{ width: `${Math.round(value * 100)}%` }}
      />
    </div>
  );
}

function FileStep({
  state,
  onFile,
  onReset,
}: {
  state: UploadState;
  onFile: (file: File) => void;
  onReset: () => void;
}) {
  const id = useId();
  const [dragging, setDragging] = useState(false);

  if (state.stage && !state.fileError) {
    const order: ProcessingStage[] = state.file?.isMp3
      ? ["decoding", "waveform"]
      : ["decoding", "waveform", "encoding"];
    const currentIndex = order.indexOf(state.stage);
    return (
      <div className="rounded-xl border bg-card p-4 @sm:p-5">
        <FileName file={state.file} />
        <ul className="mt-4 grid gap-2.5 text-sm" aria-live="polite">
          {order.map((stage, index) => (
            <li
              key={stage}
              className={cn(
                "flex items-center gap-2.5",
                index > currentIndex && "text-muted-foreground",
              )}
            >
              {index < currentIndex ? (
                <CheckIcon
                  className="size-4 text-primary-text"
                  aria-hidden="true"
                />
              ) : index === currentIndex ? (
                <Loader2Icon
                  className="size-4 motion-safe:animate-spin"
                  aria-hidden="true"
                />
              ) : (
                <span className="size-4" aria-hidden="true" />
              )}
              {STAGE_LABELS[stage]}
            </li>
          ))}
        </ul>
        <ProgressBar value={state.progress} label={STAGE_LABELS[state.stage]} />
        <p className="mt-3 text-sm text-muted-foreground">
          Fill in the details while you wait.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      <label
        htmlFor={`${id}-file`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files[0];
          if (file) onFile(file);
        }}
        data-dragging={dragging || undefined}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-12 text-center transition-colors duration-(--duration-fast)",
          "hover:border-[color-mix(in_oklab,var(--border),var(--foreground)_25%)] has-[input:focus-visible]:ring-2 has-[input:focus-visible]:ring-ring",
          "data-dragging:border-primary data-dragging:bg-primary-soft",
        )}
      >
        <span className="grid size-12 place-items-center rounded-full bg-secondary">
          <UploadIcon className="size-5" aria-hidden="true" />
        </span>
        <span className="font-medium">
          Drop your file here, or click to choose one.
        </span>
        <span className="text-sm text-muted-foreground">
          mp3, wav, aiff or flac. Up to 15 minutes and 150 MB.
        </span>
        <input
          id={`${id}-file`}
          type="file"
          accept=".mp3,.wav,.aiff,.aif,.flac,audio/mpeg,audio/wav,audio/aiff,audio/flac"
          className="sr-only"
          aria-describedby={state.fileError ? `${id}-error` : undefined}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onFile(file);
            e.target.value = "";
          }}
        />
      </label>
      {state.fileError ? (
        <div
          id={`${id}-error`}
          role="alert"
          className="flex flex-col items-start gap-2 rounded-lg bg-destructive-soft p-3 text-sm text-destructive @sm:flex-row @sm:items-center @sm:justify-between"
        >
          <p>
            {state.file ? (
              <span className="font-medium break-all">{state.file.name}: </span>
            ) : null}
            {fileErrorText(state.fileError, state.fileDurationMs)}
          </p>
          <Button
            variant="ghost"
            size="sm"
            onClick={onReset}
            className="shrink-0 text-destructive"
          >
            Clear
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function FileName({ file }: { file: UploadState["file"] }) {
  if (!file) return null;
  return (
    <p className="flex min-w-0 items-center gap-2 text-sm">
      <FileAudioIcon
        className="size-4 shrink-0 text-muted-foreground"
        aria-hidden="true"
      />
      <span className="truncate font-medium">{file.name}</span>
      <span className="shrink-0 text-muted-foreground" data-numeric>
        {(file.size / 1024 / 1024).toFixed(1)} MB
      </span>
    </p>
  );
}

function WaveformPreview({ state }: { state: UploadState }) {
  return (
    <div className="rounded-xl border bg-card p-3 @sm:p-4">
      <div className="flex items-center justify-between gap-3">
        <FileName file={state.file} />
        {state.durationMs ? (
          <time data-numeric className="shrink-0 text-sm text-muted-foreground">
            {formatTime(state.durationMs)}
          </time>
        ) : null}
      </div>
      {state.peaks ? (
        <MiniWaveform peaks={state.peaks} bars={120} className="mt-3 h-14" />
      ) : null}
      {state.stage === "encoding" ? (
        <div className="mt-3 grid gap-1.5">
          <p
            className="flex justify-between text-xs text-muted-foreground"
            aria-live="polite"
          >
            <span>Getting it ready to stream… You can keep going.</span>
            <span data-numeric>{Math.round(state.progress * 100)}%</span>
          </p>
          <ProgressBar
            value={state.progress}
            label="Getting it ready to stream"
          />
        </div>
      ) : null}
    </div>
  );
}

function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: React.ReactNode;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-sm text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function Optional() {
  return <span className="font-normal text-muted-foreground"> (optional)</span>;
}

function DetailsStep({
  state,
  genres,
  onEdit,
  onNext,
}: {
  state: UploadState;
  genres: { slug: string; name: string }[];
  onEdit: (details: Partial<Details>) => void;
  onNext: () => void;
}) {
  const id = useId();
  const { details, detailErrors } = state;
  const describe = (name: string, hasError: boolean, hasHint = false) =>
    hasError
      ? `${id}-${name}-error`
      : hasHint
        ? `${id}-${name}-hint`
        : undefined;

  return (
    <form
      noValidate
      className="grid gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        onNext();
      }}
    >
      <WaveformPreview state={state} />
      {state.publishError === "encode_failed" ? (
        <p
          role="alert"
          className="rounded-lg bg-destructive-soft p-3 text-sm text-destructive"
        >
          {publishErrorText("encode_failed", null)}
        </p>
      ) : null}

      <Field id={`${id}-title`} label="Title" error={detailErrors.title}>
        <Input
          id={`${id}-title`}
          value={details.title}
          maxLength={UPLOAD_LIMITS.titleMax + 20}
          onChange={(e) => onEdit({ title: e.target.value })}
          aria-invalid={detailErrors.title ? true : undefined}
          aria-describedby={describe("title", !!detailErrors.title)}
          autoComplete="off"
        />
      </Field>

      <div className="grid gap-5 @md:grid-cols-2">
        <Field
          id={`${id}-genre`}
          label="Genre"
          hint="Pick one main genre."
          error={detailErrors.genre}
        >
          <select
            id={`${id}-genre`}
            value={details.genre}
            onChange={(e) => onEdit({ genre: e.target.value })}
            aria-invalid={detailErrors.genre ? true : undefined}
            aria-describedby={describe("genre", !!detailErrors.genre, true)}
            className={cn(fieldClasses, "h-10 appearance-auto")}
          >
            <option value="">Choose a genre</option>
            {genres.map((g) => (
              <option key={g.slug} value={g.slug}>
                {g.name}
              </option>
            ))}
          </select>
        </Field>
        <Field
          id={`${id}-tags`}
          label={
            <>
              Tags
              <Optional />
            </>
          }
          hint={`Separate with commas. Up to ${UPLOAD_LIMITS.maxTags}.`}
        >
          <Input
            id={`${id}-tags`}
            value={details.tags}
            onChange={(e) => onEdit({ tags: e.target.value })}
            aria-describedby={describe("tags", false, true)}
            autoComplete="off"
          />
        </Field>
      </div>

      <Field
        id={`${id}-description`}
        label={
          <>
            Description
            <Optional />
          </>
        }
        hint="Anything people should know before they listen?"
      >
        <Textarea
          id={`${id}-description`}
          value={details.description}
          maxLength={DESCRIPTION_MAX}
          onChange={(e) => onEdit({ description: e.target.value })}
          aria-describedby={describe("description", false, true)}
        />
      </Field>

      <fieldset className="grid gap-2" aria-describedby={`${id}-wants-hint`}>
        <legend className="mb-2 text-sm font-medium">
          What do you want feedback on?
        </legend>
        <div className="flex flex-wrap gap-1.5">
          {FEEDBACK_ORDER.map((want) => {
            const checked = details.feedbackWants.includes(want);
            return (
              <label key={want}>
                <input
                  type="checkbox"
                  className="peer sr-only"
                  checked={checked}
                  onChange={() =>
                    onEdit({
                      feedbackWants: checked
                        ? details.feedbackWants.filter((w) => w !== want)
                        : [...details.feedbackWants, want],
                    })
                  }
                />
                <span className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full border px-3.5 text-sm text-muted-foreground transition-colors duration-(--duration-fast) select-none peer-checked:border-transparent peer-checked:bg-foreground peer-checked:text-background peer-focus-visible:ring-2 peer-focus-visible:ring-ring hover:text-foreground peer-checked:hover:text-background">
                  {checked ? (
                    <CheckIcon className="size-3.5" aria-hidden="true" />
                  ) : null}
                  {FEEDBACK_WANT_LABELS[want]}
                </span>
              </label>
            );
          })}
        </div>
        <p id={`${id}-wants-hint`} className="text-xs text-muted-foreground">
          Pick any that apply. It helps people give you the feedback you need.
        </p>
      </fieldset>

      <fieldset className="grid gap-2">
        <legend className="mb-2 text-sm font-medium">
          How experienced are you?
          <Optional />
        </legend>
        <div className="grid gap-1 @md:grid-cols-3">
          {LEVEL_ORDER.map((level) => (
            <label
              key={level}
              className="flex min-h-10 cursor-pointer items-center gap-2.5 rounded-md border px-3 text-sm has-checked:border-ring has-checked:bg-primary-soft has-focus-visible:ring-2 has-focus-visible:ring-ring"
            >
              <input
                type="radio"
                name={`${id}-level`}
                checked={details.level === level}
                onChange={() => onEdit({ level })}
                className="size-4 accent-(--primary) outline-none"
              />
              {LEVEL_LABELS[level]}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex justify-end">
        <Button type="submit" size="lg">
          Continue
        </Button>
      </div>
    </form>
  );
}

function PublishStep({
  state,
  genres,
  contactEmail,
  onOwnWork,
  onBack,
  onPublish,
}: {
  state: UploadState;
  genres: { slug: string; name: string }[];
  contactEmail?: string;
  onOwnWork: (value: boolean) => void;
  onBack: () => void;
  onPublish: () => void;
}) {
  const id = useId();
  const genre =
    genres.find((g) => g.slug === state.details.genre)?.name ??
    state.details.genre;
  const busy = state.publishing;
  return (
    <form
      noValidate
      className="grid gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        onPublish();
      }}
    >
      <div className="rounded-xl border bg-card p-4">
        <p className="text-lg leading-snug font-semibold break-words">
          {state.details.title}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {genre}
          {state.durationMs ? (
            <>
              , <time data-numeric>{formatTime(state.durationMs)}</time>
            </>
          ) : null}
        </p>
        {state.peaks ? (
          <MiniWaveform peaks={state.peaks} bars={120} className="mt-3 h-12" />
        ) : null}
        {state.details.feedbackWants.length > 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            Wants feedback on{" "}
            <span className="text-foreground">
              {state.details.feedbackWants
                .map((w) => FEEDBACK_WANT_LABELS[w])
                .join(", ")}
            </span>
          </p>
        ) : null}
      </div>

      <div className="grid gap-1.5">
        <label className="flex cursor-pointer items-start gap-3 text-sm">
          <input
            type="checkbox"
            checked={state.ownWork}
            onChange={(e) => onOwnWork(e.target.checked)}
            aria-invalid={state.ownWorkError ? true : undefined}
            aria-describedby={
              state.ownWorkError ? `${id}-own-error` : undefined
            }
            className="mt-0.5 size-4 shrink-0 accent-(--primary)"
            disabled={busy}
          />
          This is my own work, not generated by AI.
        </label>
        {state.ownWorkError ? (
          <p
            id={`${id}-own-error`}
            role="alert"
            className="pl-7 text-sm text-destructive"
          >
            Please confirm this is your own work, not generated by AI.
          </p>
        ) : null}
      </div>

      {busy && state.stage ? (
        <div className="grid gap-1.5" aria-live="polite">
          <p className="flex justify-between text-sm">
            <span>{STAGE_LABELS[state.stage]}</span>
            <span data-numeric className="text-muted-foreground">
              {Math.round(state.progress * 100)}%
            </span>
          </p>
          <ProgressBar
            value={state.progress}
            label={STAGE_LABELS[state.stage]}
          />
        </div>
      ) : null}

      {state.publishError ? (
        <p
          role="alert"
          className="rounded-lg bg-destructive-soft p-3 text-sm text-destructive"
        >
          {publishErrorText(state.publishError, state.rateLimit, contactEmail)}
        </p>
      ) : null}

      <div className="flex justify-between gap-3">
        <Button type="button" variant="ghost" onClick={onBack} disabled={busy}>
          Back
        </Button>
        <Button type="submit" size="lg" disabled={busy}>
          {busy ? <Loader2Icon className="motion-safe:animate-spin" /> : null}
          {state.publishError && state.publishError !== "rate_limited"
            ? "Try again"
            : "Publish"}
        </Button>
      </div>
    </form>
  );
}

function DoneStep({ slug }: { slug: string | null }) {
  return (
    <div className="rounded-xl border bg-card p-5">
      <p className="text-sm text-muted-foreground">
        People can listen and comment now. Share the link to get the first ears
        on it.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {slug ? (
          <Button asChild>
            <Link href={`/t/${slug}`}>View track</Link>
          </Button>
        ) : null}
        <Button variant="outline" asChild>
          <Link href="/upload">Upload another</Link>
        </Button>
      </div>
    </div>
  );
}
