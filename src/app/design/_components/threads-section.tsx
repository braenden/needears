"use client";

import { useState } from "react";
import { toast } from "sonner";

import { CommentList } from "@/components/comments/comment-list";
import { displayNameOf } from "@/components/common/user-avatar";
import { threadedComments } from "@/mocks/comments";
import { jonas, nora } from "@/mocks/profiles";
import type { ThreadComment } from "@/types/view";

import { ChoiceGroup } from "./choice-group";
import { Example, Section } from "./section";

type Viewer = "owner" | "visitor" | "signed_out";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Threads wired to local state. Type "fail" in a reply to see the error. */
function ThreadsDemo() {
  const [viewer, setViewer] = useState<Viewer>("owner");
  const [comments, setComments] = useState<ThreadComment[]>(threadedComments);

  return (
    <div className="grid gap-4">
      <ChoiceGroup<Viewer>
        label="View as"
        value={viewer}
        onChange={setViewer}
        options={[
          { value: "owner", label: "Owner" },
          { value: "visitor", label: "Visitor" },
          { value: "signed_out", label: "Signed out" },
        ]}
      />
      <CommentList
        comments={comments}
        viewer={viewer}
        onSignIn={() => toast("This would go to the sign-in page.")}
        onReply={async (parent, body) => {
          await wait(600);
          if (body.toLowerCase().includes("fail")) {
            return { ok: false, error: "failed" };
          }
          const author = viewer === "owner" ? jonas : nora;
          setComments((list) => [
            ...list,
            {
              id: `reply-${list.length}`,
              track_id: parent.track_id,
              author_id: author.id,
              author,
              parent_id: parent.id,
              time_ms: null,
              category: "vibe",
              body,
              is_helpful: false,
              status: "live",
              created_at: new Date().toISOString(),
            },
          ]);
          return { ok: true };
        }}
        onToggleResolved={(comment, resolved) => {
          setComments((list) =>
            list.map((c) =>
              c.id === comment.id
                ? {
                    ...c,
                    resolved_at: resolved ? new Date().toISOString() : null,
                  }
                : c,
            ),
          );
          toast.success(
            resolved
              ? `Marked ${displayNameOf(comment.author)}'s comment as resolved.`
              : "Comment reopened.",
          );
        }}
        onToggleHelpful={(comment, helpful) =>
          setComments((list) =>
            list.map((c) =>
              c.id === comment.id ? { ...c, is_helpful: helpful } : c,
            ),
          )
        }
      />
    </div>
  );
}

const ok = async () => ({ ok: true as const });

export function ThreadsSection() {
  return (
    <Section
      id="threads"
      title="Replies and Resolved"
      description="One level of replies under a comment, with the reply box hidden until someone presses Reply. The track owner can mark a comment as resolved; resolved comments are muted and can be hidden with Show resolved."
    >
      <Example
        title="Wired up"
        note="Reply, resolve and reopen change local state. Escape closes the reply box, Cmd or Ctrl + Enter sends."
      >
        <ThreadsDemo />
      </Example>
      <div className="grid gap-8 lg:grid-cols-2">
        <Example title="Resolved hidden" note="Show resolved unchecked.">
          <CommentList
            comments={threadedComments}
            viewer="owner"
            defaultShowResolved={false}
            onReply={ok}
            onToggleResolved={() => {}}
          />
        </Example>
        <Example title="Signed out" note="Reply asks people to sign in.">
          <CommentList
            comments={threadedComments
              .slice(0, 2)
              .concat(threadedComments.slice(-4, -2))}
            viewer="signed_out"
            onReply={ok}
          />
        </Example>
      </div>
    </Section>
  );
}
