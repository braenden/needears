import { downsample } from "@/lib/audio/waveform";
import { cn } from "@/lib/utils";

/**
 * Static waveform for cards and OG images: plain SVG, no JavaScript, no canvas.
 * Decorative, so the card around it carries the text.
 */
export function MiniWaveform({
  peaks,
  bars = 72,
  progress = 0,
  className,
}: {
  peaks: number[];
  bars?: number;
  /** 0 to 1. Bars before this point use the progress colour. */
  progress?: number;
  className?: string;
}) {
  const values = downsample(peaks, bars);
  const step = 4;
  const height = 32;
  return (
    <svg
      viewBox={`0 0 ${bars * step} ${height}`}
      preserveAspectRatio="none"
      aria-hidden="true"
      className={cn("h-8 w-full", className)}
    >
      {values.map((v, i) => {
        // Rounded so server and client render the same numbers.
        const h = Math.round(Math.max(2, v * height) * 10) / 10;
        return (
          <rect
            key={i}
            x={i * step}
            y={(height - h) / 2}
            width={2.5}
            height={h}
            rx={1}
            className={i / bars < progress ? "fill-wave-progress" : "fill-wave"}
          />
        );
      })}
    </svg>
  );
}
