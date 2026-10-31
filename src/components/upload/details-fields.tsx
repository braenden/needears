"use client";

import { useId } from "react";
import { CheckIcon } from "lucide-react";

import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { FEEDBACK_WANT_LABELS, LEVEL_LABELS } from "@/config/labels";
import { DESCRIPTION_MAX } from "@/config/limits";
import type { FeedbackWant, Genre, TrackLevel } from "@/types/view";

import { type DetailErrors, type Details, UPLOAD_LIMITS } from "./upload-state";

const FEEDBACK_ORDER: FeedbackWant[] = [
  "mix",
  "arrangement",
  "vocals",
  "sound_design",
  "vibe",
];

const LEVEL_ORDER: TrackLevel[] = ["beginner", "intermediate", "advanced"];

/**
 * Title, genre, tags, description, feedback wanted and level. Shared by the
 * upload wizard and the owner's edit dialog on the track page.
 */
export function DetailsFields({
  details,
  errors,
  genres,
  onEdit,
}: {
  details: Details;
  errors: DetailErrors;
  genres: Genre[];
  onEdit: (details: Partial<Details>) => void;
}) {
  const id = useId();
  const describe = (name: string, hasError: boolean, hasHint = false) =>
    hasError
      ? `${id}-${name}-error`
      : hasHint
        ? `${id}-${name}-hint`
        : undefined;

  return (
    <>
      <Field id={`${id}-title`} label="Title" error={errors.title}>
        <Input
          id={`${id}-title`}
          value={details.title}
          maxLength={UPLOAD_LIMITS.titleMax + 20}
          onChange={(e) => onEdit({ title: e.target.value })}
          aria-invalid={errors.title ? true : undefined}
          aria-describedby={describe("title", !!errors.title)}
          autoComplete="off"
        />
      </Field>

      <div className="grid gap-5 @md:grid-cols-2">
        <Field
          id={`${id}-genre`}
          label="Genre"
          hint="Pick one main genre."
          error={errors.genre}
        >
          <NativeSelect
            id={`${id}-genre`}
            value={details.genre}
            onChange={(e) => onEdit({ genre: e.target.value })}
            aria-invalid={errors.genre ? true : undefined}
            aria-describedby={describe("genre", !!errors.genre, true)}
            className="h-10"
          >
            <option value="">Choose a genre</option>
            {genres.map((g) => (
              <option key={g.slug} value={g.slug}>
                {g.name}
              </option>
            ))}
          </NativeSelect>
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

      <Field
        id={`${id}-reference`}
        label={
          <>
            Reference track
            <Optional />
          </>
        }
        hint="A track you want yours to sound like, on SoundCloud, YouTube, Spotify or Bandcamp."
        error={errors.reference}
      >
        <Input
          id={`${id}-reference`}
          type="url"
          inputMode="url"
          value={details.reference}
          placeholder="https://soundcloud.com/..."
          onChange={(e) => onEdit({ reference: e.target.value })}
          aria-invalid={errors.reference ? true : undefined}
          aria-describedby={describe("reference", !!errors.reference, true)}
          autoComplete="off"
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
    </>
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
