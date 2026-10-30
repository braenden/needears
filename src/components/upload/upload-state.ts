import type { TrackLevel, FeedbackWant } from "@/types/view";

import { TAGS_MAX, TITLE_MAX } from "@/config/limits";
import {
  INPUT_EXTENSIONS,
  INPUT_MAX_BYTES,
  INPUT_MOBILE_MAX_BYTES,
  MAX_DURATION_MS,
} from "@/config/upload";

export const UPLOAD_LIMITS = {
  maxBytes: INPUT_MAX_BYTES,
  mobileMaxBytes: INPUT_MOBILE_MAX_BYTES,
  maxDurationMs: MAX_DURATION_MS,
  titleMax: TITLE_MAX,
  maxTags: TAGS_MAX,
};
const MIME = /^audio\/(mpeg|mp3|wav|x-wav|wave|aiff|x-aiff|flac|x-flac)$/;

export type FileError =
  | "wrong_format"
  | "too_large"
  | "mobile_too_large"
  | "too_long"
  | "decode_failed"
  | "flac_unsupported";

export type PublishError =
  "upload_interrupted" | "rate_limited" | "encode_failed" | "unknown";

export type ProcessingStage =
  "decoding" | "waveform" | "encoding" | "uploading";

export type Details = {
  title: string;
  genre: string;
  tags: string;
  description: string;
  feedbackWants: FeedbackWant[];
  level: TrackLevel | null;
};

export type UploadState = {
  step: "file" | "details" | "publish" | "done";
  file: { name: string; size: number; isMp3: boolean } | null;
  fileError: FileError | null;
  /** Filled in for the too_long message. */
  fileDurationMs: number | null;
  /** Current background stage, null when nothing is running. */
  stage: ProcessingStage | null;
  progress: number;
  encoded: boolean;
  peaks: number[] | null;
  durationMs: number | null;
  details: Details;
  detailErrors: Partial<Record<"title" | "genre", string>>;
  ownWork: boolean;
  ownWorkError: boolean;
  publishing: boolean;
  publishError: PublishError | null;
  rateLimit: { limit: number; retry: string } | null;
  slug: string | null;
};

export const initialUploadState: UploadState = {
  step: "file",
  file: null,
  fileError: null,
  fileDurationMs: null,
  stage: null,
  progress: 0,
  encoded: false,
  peaks: null,
  durationMs: null,
  details: {
    title: "",
    genre: "",
    tags: "",
    description: "",
    feedbackWants: [],
    level: null,
  },
  detailErrors: {},
  ownWork: false,
  ownWorkError: false,
  publishing: false,
  publishError: null,
  rateLimit: null,
  slug: null,
};

export function extensionOf(name: string) {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

export function validateFile(
  file: Pick<File, "name" | "size" | "type">,
  { isMobile = false } = {},
): FileError | null {
  const okType =
    INPUT_EXTENSIONS.includes(extensionOf(file.name)) || MIME.test(file.type);
  if (!okType) return "wrong_format";
  if (file.size > UPLOAD_LIMITS.maxBytes) return "too_large";
  if (isMobile && file.size > UPLOAD_LIMITS.mobileMaxBytes)
    return "mobile_too_large";
  return null;
}

function validateDetails(details: Details) {
  const errors: UploadState["detailErrors"] = {};
  if (!details.title.trim()) errors.title = "Give your track a title.";
  else if (details.title.length > UPLOAD_LIMITS.titleMax)
    errors.title = `Titles can be up to ${UPLOAD_LIMITS.titleMax} characters.`;
  if (!details.genre) errors.genre = "Pick a genre.";
  return errors;
}

export type UploadAction =
  | {
      type: "file_rejected";
      file: UploadState["file"];
      error: FileError;
      durationMs?: number;
    }
  | { type: "file_accepted"; file: NonNullable<UploadState["file"]> }
  | { type: "stage"; stage: ProcessingStage; progress: number }
  | { type: "analyzed"; peaks: number[]; durationMs: number }
  | { type: "encoded" }
  | { type: "encode_failed" }
  | { type: "reset" }
  | { type: "edit"; details: Partial<Details> }
  | { type: "to_publish" }
  | { type: "back" }
  | { type: "own_work"; value: boolean }
  | { type: "publish_start" }
  | {
      type: "publish_failed";
      error: PublishError;
      rateLimit?: UploadState["rateLimit"];
    }
  | { type: "published"; slug: string };

export function uploadReducer(
  state: UploadState,
  action: UploadAction,
): UploadState {
  switch (action.type) {
    case "file_rejected":
      return {
        ...initialUploadState,
        file: action.file,
        fileError: action.error,
        fileDurationMs: action.durationMs ?? null,
      };
    case "file_accepted":
      return {
        ...initialUploadState,
        details: state.details,
        file: action.file,
        stage: "decoding",
        encoded: action.file.isMp3,
      };
    case "stage":
      return { ...state, stage: action.stage, progress: action.progress };
    case "analyzed": {
      // Prefill the title from the file name, Nora should not have to type it twice.
      const title =
        state.details.title ||
        (state.file?.name ?? "")
          .replace(/\.[^.]+$/, "")
          .replace(/[_-]+/g, " ")
          .trim();
      return {
        ...state,
        step: "details",
        peaks: action.peaks,
        durationMs: action.durationMs,
        stage: state.encoded ? null : "encoding",
        progress: 0,
        details: { ...state.details, title },
      };
    }
    case "encoded":
      return { ...state, encoded: true, stage: null, progress: 1 };
    case "encode_failed":
      return { ...state, stage: null, publishError: "encode_failed" };
    case "reset":
      return initialUploadState;
    case "edit": {
      const details = { ...state.details, ...action.details };
      const detailErrors = { ...state.detailErrors };
      for (const key of Object.keys(action.details)) {
        delete detailErrors[key as keyof typeof detailErrors];
      }
      return { ...state, details, detailErrors };
    }
    case "to_publish": {
      const detailErrors = validateDetails(state.details);
      if (Object.keys(detailErrors).length > 0)
        return { ...state, detailErrors };
      return { ...state, step: "publish", detailErrors };
    }
    case "back":
      return {
        ...state,
        step: state.step === "publish" ? "details" : state.step,
        publishError:
          state.publishError === "encode_failed" ? state.publishError : null,
      };
    case "own_work":
      return { ...state, ownWork: action.value, ownWorkError: false };
    case "publish_start":
      if (!state.ownWork) return { ...state, ownWorkError: true };
      return {
        ...state,
        publishing: true,
        publishError: null,
        rateLimit: null,
      };
    case "publish_failed":
      return {
        ...state,
        publishing: false,
        stage: null,
        publishError: action.error,
        rateLimit: action.rateLimit ?? null,
      };
    case "published":
      return {
        ...state,
        publishing: false,
        stage: null,
        step: "done",
        slug: action.slug,
      };
  }
}
