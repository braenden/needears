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
async function exportAvatar(image: ImageBitmap, crop: Crop) {
  const canvas = document.createElement("canvas");
  canvas.width = AVATAR_SIZE;
  canvas.height = AVATAR_SIZE;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("no canvas");
  const { sx, sy, size } = sourceRect(crop, image.width, image.height);
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
  // The picked image, decoded straight from the file. Drawn on canvas only,
  // so nothing from the file ever ends up in an element's src.
  const [source, setSource] = useState<ImageBitmap | null>(null);

  useEffect(() => {
    return () => source?.close();
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
    createImageBitmap(file).then(setSource, () =>
      setError("We couldn't open that image. Try another one."),
    );
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
          image={source}
          onClose={() => setSource(null)}
          onSave={onSave}
        />
      ) : null}
    </div>
  );
}

/** Draws the cropped square of the image at a given size. */
function CropCanvas({
  image,
  crop,
  size,
  className,
}: {
  image: ImageBitmap;
  crop: Crop;
  size: number;
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(size * ratio);
    canvas.height = Math.round(size * ratio);
    const { sx, sy, size: side } = sourceRect(crop, image.width, image.height);
    context.imageSmoothingQuality = "high";
    context.drawImage(
      image,
      sx,
      sy,
      side,
      side,
      0,
      0,
      canvas.width,
      canvas.height,
    );
  }, [image, crop, size]);
  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      className={className}
      style={{ width: size, height: size }}
    />
  );
}

function CropDialog({
  image,
  onClose,
  onSave,
}: {
  image: ImageBitmap;
  onClose: () => void;
  onSave: (photo: Blob) => Promise<AvatarSaveResult>;
}) {
  const { width, height } = image;
  const drag = useRef<{
    pointer: number;
    startX: number;
    startY: number;
    crop: Crop;
  } | null>(null);
  const [crop, setCrop] = useState<Crop>(() => centred(width, height));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Always from the latest crop, so quick key repeats add up.
  const update = (change: (current: Crop) => Crop) =>
    setCrop((current) => clampCrop(change(current), width, height));

  // Zoom around the centre of the square, so the face stays put.
  function zoomBy(change: (zoom: number) => number) {
    update((current) => {
      const next = Math.min(MAX_ZOOM, Math.max(1, change(current.zoom)));
      const ratio = next / current.zoom;
      return {
        zoom: next,
        x: VIEW / 2 - (VIEW / 2 - current.x) * ratio,
        y: VIEW / 2 - (VIEW / 2 - current.y) * ratio,
      };
    });
  }

  async function save() {
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
              update(() => ({
                ...d.crop,
                x: d.crop.x + e.clientX - d.startX,
                y: d.crop.y + e.clientY - d.startY,
              }));
            }}
            onPointerUp={() => (drag.current = null)}
            onPointerCancel={() => (drag.current = null)}
            onWheel={(e) => {
              const delta = e.deltaY / 500;
              zoomBy((z) => z - delta);
            }}
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
                update((c) => ({ ...c, x: c.x + move[0], y: c.y + move[1] }));
              } else if (e.key === "+" || e.key === "=") {
                e.preventDefault();
                zoomBy((z) => z + 0.1);
              } else if (e.key === "-") {
                e.preventDefault();
                zoomBy((z) => z - 0.1);
              }
            }}
          >
            <CropCanvas
              image={image}
              crop={crop}
              size={VIEW}
              className="pointer-events-none absolute inset-0"
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
              onChange={(e) => {
                const value = Number(e.target.value);
                zoomBy(() => value);
              }}
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
                <CropCanvas image={image} crop={crop} size={size} />
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
