"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

// Deleting needs a sign in from the last ten minutes in this session
// (src/app/api/account/delete) and the handle typed out.
export function DeleteAccount({ handle }: { handle: string }) {
  const id = useId();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [state, setState] = useState<"idle" | "deleting" | "reauth">("idle");
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setError(null);
    setState("deleting");
    const response = await fetch("/api/account/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm: typed.trim() }),
    }).catch(() => null);
    if (response?.ok) {
      toast("Your account and everything you posted are deleted.");
      router.replace("/");
      router.refresh();
      return;
    }
    if (response?.status === 401) {
      setState("reauth");
      return;
    }
    setState("idle");
    setError(
      response?.status === 400
        ? "Type your username exactly as it is."
        : "Something broke on our side. Try again, or come back in a minute.",
    );
  }

  return (
    <>
      <p className="text-sm text-muted-foreground">
        Deletes your account and everything you posted: tracks, comments,
        reactions and reports.
      </p>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) {
            setTyped("");
            setError(null);
            setState("idle");
          }
        }}
      >
        <DialogTrigger asChild>
          <Button variant="destructive" className="mt-4">
            Delete my account
          </Button>
        </DialogTrigger>
        <DialogContent>
          {state === "reauth" ? (
            <>
              <DialogHeader>
                <DialogTitle>Sign in again first</DialogTitle>
                <DialogDescription>
                  To keep your account safe, sign in again before you delete it.
                  Then come back here within ten minutes.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button asChild>
                  <Link href="/login?reauth=1&next=%2Fsettings%23delete-heading">
                    Sign in again
                  </Link>
                </Button>
              </DialogFooter>
            </>
          ) : (
            <form
              noValidate
              className="grid gap-5"
              onSubmit={(e) => {
                e.preventDefault();
                void remove();
              }}
            >
              <DialogHeader>
                <DialogTitle>Delete your account?</DialogTitle>
                <DialogDescription>
                  This deletes everything for good. It can&apos;t be undone.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-2">
                <label
                  htmlFor={`${id}-confirm`}
                  className="text-sm font-medium"
                >
                  Type <span className="font-mono">{handle}</span> to confirm
                </label>
                <Input
                  id={`${id}-confirm`}
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? `${id}-error` : undefined}
                />
                {error ? (
                  <p
                    id={`${id}-error`}
                    role="alert"
                    className="text-sm text-destructive"
                  >
                    {error}
                  </p>
                ) : null}
              </div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="ghost">
                    Cancel
                  </Button>
                </DialogClose>
                <Button
                  type="submit"
                  variant="destructive"
                  disabled={typed.trim() !== handle || state === "deleting"}
                >
                  {state === "deleting" ? (
                    <Loader2Icon className="motion-safe:animate-spin" />
                  ) : null}
                  Delete everything
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
