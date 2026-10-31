"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ImageUpIcon, Loader2Icon, Trash2Icon } from "lucide-react";

import { UserAvatar } from "@/components/common/user-avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Profile } from "@/types/view";

export const AVATAR_SIZE = 512;
export const AVATAR_MAX_BYTES = 512 * 1024;
const INPUT_MAX_BYTES = 15 * 1024 * 1024;
const ACCEPT = ["image/jpeg", "image/png", "image/webp", "image/gif"];
/** Crop square on screen, in CSS pixels. Fits a 375 px phone with dialog padding. */
const VIEW = 256;
const MAX_ZOOM = 3;

export type AvatarSaveResult = { ok: true } | { ok: false; error: string };

type Crop = { x: number; y: number; zoom: number };

/** The scale at which the image just covers the square. */
export function coverScale(width: number, height: number, view = VIEW) {
  return view / Math.min(width, height);
}

/** Keeps the image covering the whole square: no empty edges. */
export function clampCrop(
  crop: Crop,
  width: number,
  height: number,
  view = VIEW,
): Crop {
  const zoom = Math.min(MAX_ZOOM, Math.max(1, crop.zoom));
  const scale = coverScale(width, height, view) * zoom;
  const minX = view - width * scale;
  const minY = view - height * scale;
  return {
    zoom,
    x: Math.min(0, Math.max(minX, crop.x)),
    y: Math.min(0, Math.max(minY, crop.y)),
  };
}

/** The square of the source image that ends up in the avatar, in image pixels. */
export function sourceRect(
  crop: Crop,
  width: number,
  height: number,
  view = VIEW,
) {
  const scale = coverScale(width, height, view) * crop.zoom;
  return { sx: -crop.x / scale, sy: -crop.y / scale, size: view / scale };
}

function centred(width: number, height: number): Crop {
  const scale = coverScale(width, height);
  return {
    zoom: 1,
    x: (VIEW - width * scale) / 2,
    y: (VIEW - height * scale) / 2,
  };
}

/** Draws the crop at 512 px and keeps lowering quality until it fits 512 KB. */
async function exportAvatar(image: HTMLImageElement, crop: Crop) {
  const canvas = document.createElement("canvas");
  canvas.width = AVATAR_SIZE;
  canvas.height = AVATAR_SIZE;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("no canvas");
  const { sx, sy, size } = sourceRect(
    crop,
    image.naturalWidth,
    image.naturalHeight,
  );
  context.imageSmoothingQuality = "high";
  context.drawImage(image, sx, sy, size, size, 0, 0, AVATAR_SIZE, AVATAR_SIZE);

  const toBlob = (type: string, quality: number) =>
    new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, type, quality),
    );
  for (const quality of [0.9, 0.8, 0.7, 0.6]) {
    let blob = await toBlob("image/webp", quality);
    // Browsers without WebP encoding hand back a PNG; use JPEG there.
    if (!blob || blob.type !== "image/webp")
      blob = await toBlob("image/jpeg", quality);
    if (blob && blob.size <= AVATAR_MAX_BYTES) return blob;
  }
  throw new Error("too large");
}

/**
 * Profile photo: pick an image, crop it to a square in the browser, see how
 * it looks at avatar size, save a 512 px WebP (JPEG where WebP is missing).
 */
export function AvatarUpload({
  profile,
  hasUploadedPhoto = false,
  onSave,
  onRemove,
}: {
  profile: Pick<Profile, "display_name" | "handle" | "avatar_url">;
  /** Shows Remove photo. False when the picture comes from Google or is missing. */
  hasUploadedPhoto?: boolean;
  onSave: (photo: Blob) => Promise<AvatarSaveResult>;
  onRemove?: () => void;
}) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<{
    url: string;
    width: number;
    height: number;
  } | null>(null);

  useEffect(() => {
    return () => {
      if (source) URL.revokeObjectURL(source.url);
    };
  }, [source]);

  function pick(file: File) {
    if (!ACCEPT.includes(file.type)) {
      setError("We can't use that file. Try a JPEG, PNG or WebP image.");
      return;
    }
    if (file.size > INPUT_MAX_BYTES) {
      setError("That image is over 15 MB. Try a smaller one.");
      return;
    }
    setError(null);
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () =>
      setSource({
        url,
        width: image.naturalWidth,
        height: image.naturalHeight,
      });
    image.onerror = () => {
      URL.revokeObjectURL(url);
      setError("We couldn't open that image. Try another one.");
    };
    image.src = url;
  }

  return (
    <div className="flex flex-wrap items-center gap-4">
      <UserAvatar profile={profile} size="xl" />
      <div className="grid gap-2">
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => inputRef.current?.click()}
          >
            <ImageUpIcon />{" "}
            {hasUploadedPhoto ? "Change photo" : "Upload a photo"}
          </Button>
          {hasUploadedPhoto && onRemove ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={onRemove}
              className="text-muted-foreground"
            >
              <Trash2Icon /> Remove photo
            </Button>
          ) : null}
        </div>
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          JPEG, PNG or WebP. You can crop it next.
        </p>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT.join(",")}
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) pick(file);
            e.target.value = "";
          }}
        />
      </div>
      {source ? (
        <CropDialog
          source={source}
          onClose={() => setSource(null)}
          onSave={onSave}
        />
      ) : null}
    </div>
  );
}

function CropDialog({
  source,
  onClose,
  onSave,
}: {
  source: { url: string; width: number; height: number };
  onClose: () => void;
  onSave: (photo: Blob) => Promise<AvatarSaveResult>;
}) {
  const { width, height } = source;
  const imageRef = useRef<HTMLImageElement>(null);
  const drag = useRef<{
    pointer: number;
    startX: number;
    startY: number;
    crop: Crop;
  } | null>(null);
  const [crop, setCrop] = useState<Crop>(() => centred(width, height));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = (next: Crop) => setCrop(clampCrop(next, width, height));
  const scale = coverScale(width, height) * crop.zoom;

  // Zoom around the centre of the square, so the face stays put.
  function zoomTo(zoom: number) {
    const next = Math.min(MAX_ZOOM, Math.max(1, zoom));
    const ratio = next / crop.zoom;
    update({
      zoom: next,
      x: VIEW / 2 - (VIEW / 2 - crop.x) * ratio,
      y: VIEW / 2 - (VIEW / 2 - crop.y) * ratio,
    });
  }

  async function save() {
    const image = imageRef.current;
    if (!image) return;
    setSaving(true);
    setError(null);
    try {
      const blob = await exportAvatar(image, crop);
      const result = await onSave(blob);
      if (result.ok) {
        onClose();
        return;
      }
      setError(result.error);
    } catch {
      setError("We couldn't prepare that image. Try another one.");
    }
    setSaving(false);
  }

  const picture = (size: number) => {
    const factor = size / VIEW;
    return (
      // eslint-disable-next-line @next/next/no-img-element -- a local object URL, not something next/image can optimise
      <img
        src={source.url}
        alt=""
        draggable={false}
        className="pointer-events-none absolute top-0 left-0 max-w-none select-none"
        style={{
          width: width * scale * factor,
          height: height * scale * factor,
          transform: `translate(${crop.x * factor}px, ${crop.y * factor}px)`,
        }}
      />
    );
  };

  return (
    <Dialog open onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Crop your photo</DialogTitle>
          <DialogDescription>
            Drag to move it and zoom to fit. People see it as a circle.
          </DialogDescription>
        </DialogHeader>

        <div className="grid justify-items-center gap-4">
          <div
            role="group"
            aria-label="Photo position. Arrow keys move it, plus and minus zoom."
            tabIndex={0}
            className="relative cursor-grab touch-none overflow-hidden rounded-md bg-muted outline-none select-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
            style={{ width: VIEW, height: VIEW }}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              drag.current = {
                pointer: e.pointerId,
                startX: e.clientX,
                startY: e.clientY,
                crop,
              };
            }}
            onPointerMove={(e) => {
              const d = drag.current;
              if (!d || d.pointer !== e.pointerId) return;
              update({
                ...d.crop,
                x: d.crop.x + e.clientX - d.startX,
                y: d.crop.y + e.clientY - d.startY,
              });
            }}
            onPointerUp={() => (drag.current = null)}
            onPointerCancel={() => (drag.current = null)}
            onWheel={(e) => zoomTo(crop.zoom - e.deltaY / 500)}
            onKeyDown={(e) => {
              const step = e.shiftKey ? 40 : 10;
              const moves: Record<string, [number, number]> = {
                ArrowLeft: [step, 0],
                ArrowRight: [-step, 0],
                ArrowUp: [0, step],
                ArrowDown: [0, -step],
              };
              const move = moves[e.key];
              if (move) {
                e.preventDefault();
                update({ ...crop, x: crop.x + move[0], y: crop.y + move[1] });
              } else if (e.key === "+" || e.key === "=") {
                e.preventDefault();
                zoomTo(crop.zoom + 0.1);
              } else if (e.key === "-") {
                e.preventDefault();
                zoomTo(crop.zoom - 0.1);
              }
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- a local object URL */}
            <img
              ref={imageRef}
              src={source.url}
              alt=""
              draggable={false}
              className="pointer-events-none absolute top-0 left-0 max-w-none select-none"
              style={{
                width: width * scale,
                height: height * scale,
                transform: `translate(${crop.x}px, ${crop.y}px)`,
              }}
            />
            {/* Darkens what falls outside the circle people will see. */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 rounded-full shadow-[0_0_0_999px_rgb(0_0_0/0.45)] ring-1 ring-white/60"
            />
          </div>

          <label className="flex w-full max-w-64 items-center gap-3 text-sm text-muted-foreground">
            Zoom
            <input
              type="range"
              min={1}
              max={MAX_ZOOM}
              step={0.01}
              value={crop.zoom}
              onChange={(e) => zoomTo(Number(e.target.value))}
              className="flex-1 accent-(--primary)"
            />
          </label>

          <div
            className="flex items-center gap-4"
            aria-label="Preview"
            role="group"
          >
            {[64, 32].map((size) => (
              <div
                key={size}
                className="relative overflow-hidden rounded-full bg-muted ring-1 ring-border"
                style={{ width: size, height: size }}
              >
                {picture(size)}
              </div>
            ))}
            <span className="text-xs text-muted-foreground">
              How it looks next to comments
            </span>
          </div>
        </div>

        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost" disabled={saving}>
              Cancel
            </Button>
          </DialogClose>
          <Button onClick={() => void save()} disabled={saving}>
            {saving ? (
              <Loader2Icon className="motion-safe:animate-spin" />
            ) : null}
            Save photo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
