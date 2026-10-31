/** @vitest-environment jsdom */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { genres } from "@/mocks/genres";
import { nightBus } from "@/mocks/tracks";

import { detailsOf, EditTrackDialog } from "./edit-track-dialog";

function setup(onSave = vi.fn().mockResolvedValue({ ok: true })) {
  const onOpenChange = vi.fn();
  render(
    <EditTrackDialog
      track={nightBus}
      genres={genres}
      open
      onOpenChange={onOpenChange}
      onSave={onSave}
    />,
  );
  return { onSave, onOpenChange, user: userEvent.setup() };
}

describe("EditTrackDialog", () => {
  it("starts from the track's current details", () => {
    setup();
    expect(screen.getByLabelText("Title")).toHaveValue(nightBus.title);
    expect(screen.getByLabelText("Genre")).toHaveValue(nightBus.genre.slug);
    expect(screen.getByLabelText(/Tags/)).toHaveValue("deep house, vocal chop");
  });

  it("saves the changes and closes", async () => {
    const { onSave, onOpenChange, user } = setup();
    const title = screen.getByLabelText("Title");
    await user.clear(title);
    await user.type(title, "night bus v2");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(onSave).toHaveBeenCalledWith({
      ...detailsOf(nightBus),
      title: "night bus v2",
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("needs a title", async () => {
    const { onSave, user } = setup();
    await user.clear(screen.getByLabelText("Title"));
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(screen.getByText("Give your track a title.")).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("stays open with a message when saving fails", async () => {
    const { onOpenChange, user } = setup(
      vi.fn().mockResolvedValue({ ok: false }),
    );
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Couldn't save your changes.",
    );
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});
