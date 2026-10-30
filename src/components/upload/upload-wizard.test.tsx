/** @vitest-environment jsdom */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { genres } from "@/mocks/genres";

import {
  uploadReducer,
  initialUploadState,
  validateFile,
} from "./upload-state";
import { type UploadPipeline, UploadWizard } from "./upload-wizard";

const MB = 1024 * 1024;

function audioFile(name: string, size = 4 * MB, type = "audio/wav") {
  const file = new File(["x"], name, { type });
  Object.defineProperty(file, "size", { value: size });
  return file;
}

function fakePipeline(overrides: Partial<UploadPipeline> = {}): UploadPipeline {
  return {
    analyze: vi.fn(async () => ({
      ok: true as const,
      peaks: [0.2, 0.5, 0.9],
      durationMs: 214_000,
    })),
    encode: vi.fn(async () => true),
    publish: vi.fn(async () => ({ ok: true as const, slug: "abc-night-bus" })),
    ...overrides,
  };
}

function setup(
  pipeline = fakePipeline(),
  props: Partial<React.ComponentProps<typeof UploadWizard>> = {},
) {
  // The input only accepts audio, but people drop anything, so skip the accept filter.
  const user = userEvent.setup({ applyAccept: false });
  render(<UploadWizard pipeline={pipeline} genres={genres} {...props} />);
  const input = screen.getByLabelText(/Drop your file here/);
  return { user, input, pipeline };
}

async function toPublishStep(
  user: ReturnType<typeof userEvent.setup>,
  input: HTMLElement,
) {
  await user.upload(input, audioFile("night_bus_demo4.wav"));
  await screen.findByRole("heading", { name: "Tell people about it" });
  await user.selectOptions(screen.getByLabelText("Genre"), "house");
  await user.click(screen.getByRole("button", { name: "Continue" }));
  await screen.findByRole("heading", { name: "Ready to publish" });
}

describe("validateFile", () => {
  it("accepts the four formats and rejects the rest", () => {
    expect(validateFile(audioFile("a.flac", MB, ""))).toBeNull();
    expect(validateFile(audioFile("a.aiff", MB, ""))).toBeNull();
    expect(validateFile(audioFile("a.png", MB, "image/png"))).toBe(
      "wrong_format",
    );
  });

  it("enforces 150 MB, and 50 MB on phones", () => {
    expect(validateFile(audioFile("a.wav", 151 * MB))).toBe("too_large");
    expect(validateFile(audioFile("a.wav", 60 * MB), { isMobile: true })).toBe(
      "mobile_too_large",
    );
    expect(validateFile(audioFile("a.wav", 60 * MB))).toBeNull();
  });
});

describe("uploadReducer", () => {
  it("prefills the title from the file name once the waveform is ready", () => {
    const accepted = uploadReducer(initialUploadState, {
      type: "file_accepted",
      file: { name: "night_bus-demo4.wav", size: 1, isMp3: false },
    });
    const analysed = uploadReducer(accepted, {
      type: "analyzed",
      peaks: [],
      durationMs: 1000,
    });
    expect(analysed.step).toBe("details");
    expect(analysed.stage).toBe("encoding");
    expect(analysed.details.title).toBe("night bus demo4");
  });
});

describe("UploadWizard states", () => {
  it("starts on the file step", () => {
    setup();
    expect(
      screen.getByRole("heading", { name: "Upload a track" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("mp3, wav, aiff or flac. Up to 15 minutes and 150 MB."),
    ).toBeInTheDocument();
  });

  it("rejects the wrong format", async () => {
    const { user, input, pipeline } = setup();
    await user.upload(input, audioFile("cover.png", MB, "image/png"));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "We can't use that file. Try mp3, wav, aiff or flac.",
    );
    expect(pipeline.analyze).not.toHaveBeenCalled();
  });

  it("rejects files over 150 MB", async () => {
    const { user, input } = setup();
    await user.upload(input, audioFile("big.wav", 200 * MB));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "That file is over 150 MB.",
    );
  });

  it("sends phones with big files to a computer", async () => {
    const { user, input } = setup(fakePipeline(), { isMobile: true });
    await user.upload(input, audioFile("big.wav", 80 * MB));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Upload from a computer for files over 50 MB.",
    );
  });

  it("explains a file it cannot decode", async () => {
    const pipeline = fakePipeline({
      analyze: vi.fn(async () => ({
        ok: false as const,
        error: "decode_failed" as const,
      })),
    });
    const { user, input } = setup(pipeline);
    await user.upload(input, audioFile("broken.wav"));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We couldn't read that file.",
    );
  });

  it("rejects tracks over 15 minutes and says how long it is", async () => {
    const pipeline = fakePipeline({
      analyze: vi.fn(async () => ({
        ok: true as const,
        peaks: [],
        durationMs: 972_000,
      })),
    });
    const { user, input } = setup(pipeline);
    await user.upload(input, audioFile("long.wav"));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Tracks can be up to 15 minutes. This one is 16:12.",
    );
  });

  it("shows the processing stages while the browser works", async () => {
    let finish: () => void = () => {};
    const pipeline = fakePipeline({
      analyze: vi.fn<UploadPipeline["analyze"]>((_file, onProgress) => {
        onProgress("decoding", 0.5);
        return new Promise((resolve) => {
          finish = () => resolve({ ok: true, peaks: [0.5], durationMs: 1000 });
        });
      }),
    });
    const { user, input } = setup(pipeline);
    await user.upload(input, audioFile("night.wav"));
    expect(screen.getByText("Reading your file…")).toBeInTheDocument();
    expect(
      screen.getByText("Fill in the details while you wait."),
    ).toBeInTheDocument();
    finish();
    expect(
      await screen.findByRole("heading", { name: "Tell people about it" }),
    ).toBeInTheDocument();
  });

  it("asks for a title and genre before moving on", async () => {
    const { user, input } = setup();
    await user.upload(input, audioFile("night_bus.wav"));
    await screen.findByRole("heading", { name: "Tell people about it" });
    expect(screen.getByLabelText("Title")).toHaveValue("night bus");
    await user.clear(screen.getByLabelText("Title"));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByText("Give your track a title.")).toBeInTheDocument();
    expect(screen.getByText("Pick a genre.")).toBeInTheDocument();
  });

  it("needs the own-work box before publishing, then goes live", async () => {
    const { user, input, pipeline } = setup();
    await toPublishStep(user, input);
    await user.click(screen.getByRole("button", { name: "Publish" }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Please confirm this is your own work, not generated by AI.",
    );
    expect(pipeline.publish).not.toHaveBeenCalled();

    await user.click(
      screen.getByRole("checkbox", {
        name: "This is my own work, not generated by AI.",
      }),
    );
    await user.click(screen.getByRole("button", { name: "Publish" }));
    expect(
      await screen.findByRole("heading", { name: "Done. Your track is live." }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View track" })).toHaveAttribute(
      "href",
      "/t/abc-night-bus",
    );
  });

  it("keeps the details when the upload is interrupted", async () => {
    const pipeline = fakePipeline({
      publish: vi.fn(async () => ({
        ok: false as const,
        error: "upload_interrupted" as const,
      })),
    });
    const { user, input } = setup(pipeline);
    await toPublishStep(user, input);
    await user.click(screen.getByRole("checkbox", { name: /own work/ }));
    await user.click(screen.getByRole("button", { name: "Publish" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The upload stopped.",
    );
    expect(screen.getByText("night bus demo4")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeEnabled();
  });

  it("explains the daily upload limit", async () => {
    const pipeline = fakePipeline({
      publish: vi.fn(async () => ({
        ok: false as const,
        error: "rate_limited" as const,
        rateLimit: { limit: 2, retry: "tomorrow" },
      })),
    });
    const { user, input } = setup(pipeline);
    await toPublishStep(user, input);
    await user.click(screen.getByRole("checkbox", { name: /own work/ }));
    await user.click(screen.getByRole("button", { name: "Publish" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "You've hit today's upload limit (2 per day for now). Try again tomorrow.",
    );
  });

  it("reports a failed encode instead of publishing", async () => {
    const pipeline = fakePipeline({ encode: vi.fn(async () => false) });
    const { user, input } = setup(pipeline);
    await user.upload(input, audioFile("night.wav"));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Something went wrong while preparing the stream. Try again, or upload an mp3.",
    );
  });

  it("skips encoding for mp3", async () => {
    const { user, input, pipeline } = setup();
    await user.upload(input, audioFile("night.mp3", 4 * MB, "audio/mpeg"));
    await screen.findByRole("heading", { name: "Tell people about it" });
    expect(pipeline.encode).not.toHaveBeenCalled();
  });
});
