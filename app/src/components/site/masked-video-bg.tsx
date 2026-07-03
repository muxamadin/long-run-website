import { useEffect, useRef } from "react";
import { useReducedMotion } from "motion/react";

// Fades the video's own edges to transparent so its studio backdrop
// dissolves into the page background instead of showing a hard rectangle.
const VIDEO_MASK =
  "radial-gradient(ellipse 72% 68% at 50% 45%, black 45%, transparent 100%)";

export function MaskedVideoBackground({ src, poster }: { src: string; poster: string }) {
  const reduce = useReducedMotion();
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (reduce) {
      videoRef.current?.pause();
    } else {
      videoRef.current?.play().catch(() => {});
    }
  }, [reduce]);

  return (
    <>
      <div
        className="absolute inset-0"
        style={{ maskImage: VIDEO_MASK, WebkitMaskImage: VIDEO_MASK }}
      >
        <video
          ref={videoRef}
          className="h-full w-full object-cover"
          src={src}
          poster={poster}
          muted
          loop
          playsInline
          preload="metadata"
        />
      </div>
      <div className="absolute inset-0 bg-lr-bg/55" />
      <div className="absolute inset-0 bg-gradient-to-b from-lr-bg/70 via-transparent to-lr-bg/80" />
    </>
  );
}
