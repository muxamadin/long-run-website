import { defineJob } from '../define-job'
import { dimensionsWithin } from '../groups/media'
import { z } from '../z'
import { intRange, oneOf, promptMax, promptRequired } from './checks'
import { mediaRefSchema, toWireMediaData } from './image-helpers'
import {
  getNanoBananaDimensions,
  NANO_BANANA_ASPECT_RATIO_VALUES,
  NanoBananaAspectRatio,
  type NanoBananaResolution,
  resolveNanoBananaRatio,
} from './nano-banana-shared'

export { NanoBananaAspectRatio as NanoBanana2AspectRatio }

const MAX_PROMPT_CHARACTERS = 15_000

const CREDITS_PER_IMAGE: Record<NanoBananaResolution, number> = {
  '1k': 2,
  '2k': 2,
  '4k': 4,
}

const presetsSchema = z.object({
  outfitCollagePresetId: z.optional(z.string()),
})

/**
 * Nano Banana Pro. Grounded in fnf-web's `job-image-nano-banana-2` module.
 * The app submits `/jobs/nano-banana-2`, with `use_seedream_bonus` lifted to
 * the request body by the adapter and `input_images` kept as a bare array.
 */
export const nanoBanana2 = defineJob({
  jobSetType: 'nano_banana_2',
  outputType: 'image',
  params: {
    prompt: true,
    media: {
      field: 'input_images',
      format: 'unwrapped',
      roles: ['image'],
      counts: { image: { max: 14 } },
      rules: [dimensionsWithin(['image'], { minSide: 128 })],
    },
    settings: {
      aspectRatio: z.wire('aspect_ratio', z._default(z.aspectRatio(NANO_BANANA_ASPECT_RATIO_VALUES), '3:4')),
      resolution: z._default(z.enum(['1k', '2k', '4k']), '1k'),
      batchSize: z.wire('batch_size', z._default(z.number(), 1)),
      useUnlim: z.wire('use_unlim', z._default(z.boolean(), false)),
      useSeedreamBonus: z.wire('use_seedream_bonus', z.optional(z.boolean())),
      isStoryboard: z.wire('is_storyboard', z._default(z.boolean(), false)),
      isZoomControl: z.wire('is_zoom_control', z._default(z.boolean(), false)),
      presets: z.optional(presetsSchema),
      applicationSlug: z.wire('application_slug', z.optional(z.string())),
      isDraw: z.wire('is_draw', z.optional(z.boolean())),
      isUgc: z.wire('is_ugc', z.optional(z.boolean())),
      isProductPlacement: z.wire('is_product_placement', z.optional(z.boolean())),
      isPhotoSet: z.wire('is_photo_set', z.optional(z.boolean())),
      isPainting: z.wire('is_painting', z.optional(z.boolean())),
      paintImage: z.wire('paint_image', z.optional(mediaRefSchema)),
      fashionFactoryId: z.wire('fashion_factory_id', z.optional(z.string())),
      isBatch: z.wire('_isBatch', z.optional(z.boolean())),
    },
  },
  credits: ({ settings }) => (settings.batchSize ?? 1) * CREDITS_PER_IMAGE[settings.resolution ?? '1k'],
  validate: ({ prompt, settings }) => [
    ...promptRequired(prompt, 2),
    ...promptMax(prompt, MAX_PROMPT_CHARACTERS, { inclusive: true }),
    ...intRange('batchSize', settings.batchSize, 1, 4),
    ...oneOf('aspectRatio', settings.aspectRatio, NANO_BANANA_ASPECT_RATIO_VALUES),
  ],
  finalize: (wire, input) => {
    const ratio = resolveNanoBananaRatio(input, ['image'], wire.aspect_ratio as never)
    const { width, height } = getNanoBananaDimensions((wire.resolution ?? '1k') as NanoBananaResolution, ratio)
    const presets = wire.presets as { outfitCollagePresetId?: string } | undefined
    const paintImage = toWireMediaData(wire.paint_image)
    const rest = { ...wire }
    delete rest.presets
    delete rest.paint_image

    return {
      ...rest,
      aspect_ratio: ratio,
      width,
      height,
      input_images: wire.input_images ?? [],
      ...(presets?.outfitCollagePresetId
        ? { presets: { outfit_collage_preset_id: presets.outfitCollagePresetId } }
        : {}),
      ...(paintImage ? { paint_image: paintImage } : {}),
    }
  },
})
