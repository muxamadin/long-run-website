import { useEffect, useRef } from "react";
import { useReducedMotion } from "motion/react";

// Fades the video's own edges to transparent so its studio backdrop
// dissolves into the page background instead of showing a hard rectangle.
const VIDEO_MASK =
  "radial-gradient(ellipse 72% 68% at 50% 45%, black 45%, transparent 100%)";

// Source clips run at native speed, which reads as rushed for a slow,
// deliberate product reveal. Played back slower here for a calmer,
// more cinematic feel instead of re-exporting the source files.
const PLAYBACK_RATE = 0.4;
// How close to the clip's end (in its own media seconds, unaffected by
// playbackRate) to start dipping opacity, masking the hard loop-restart cut.
const LOOP_FADE_WINDOW = 0.35;

export function MaskedVideoBackground({ src, poster }: { src: string; poster: string }) {
  const reduce = useReducedMotion();
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.playbackRate = PLAYBACK_RATE;
    if (reduce) {
      video.pause();
      return;
    }
    video.play().catch(() => {});

    function handleTimeUpdate() {
      if (!video || !video.duration) return;
      const timeLeft = video.duration - video.currentTime;
      const nearEnd = timeLeft < LOOP_FADE_WINDOW;
      const justLooped = video.currentTime < LOOP_FADE_WINDOW;
      video.style.opacity = nearEnd || justLooped ? "0.55" : "1";
    }
    video.addEventListener("timeupdate", handleTimeUpdate);
    return () => video.removeEventListener("timeupdate", handleTimeUpdate);
  }, [reduce]);

  return (
    <>
      <div
        className="absolute inset-0"
        style={{ maskImage: VIDEO_MASK, WebkitMaskImage: VIDEO_MASK }}
      >
        <video
          ref={videoRef}
          className="h-full w-full object-cover transition-opacity duration-300 ease-in-out"
          src={src}
          poster={poster}
          muted
          loop
          playsInline
          preload="metadata"
          onLoadedMetadata={(e) => {
            e.currentTarget.playbackRate = PLAYBACK_RATE;
          }}
        />
      </div>
      <div className="absolute inset-0 bg-lr-bg/55" />
      <div className="absolute inset-0 bg-gradient-to-b from-lr-bg/70 via-transparent to-lr-bg/80" />
    </>
  );
}
