/** @vitest-environment jsdom */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { CommentMarkers } from "@/components/player/comment-markers";
import { versionedComments } from "@/mocks/versions";
import type { TrackVersion } from "@/types/view";

import { NewVersionDialog, type VersionPipeline } from "./new-version-dialog";
import { abPartner, VersionPicker } from "./version-picker";

const version = (
  id: string,
  no: number,
  note: string | null = null,
): TrackVersion => ({
  id,
  version_no: no,
  note,
  duration_ms: 200_000,
  created_at: "2026-10-30T12:00:00Z",
});
const versions = [
  version("v1", 1),
  version("v2", 2, "Less reverb"),
  version("v3", 3, "New ending"),
];

describe("abPartner", () => {
  it("goes back to the version picked before", () => {
    expect(abPartner(versions, "v3", "v1")).toBe("v1");
  });

  it("falls back to the version before, or after for v1", () => {
    expect(abPartner(versions, "v3")).toBe("v2");
    expect(abPartner(versions, "v1")).toBe("v2");
    expect(abPartner([versions[0]!], "v1")).toBeNull();
  });
});

describe("VersionPicker", () => {
  it("hides itself for a track with one version", () => {
    const { container } = render(
      <VersionPicker
        versions={[versions[0]!]}
        currentId="v1"
        onSelect={vi.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows what changed and flips with A/B", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <VersionPicker versions={versions} currentId="v3" onSelect={onSelect} />,
    );
    expect(screen.getByRole("radio", { name: /v3/ })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByText("New ending")).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", {
        name: /A\/B.*switch to.*v2.*at the same second/,
      }),
    );
    expect(onSelect).toHaveBeenCalledWith("v2");
  });

  it("moves between versions with the arrow keys", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <VersionPicker versions={versions} currentId="v3" onSelect={onSelect} />,
    );
    screen.getByRole("radio", { name: /v3/ }).focus();
    await user.keyboard("{ArrowLeft}");
    expect(onSelect).toHaveBeenCalledWith("v2");
    await user.keyboard("{ArrowRight}");
    expect(onSelect).toHaveBeenLastCalledWith("v1");
  });
});

describe("CommentMarkers with versions", () => {
  it("says which version a marker from another version belongs to", () => {
    render(
      <CommentMarkers
        comments={versionedComments}
        durationMs={222_000}
        currentVersionId="v3"
        versionNumbers={{ v1: 1, v2: 2, v3: 3 }}
        onSelect={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Comment by Nora at 0:31, on v1" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Comment by Mia at 2:51" }),
    ).toBeInTheDocument();
  });
});

describe("NewVersionDialog", () => {
  const pipeline = (): VersionPipeline => ({
    analyze: vi.fn(async () => ({
      ok: true as const,
      peaks: [0.4, 0.8],
      durationMs: 200_000,
    })),
    encode: vi.fn(async () => true),
    publish: vi.fn(async ({ note }) => ({
      ok: true as const,
      version: version("v4", 4, note),
    })),
  });

  it("is turned off at ten versions", () => {
    render(
      <NewVersionDialog
        trackTitle="Night Bus"
        versionCount={10}
        pipeline={pipeline()}
        onPublished={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Upload a new version" }),
    ).toBeDisabled();
    expect(
      screen.getByText("A track can have up to 10 versions."),
    ).toBeInTheDocument();
  });

  it("uploads a file, takes a note and publishes the next version", async () => {
    const user = userEvent.setup({ applyAccept: false });
    const p = pipeline();
    const onPublished = vi.fn();
    render(
      <NewVersionDialog
        trackTitle="Night Bus"
        versionCount={3}
        pipeline={p}
        onPublished={onPublished}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: "Upload a new version" }),
    );
    expect(
      screen.getByRole("heading", { name: "Upload v4" }),
    ).toBeInTheDocument();
    await user.upload(
      screen.getByLabelText(/Drop your file here/),
      new File(["x"], "v4.wav", { type: "audio/wav" }),
    );
    await user.type(
      await screen.findByRole("textbox", { name: /What changed/ }),
      "Brighter hats",
    );
    await user.click(screen.getByRole("button", { name: "Publish v4" }));
    expect(
      await screen.findByRole("heading", { name: "v4 is live" }),
    ).toBeInTheDocument();
    expect(p.publish).toHaveBeenCalledWith(
      expect.objectContaining({ note: "Brighter hats", durationMs: 200_000 }),
      expect.any(Function),
    );
    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(onPublished).toHaveBeenCalledWith(
      expect.objectContaining({ version_no: 4 }),
    );
  });

  it("rejects a file that is not audio", async () => {
    const user = userEvent.setup({ applyAccept: false });
    render(
      <NewVersionDialog
        trackTitle="Night Bus"
        versionCount={1}
        pipeline={pipeline()}
        onPublished={vi.fn()}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: "Upload a new version" }),
    );
    await user.upload(
      screen.getByLabelText(/Drop your file here/),
      new File(["x"], "cover.png", { type: "image/png" }),
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "We can't use that file.",
    );
  });
});
