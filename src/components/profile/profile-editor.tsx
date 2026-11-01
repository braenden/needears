"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Loader2Icon, PlusIcon, XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { BIO_MAX, DISPLAY_NAME_MAX, HANDLE_PATTERN } from "@/config/limits";
import { focusFirstInvalid } from "@/lib/forms/focus-invalid";
import { cn } from "@/lib/utils";

import {
  HostIcon,
  hostOf,
  LINK_SERVICE_NAMES,
  linkError,
  LINKS_MAX,
  type ProfileLink,
} from "./link-hosts";

export const WORKING_ON_MAX = 120;
export const DAW_MAX = 40;

const DAW_SUGGESTIONS = [
  "Ableton Live",
  "FL Studio",
  "Logic Pro",
  "Bitwig Studio",
  "Reaper",
  "Cubase",
  "Pro Tools",
  "Studio One",
  "GarageBand",
];

/** Everything on the public profile except the photo, which saves itself. */
export type ProfileFields = {
  displayName: string;
  handle: string;
  bio: string;
  workingOn: string;
  daw: string;
  links: ProfileLink[];
};

export type ProfileSaveResult =
  { ok: true } | { ok: false; error: string; field?: "handle" };

/** "120 characters left", the same under every field with a limit. */
function CharactersLeft({ id, left }: { id: string; left: number }) {
  return (
    <span id={id} data-numeric className="shrink-0">
      {left} characters left
    </span>
  );
}

/**
 * The public profile in one form with one Save: name, username, bio, what
 * you are working on, your DAW and up to five links. Checks the username
 * and the links before saving, so people see the problem next to the field.
 */
export function ProfileEditor({
  initial,
  onSave,
  onCancel,
  onDirtyChange,
  className,
}: {
  initial: ProfileFields;
  onSave: (fields: ProfileFields) => Promise<ProfileSaveResult>;
  /** Shows a Cancel button. */
  onCancel?: () => void;
  /** True while there are changes that are not saved. */
  onDirtyChange?: (dirty: boolean) => void;
  className?: string;
}) {
  const id = useId();
  const [displayName, setDisplayName] = useState(initial.displayName);
  const [handle, setHandle] = useState(initial.handle);
  const [handleError, setHandleError] = useState<string | null>(null);
  const [bio, setBio] = useState(initial.bio);
  const [workingOn, setWorkingOn] = useState(initial.workingOn);
  const [daw, setDaw] = useState(initial.daw);
  const [links, setLinks] = useState<ProfileLink[]>(initial.links);
  // Saved values count as clean, so a successful save resets it.
  const [saved, setSaved] = useState(initial);
  const dirty =
    displayName !== saved.displayName ||
    handle !== saved.handle ||
    bio !== saved.bio ||
    workingOn !== saved.workingOn ||
    daw !== saved.daw ||
    JSON.stringify(links.map((l) => l.url)) !==
      JSON.stringify(saved.links.map((l) => l.url));
  const onDirtyChangeRef = useRef(onDirtyChange);
  useEffect(() => {
    onDirtyChangeRef.current = onDirtyChange;
  }, [onDirtyChange]);
  useEffect(() => {
    onDirtyChangeRef.current?.(dirty);
  }, [dirty]);
  const [linkErrors, setLinkErrors] = useState<(string | null)[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function editLink(index: number, patch: Partial<ProfileLink>) {
    setLinks((list) =>
      list.map((l, i) => (i === index ? { ...l, ...patch } : l)),
    );
    setLinkErrors((errors) => errors.map((e, i) => (i === index ? null : e)));
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const cleanHandle = handle.trim().toLowerCase();
    if (!HANDLE_PATTERN.test(cleanHandle)) {
      setHandleError("Use 3 to 20 letters, numbers or underscores.");
      focusFirstInvalid(form);
      return;
    }
    setHandleError(null);
    // One address per link. The profile shows the service's name, so there
    // is no label to fill in.
    const cleaned = links
      .map((l) => ({ label: "", url: l.url.trim() }))
      .filter((l) => l.url);
    const errors = cleaned.map(linkError);
    if (errors.some(Boolean)) {
      setLinks(cleaned);
      setLinkErrors(errors);
      focusFirstInvalid(form);
      return;
    }
    setLinkErrors([]);
    setError(null);
    setSaving(true);
    try {
      const next = {
        displayName: displayName.trim() || cleanHandle,
        handle: cleanHandle,
        bio: bio.trim(),
        workingOn: workingOn.trim(),
        daw: daw.trim(),
        links: cleaned,
      };
      const result = await onSave(next);
      if (!result.ok && result.field === "handle") {
        setHandleError(result.error);
        focusFirstInvalid(form);
      } else if (!result.ok) setError(result.error);
      else {
        setDisplayName(next.displayName);
        setHandle(next.handle);
        setBio(next.bio);
        setWorkingOn(next.workingOn);
        setDaw(next.daw);
        setLinks(cleaned);
        setSaved(next);
      }
    } catch {
      setError("Something broke on our side. Try again in a minute.");
    }
    setSaving(false);
  }

  return (
    <form noValidate onSubmit={save} className={cn("grid gap-5", className)}>
      <div className="grid gap-1.5">
        <label htmlFor={`${id}-name`} className="text-sm font-medium">
          Display name
        </label>
        <Input
          id={`${id}-name`}
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          maxLength={DISPLAY_NAME_MAX}
          autoComplete="nickname"
        />
      </div>

      <div className="grid gap-1.5">
        <label htmlFor={`${id}-handle`} className="text-sm font-medium">
          Username
        </label>
        <Input
          id={`${id}-handle`}
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
          maxLength={20}
          autoCapitalize="none"
          autoComplete="username"
          spellCheck={false}
          aria-invalid={handleError ? true : undefined}
          aria-describedby={`${id}-handle-hint${handleError ? ` ${id}-handle-error` : ""}`}
        />
        <p id={`${id}-handle-hint`} className="text-xs text-muted-foreground">
          3 to 20 characters. Letters, numbers and underscores. Changing it
          changes your profile link.
        </p>
        {handleError ? (
          <p
            id={`${id}-handle-error`}
            role="alert"
            className="text-sm text-destructive"
          >
            {handleError}
          </p>
        ) : null}
      </div>

      <div className="grid gap-1.5">
        <label htmlFor={`${id}-bio`} className="text-sm font-medium">
          Bio{" "}
          <span className="font-normal text-muted-foreground">(optional)</span>
        </label>
        <Textarea
          id={`${id}-bio`}
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          maxLength={BIO_MAX}
          aria-describedby={`${id}-bio-count`}
        />
        <p className="flex justify-end text-xs text-muted-foreground">
          <CharactersLeft id={`${id}-bio-count`} left={BIO_MAX - bio.length} />
        </p>
      </div>

      <div className="grid gap-1.5">
        <label htmlFor={`${id}-working`} className="text-sm font-medium">
          Working on{" "}
          <span className="font-normal text-muted-foreground">(optional)</span>
        </label>
        <Input
          id={`${id}-working`}
          value={workingOn}
          maxLength={WORKING_ON_MAX}
          placeholder="Finishing an EP of slow house tracks"
          onChange={(e) => setWorkingOn(e.target.value)}
          aria-describedby={`${id}-working-hint ${id}-working-count`}
          autoComplete="off"
        />
        <p className="flex justify-between gap-3 text-xs text-muted-foreground">
          <span id={`${id}-working-hint`}>
            One line on your profile about what you&apos;re making right now.
          </span>
          <CharactersLeft
            id={`${id}-working-count`}
            left={WORKING_ON_MAX - workingOn.length}
          />
        </p>
      </div>

      <div className="grid gap-1.5">
        <label htmlFor={`${id}-daw`} className="text-sm font-medium">
          DAW{" "}
          <span className="font-normal text-muted-foreground">(optional)</span>
        </label>
        <Input
          id={`${id}-daw`}
          value={daw}
          maxLength={DAW_MAX}
          list={`${id}-daws`}
          onChange={(e) => setDaw(e.target.value)}
          aria-describedby={`${id}-daw-hint`}
          autoComplete="off"
        />
        <datalist id={`${id}-daws`}>
          {DAW_SUGGESTIONS.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
        <p id={`${id}-daw-hint`} className="text-xs text-muted-foreground">
          Helps people give tips that work in what you use.
        </p>
      </div>

      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-medium">
          Links{" "}
          <span className="font-normal text-muted-foreground">(optional)</span>
        </legend>
        <p className="text-xs text-muted-foreground">
          Up to {LINKS_MAX}, to {LINK_SERVICE_NAMES.join(", ")}.
        </p>
        {links.length > 0 ? (
          <ul className="grid gap-2">
            {links.map((link, index) => {
              const linkErrorText = linkErrors[index];
              const n = index + 1;
              return (
                <li key={index} className="grid gap-1">
                  <div className="@container flex flex-wrap items-center gap-2">
                    <span className="grid size-10 shrink-0 place-items-center rounded-md border text-muted-foreground">
                      <HostIcon host={hostOf(link.url)} />
                    </span>
                    <Input
                      aria-label={`Link ${n} address`}
                      value={link.url}
                      inputMode="url"
                      placeholder="https://soundcloud.com/you"
                      onChange={(e) => editLink(index, { url: e.target.value })}
                      aria-invalid={linkErrorText ? true : undefined}
                      aria-describedby={
                        linkErrorText ? `${id}-link-${index}-error` : undefined
                      }
                      autoComplete="url"
                      spellCheck={false}
                      className="min-w-0 flex-1"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove link ${n}`}
                      onClick={() => {
                        setLinks((list) => list.filter((_, i) => i !== index));
                        setLinkErrors((errors) =>
                          errors.filter((_, i) => i !== index),
                        );
                      }}
                      className="text-muted-foreground"
                    >
                      <XIcon />
                    </Button>
                  </div>
                  {linkErrorText ? (
                    <p
                      id={`${id}-link-${index}-error`}
                      className="pl-12 text-sm text-destructive"
                    >
                      {linkErrorText}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : null}
        {links.length < LINKS_MAX ? (
          <div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                setLinks((list) => [...list, { label: "", url: "" }])
              }
            >
              <PlusIcon /> Add a link
            </Button>
          </div>
        ) : null}
      </fieldset>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" disabled={saving}>
          {saving ? <Loader2Icon className="animate-spin" /> : null}
          Save
        </Button>
        {onCancel ? (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}
