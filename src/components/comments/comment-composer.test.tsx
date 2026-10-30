/** @vitest-environment jsdom */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { CommentComposer, type SubmitResult } from "./comment-composer";

function setup(
  props: Partial<React.ComponentProps<typeof CommentComposer>> = {},
  result: SubmitResult = { ok: true },
) {
  const onSubmit = vi.fn(async () => result);
  const user = userEvent.setup();
  render(
    <CommentComposer
      currentTimeMs={102_400}
      durationMs={222_000}
      signedIn
      onSubmit={onSubmit}
      {...props}
    />,
  );
  return {
    user,
    onSubmit,
    textbox: screen.queryByRole("textbox", { name: "Comment" }),
  };
}

describe("CommentComposer", () => {
  it("anchors to the current second and asks what you hear there", () => {
    setup();
    expect(
      screen.getByPlaceholderText("What do you hear at 1:42?"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /at 1:42/ })).toBeInTheDocument();
  });

  it("refuses an empty comment", async () => {
    const { user, onSubmit } = setup();
    await user.click(screen.getByRole("button", { name: "Comment" }));
    expect(screen.getByText("Write something first.")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("sends with Cmd or Ctrl + Enter, as Vibe by default, and clears", async () => {
    const { user, onSubmit, textbox } = setup();
    await user.type(textbox!, "The vocal chop drowns here");
    await user.keyboard("{Control>}{Enter}{/Control}");
    expect(onSubmit).toHaveBeenCalledWith({
      body: "The vocal chop drowns here",
      category: "vibe",
      timeMs: 102_000,
    });
    expect(textbox).toHaveValue("");
  });

  it("sends the picked category, and no time for the whole track", async () => {
    const { user, onSubmit, textbox } = setup();
    await user.click(screen.getByRole("radio", { name: "Mix" }));
    await user.click(
      screen.getByRole("checkbox", { name: "Comment on the whole track" }),
    );
    await user.type(textbox!, "Low end is muddy overall");
    await user.click(screen.getByRole("button", { name: "Comment" }));
    expect(onSubmit).toHaveBeenCalledWith({
      body: "Low end is muddy overall",
      category: "mix",
      timeMs: null,
    });
  });

  it("lets you change the time, and rejects times outside the track", async () => {
    const { user, onSubmit, textbox } = setup();
    await user.click(screen.getByRole("button", { name: /at 1:42/ }));
    const time = screen.getByRole("textbox", { name: "at" });
    await user.clear(time);
    await user.type(time, "9:99{Enter}");
    expect(screen.getByText(/Use m:ss/)).toBeInTheDocument();
    await user.clear(time);
    await user.type(time, "0:45{Enter}");
    await user.type(textbox!, "Nice entry");
    await user.click(screen.getByRole("button", { name: "Comment" }));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ timeMs: 45_000 }),
    );
  });

  it("keeps the text when posting fails", async () => {
    const { user, textbox } = setup({}, { ok: false, error: "failed" });
    await user.type(textbox!, "Hats are too loud");
    await user.click(screen.getByRole("button", { name: "Comment" }));
    expect(
      await screen.findByText(
        "Your comment didn't go through. Your text is still here. Try again.",
      ),
    ).toBeInTheDocument();
    expect(textbox).toHaveValue("Hats are too loud");
  });

  it("explains the rate limit", async () => {
    const { user, textbox } = setup(
      { commentsPerHour: 20 },
      { ok: false, error: "rate_limited" },
    );
    await user.type(textbox!, "One more");
    await user.click(screen.getByRole("button", { name: "Comment" }));
    expect(
      await screen.findByText(/You can post 20 comments an hour/),
    ).toBeInTheDocument();
  });

  it("refuses text over the limit", async () => {
    const { user, onSubmit, textbox } = setup({ maxLength: 10 });
    await user.type(textbox!, "This is far too long");
    await user.click(screen.getByRole("button", { name: "Comment" }));
    expect(
      screen.getByText("Comments can be up to 10 characters."),
    ).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("asks signed-out listeners to sign in", async () => {
    const onSignIn = vi.fn();
    const { user, textbox } = setup({ signedIn: false, onSignIn });
    expect(textbox).toBeNull();
    await user.click(
      screen.getByRole("button", { name: "Sign in to comment" }),
    );
    expect(onSignIn).toHaveBeenCalled();
  });
});
