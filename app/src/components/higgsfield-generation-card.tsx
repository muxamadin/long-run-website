"use client";

import type { Generation, OutputType } from "@higgsfield/fnf/client";
import { Badge } from "@higgsfield/quanta/badge";
import { Button } from "@higgsfield/quanta/button";
import { ExternalLink, ImageIcon, RefreshCw, VideoIcon } from "lucide-react";
import {
  getGenerationCreatedLabel,
  getGenerationFailureLabel,
  getGenerationPrompt,
  getGenerationStatusLabel,
  selectGenerationMedia,
} from "@/lib/higgsfield-generation-results";
import { cn } from "@/lib/utils";

export interface HiggsfieldGenerationCardProps {
  generation: Generation;
  className?: string;
  onRefresh?: () => void;
}

export function HiggsfieldGenerationCard({ generation, className, onRefresh }: HiggsfieldGenerationCardProps) {
  const media = selectGenerationMedia(generation);
  const prompt = getGenerationPrompt(generation);
  const created = getGenerationCreatedLabel(generation);
  const failure = getGenerationFailureLabel(generation);
  const status = getGenerationStatusLabel(generation);
  const statusVariant = media.phase === "completed" ? "lime" : media.phase === "failed" ? "pink" : "blue";
  const rawUrl = media.kind === "image" || media.kind === "video" ? media.rawUrl : undefined;

  return (
    <article
      className={cn(
        "overflow-hidden rounded-lg border border-q-border-default bg-q-background-secondary text-q-text-primary shadow-sm",
        className,
      )}
    >
      <div className="relative aspect-square bg-q-background-tertiary">
        {media.kind === "image" ? (
          <img
            src={media.previewUrl}
            alt={prompt ? `Generated result for: ${prompt}` : `Generated ${generation.model} result`}
            loading="lazy"
            className="h-full w-full object-cover"
          />
        ) : media.kind === "video" ? (
          <video
            src={media.rawUrl}
            poster={media.posterUrl}
            controls
            muted
            playsInline
            preload="metadata"
            className="h-full w-full object-cover"
          />
        ) : (
          <GenerationEmptyState generation={generation} reason={media.reason} outputType={media.outputType} />
        )}

        <div className="absolute left-3 top-3">
          <Badge variant={statusVariant} size="xs" text={status} />
        </div>
      </div>

      <div className="space-y-3 p-4">
        <div className="space-y-1">
          <p className="line-clamp-2 text-q-body-md-medium text-q-text-primary">
            {prompt ?? "No prompt stored"}
          </p>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-q-body-sm-regular text-q-text-tertiary">
            <span>{generation.model}</span>
            {created ? <span>{created}</span> : null}
            {generation.jobSetId ? <span>{generation.jobSetId.slice(0, 8)}...</span> : null}
          </div>
        </div>

        {failure ? (
          <p className="rounded-md border border-q-border-error bg-q-state-error-bg px-3 py-2 text-q-body-sm-medium text-q-state-error-fg">
            {failure}
          </p>
        ) : null}

        <div className="flex items-center gap-2">
          {rawUrl ? (
            <Button
              as="a"
              href={rawUrl}
              target="_blank"
              rel="noreferrer"
              variant="secondary"
              size="xs"
              end={<ExternalLink size={14} aria-hidden="true" />}
            >
              Open
            </Button>
          ) : null}
          {onRefresh ? (
            <Button
              variant="ghost"
              size="xs"
              start={<RefreshCw size={14} aria-hidden="true" />}
              onClick={onRefresh}
            >
              Refresh
            </Button>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function GenerationEmptyState({ generation, reason, outputType }: {
  generation: Generation;
  reason: "pending" | "preview_unavailable" | "failed";
  // Use the SDK's OutputType (not a hardcoded literal) so this stays valid as fnf
  // grows the union (e.g. "audio") — media.outputType is typed OutputType, and a
  // narrower literal here breaks with TS2322 the moment a new kind is added.
  outputType: OutputType;
}) {
  // video -> VideoIcon; everything else (image, and any future kind like audio)
  // falls back to the image glyph in this empty/placeholder state.
  const Icon = outputType === "video" ? VideoIcon : ImageIcon;
  const label = reason === "preview_unavailable"
    ? "Preview unavailable"
    : reason === "failed"
      ? getGenerationFailureLabel(generation) ?? "Generation failed"
      : getGenerationStatusLabel(generation);

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-3 px-4 text-center text-q-text-tertiary">
      <div className={cn(
        "flex h-12 w-12 items-center justify-center rounded-full bg-q-overlay-hover",
        reason === "pending" && "animate-pulse",
      )}
      >
        <Icon size={22} aria-hidden="true" />
      </div>
      <p className="text-q-body-md-medium text-q-text-secondary">{label}</p>
      {reason === "preview_unavailable" ? (
        <p className="max-w-52 text-q-body-sm-regular text-q-text-tertiary">
          The job is completed but did not return a preview URL yet. Refresh or open the job again.
        </p>
      ) : null}
    </div>
  );
}
