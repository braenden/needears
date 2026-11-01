"use client";

import { useId, useReducer, useRef, useState } from "react";
import { Loader2Icon, UploadIcon } from "lucide-react";

import { MiniWaveform } from "@/components/track/mini-waveform";
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
import { Textarea } from "@/components/ui/textarea";
import {
  extensionOf,
  initialUploadState,
  UPLOAD_LIMITS,
  uploadReducer,
  validateFile,
} from "@/components/upload/upload-state";
import {
  FileStep,
  ProgressBar,
  publishErrorText,
  STAGE_LABELS,
  type UploadPipeline,
} from "@/components/upload/upload-wizard";
import { formatTime } from "@/lib/time";
import type { TrackVersion } from "@/types/view";

export const VERSIONS_MAX = 10;
export const VERSION_NOTE_MAX = 500;

/**
 * Same browser work as a first upload (decode, peaks, encode), then the new
 * version is published with its note instead of track details.
 */
export type VersionPipeline = Pick<UploadPipeline, "analyze" | "encode"> & {
  publish: (
    input: { note: string; durationMs: number; peaks: number[] },
    onProgress: (progress: number) => void,
  ) => Promise<
    | { ok: true; version: TrackVersion }
    | {
        ok: false;
        error: "upload_interrupted" | "rate_limited" | "unknown";
        rateLimit?: { limit: number; retry: string };
      }
  >;
};

/**
 * Owner-only "Upload a new version" button and dialog on the track page.
 * Comments stay on the version they were left on.
 */
export function NewVersionDialog({
  trackTitle,
  versionCount,
  pipeline,
  onPublished,
  isMobile = false,
  onClose,
}: {
  trackTitle: string;
  /** How many versions the track has now. */
  versionCount: number;
  pipeline: VersionPipeline;
  onPublished: (version: TrackVersion) => void;
  isMobile?: boolean;
  /**
   * Opened from somewhere else (a menu): no button of its own, open from
   * the start, and this runs when it closes.
   */
  onClose?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const atLimit = versionCount >= VERSIONS_MAX;

  if (onClose) {
    return (
      <VersionDialog
        trackTitle={trackTitle}
        nextVersionNo={versionCount + 1}
        pipeline={pipeline}
        isMobile={isMobile}
        onClose={onClose}
        onPublished={onPublished}
      />
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        variant="outline"
        size="sm"
        disabled={atLimit}
        onClick={() => setOpen(true)}
        aria-describedby={atLimit ? "version-limit-note" : undefined}
      >
        <UploadIcon /> Upload a new version
      </Button>
      {atLimit ? (
        <p id="version-limit-note" className="text-sm text-muted-foreground">
          A track can have up to {VERSIONS_MAX} versions.
        </p>
      ) : null}
      {open ? (
        <VersionDialog
          trackTitle={trackTitle}
          nextVersionNo={versionCount + 1}
          pipeline={pipeline}
          isMobile={isMobile}
          onClose={() => setOpen(false)}
          onPublished={onPublished}
        />
      ) : null}
    </div>
  );
}

function VersionDialog({
  trackTitle,
  nextVersionNo,
  pipeline,
  isMobile,
  onClose,
  onPublished,
}: {
  trackTitle: string;
  nextVersionNo: number;
  pipeline: VersionPipeline;
  isMobile: boolean;
  onClose: () => void;
  onPublished: (version: TrackVersion) => void;
}) {
  const id = useId();
  const [state, dispatch] = useReducer(uploadReducer, initialUploadState);
  const [note, setNote] = useState("");
  const [published, setPublished] = useState<TrackVersion | null>(null);
  const fileRef = useRef<File | null>(null);
  const runRef = useRef(0);
  const encodingRef = useRef<Promise<boolean> | null>(null);

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
    if (!info.isMp3) startEncoding(file, run);
  }

  async function publish() {
    // There is no own-work box here: the track already has one.
    dispatch({ type: "own_work", value: true });
    dispatch({ type: "publish_start" });
    if (!state.encoded) {
      if (!encodingRef.current && fileRef.current)
        startEncoding(fileRef.current, runRef.current);
      const ok = encodingRef.current ? await encodingRef.current : true;
      if (!ok) {
        dispatch({ type: "publish_failed", error: "encode_failed" });
        encodingRef.current = null;
        return;
      }
    }
    dispatch({ type: "stage", stage: "uploading", progress: 0 });
    const result = await pipeline.publish(
      {
        note: note.trim(),
        durationMs: state.durationMs ?? 0,
        peaks: state.peaks ?? [],
      },
      (progress) => dispatch({ type: "stage", stage: "uploading", progress }),
    );
    if (result.ok) {
      setPublished(result.version);
      dispatch({ type: "published", slug: "" });
    } else {
      dispatch({
        type: "publish_failed",
        error: result.error,
        rateLimit: result.rateLimit,
      });
    }
  }

  const busy = state.publishing;

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (next || busy) return;
        if (published) onPublished(published);
        onClose();
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {published
              ? `v${published.version_no} is live`
              : `Upload v${nextVersionNo}`}
          </DialogTitle>
          <DialogDescription className="break-words">
            {published
              ? "Comments on earlier versions stay where they were, and people can switch between versions."
              : `A new version of ${trackTitle}. Comments on earlier versions stay with them.`}
          </DialogDescription>
        </DialogHeader>

        {published ? (
          <DialogFooter>
            <Button
              onClick={() => {
                onPublished(published);
                onClose();
              }}
            >
              Done
            </Button>
          </DialogFooter>
        ) : state.step === "file" ? (
          <div className="@container">
            <FileStep
              state={state}
              onFile={handleFile}
              onReset={() => dispatch({ type: "reset" })}
            />
          </div>
        ) : (
          <form
            noValidate
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              void publish();
            }}
          >
            <div className="rounded-lg border bg-card p-3">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0 truncate font-medium">
                  {state.file?.name}
                </span>
                {state.durationMs ? (
                  <time data-numeric className="shrink-0 text-muted-foreground">
                    {formatTime(state.durationMs)}
                  </time>
                ) : null}
              </div>
              {state.peaks ? (
                <MiniWaveform
                  peaks={state.peaks}
                  bars={96}
                  className="mt-2 h-10"
                />
              ) : null}
            </div>

            <div className="grid gap-1.5">
              <label htmlFor={`${id}-note`} className="text-sm font-medium">
                What changed?{" "}
                <span className="font-normal text-muted-foreground">
                  (optional)
                </span>
              </label>
              <Textarea
                id={`${id}-note`}
                value={note}
                maxLength={VERSION_NOTE_MAX}
                placeholder="Shortened the build, pulled the vocal chop down 2 dB"
                onChange={(e) => setNote(e.target.value)}
                aria-describedby={`${id}-note-hint`}
                disabled={busy}
              />
              <p
                id={`${id}-note-hint`}
                className="flex justify-between gap-3 text-xs text-muted-foreground"
              >
                <span>
                  Shown under the version picker, so people know what to listen
                  for.
                </span>
                <span data-numeric>{VERSION_NOTE_MAX - note.length}</span>
              </p>
            </div>

            {state.stage ? (
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
                {publishErrorText(state.publishError, state.rateLimit)}
              </p>
            ) : null}

            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="ghost" disabled={busy}>
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" disabled={busy}>
                {busy ? <Loader2Icon className="animate-spin" /> : null}
                {state.publishError && state.publishError !== "rate_limited"
                  ? "Try again"
                  : `Publish v${nextVersionNo}`}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
