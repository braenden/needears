"use client";

import { useId, useState } from "react";
import { Loader2Icon, PlusIcon, XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import {
  HostIcon,
  hostOf,
  LINK_HOSTS,
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

export type ProfileExtras = {
  workingOn: string;
  daw: string;
  links: ProfileLink[];
};

export type ProfileExtrasResult = { ok: true } | { ok: false; error: string };

/**
 * The newer profile fields: what you are working on, your DAW and up to five
 * links. Validates links before saving so people see the problem next to
 * the field.
 */
export function ProfileExtrasForm({
  initial,
  onSave,
  submitLabel = "Save profile",
  className,
}: {
  initial: ProfileExtras;
  onSave: (extras: ProfileExtras) => Promise<ProfileExtrasResult>;
  /** The button text, when the page has other forms that save a profile. */
  submitLabel?: string;
  className?: string;
}) {
  const id = useId();
  const [workingOn, setWorkingOn] = useState(initial.workingOn);
  const [daw, setDaw] = useState(initial.daw);
  const [links, setLinks] = useState<ProfileLink[]>(initial.links);
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
    // One address per link. The profile shows the service's name, so there
    // is no label to fill in.
    const cleaned = links
      .map((l) => ({ label: "", url: l.url.trim() }))
      .filter((l) => l.url);
    const errors = cleaned.map(linkError);
    if (errors.some(Boolean)) {
      setLinks(cleaned);
      setLinkErrors(errors);
      return;
    }
    setLinkErrors([]);
    setError(null);
    setSaving(true);
    try {
      const result = await onSave({
        workingOn: workingOn.trim(),
        daw: daw.trim(),
        links: cleaned,
      });
      if (!result.ok) setError(result.error);
      else setLinks(cleaned);
    } catch {
      setError("Something broke on our side. Try again in a minute.");
    }
    setSaving(false);
  }

  return (
    <form noValidate onSubmit={save} className={cn("grid gap-5", className)}>
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
          aria-describedby={`${id}-working-hint`}
          autoComplete="off"
        />
        <p
          id={`${id}-working-hint`}
          className="flex justify-between gap-3 text-xs text-muted-foreground"
        >
          <span>
            One line on your profile about what you&apos;re making right now.
          </span>
          <span data-numeric>{WORKING_ON_MAX - workingOn.length}</span>
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
          className="max-w-xs"
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
          Up to {LINKS_MAX}, to {LINK_HOSTS.map((h) => h.name).join(", ")}.
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
      <div>
        <Button type="submit" disabled={saving}>
          {saving ? <Loader2Icon className="motion-safe:animate-spin" /> : null}
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
