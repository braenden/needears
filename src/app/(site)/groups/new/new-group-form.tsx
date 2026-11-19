"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2Icon } from "lucide-react";

import { GROUP_COPY } from "@/components/groups/copy";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createGroup, type GroupError } from "../actions";

const NAME_MISSING = GROUP_COPY.nameMissing;

const ERRORS: Partial<Record<GroupError, string>> = {
  invalid_name: NAME_MISSING,
  rate_limited: GROUP_COPY.onePerDay,
  too_many_groups: GROUP_COPY.tooMany,
};

/** A new group is a name, nothing more. */
export function NewGroupForm() {
  const id = useId();
  const router = useRouter();
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const clean = name.trim();
    if (!clean) {
      setNameError(NAME_MISSING);
      document.getElementById(`${id}-name`)?.focus();
      return;
    }
    setNameError(null);
    setError(null);
    setBusy(true);
    const result = await createGroup(clean).catch(() => null);
    if (result?.ok) {
      router.push(`/g/${result.value}`);
      return;
    }
    setBusy(false);
    const reason = result ? result.error : "failed";
    if (reason === "invalid_name") {
      setNameError(NAME_MISSING);
      return;
    }
    setError(ERRORS[reason] ?? GROUP_COPY.broke);
  }

  return (
    <form noValidate onSubmit={submit} className="mt-8 grid gap-6">
      <div className="grid gap-2">
        <label htmlFor={`${id}-name`} className="text-sm font-medium">
          Name
        </label>
        <Input
          id={`${id}-name`}
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (nameError && e.target.value.trim()) setNameError(null);
          }}
          maxLength={60}
          autoComplete="off"
          className="h-11"
          aria-invalid={nameError ? true : undefined}
          aria-describedby={`${id}-name-hint${nameError ? ` ${id}-name-error` : ""}`}
        />
        <p id={`${id}-name-hint`} className="text-sm text-muted-foreground">
          {GROUP_COPY.nameHint}
        </p>
        {nameError ? (
          <p
            id={`${id}-name-error`}
            role="alert"
            className="text-sm text-destructive"
          >
            {nameError}
          </p>
        ) : null}
      </div>
      <div className="grid gap-2">
        <Button
          type="submit"
          size="lg"
          disabled={busy}
          className="h-11 w-full sm:w-auto sm:justify-self-start"
        >
          {busy ? (
            <Loader2Icon className="animate-spin" aria-hidden="true" />
          ) : null}
          Create group
        </Button>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </div>
    </form>
  );
}
