"use client";

import { useState } from "react";
import { CheckCircle2Icon, Loader2Icon, TriangleAlertIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

type Violation = {
  id: string;
  impact: string | null;
  help: string;
  targets: string[];
};

/** Runs axe-core on the whole page. Dev tool, lives only on /design. */
export function AxeCheck() {
  const [state, setState] = useState<"idle" | "running" | "done">("idle");
  const [violations, setViolations] = useState<Violation[]>([]);

  async function run() {
    setState("running");
    const axe = (await import("axe-core")).default;
    const result = await axe.run(document, { resultTypes: ["violations"] });
    const list = result.violations.map((v) => ({
      id: v.id,
      impact: v.impact ?? null,
      help: v.help,
      targets: v.nodes.map((n) => n.target.join(" ")),
    }));
    (window as unknown as { __axe: Violation[] }).__axe = list;
    setViolations(list);
    setState("done");
  }

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="outline"
          size="sm"
          onClick={() => void run()}
          disabled={state === "running"}
        >
          {state === "running" ? (
            <Loader2Icon className="animate-spin" />
          ) : null}
          Run axe on this page
        </Button>
        <p aria-live="polite" className="text-sm">
          {state === "done" ? (
            violations.length === 0 ? (
              <span className="inline-flex items-center gap-1.5 text-success">
                <CheckCircle2Icon className="size-4" aria-hidden="true" /> No
                violations
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-destructive">
                <TriangleAlertIcon className="size-4" aria-hidden="true" />
                {violations.length}{" "}
                {violations.length === 1 ? "violation" : "violations"}
              </span>
            )
          ) : null}
        </p>
      </div>
      {violations.length > 0 ? (
        <ul className="grid gap-2 text-sm">
          {violations.map((v) => (
            <li
              key={v.id}
              className="rounded-md bg-destructive-soft p-2 text-destructive"
            >
              <span className="font-medium">{v.id}</span> ({v.impact}): {v.help}
              <span className="mt-1 block text-xs break-all">
                {v.targets.slice(0, 5).join(", ")}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
