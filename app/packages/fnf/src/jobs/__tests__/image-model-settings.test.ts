import type { JobEntry } from '../../define-job'
import type { GenerationInput, MediaRef } from '../../types'
import { describe, expect, it } from 'vitest'
import { createMemoryBackend } from '../../adapters/memory-backend'
import { createJobClient } from '../../client'
import { buildWireParams, parseGeneration } from '../../spec'
import { gptImage2, imagegen2_0 } from '../gpt-image-2'
import { nanoBanana2 } from '../nano-banana-2'
import { nanoBananaFlash } from '../nano-banana-flash'
import { recraftV41Image } from '../recraft-v4-1'
import { seedreamV4_5 } from '../seedream-v4-5'
import {
  DEFAULT_SOUL_CINEMA_OLZHAS_STYLE_ID,
  DEFAULT_SOUL_CINEMA_STYLE_ID,
  DEFAULT_SOUL_V2_STYLE_ID,
  soulCinemaImage,
  soulV2Image,
} from '../soul-v2'

function ref(id: string, meta?: MediaRef['meta']): MediaRef {
  return { id, type: 'media_input', url: `https://cdn/${id}.png`, ...(meta ? { meta } : {}) }
}

function issuesOf(fn: () => unknown): string[] {
  try {
    fn()
    return []
  }
  catch (err) {
    const issues = (err as { data?: { issues?: Array<{ msg: string }> } }).data?.issues ?? []
    return issues.map(i => i.msg)
  }
}

function expectIssues(input: GenerationInput, entry: JobEntry, expected: string[]) {
  const issues = issuesOf(() => buildWireParams(input, entry))
  for (const issue of expected) {
    expect(
      issues.some(msg => msg.toLowerCase().includes(issue.toLowerCase())),
      `${issue} in ${issues.join('; ')}`,
    ).toBe(true)
  }
}

const prompt = { instruction: 'make a polished product image' }

describe('GPT Image 2 settings matrix', () => {
  it('applies default settings and generated square dimensions without refs', () => {
    expect(buildWireParams({ model: 'gpt_image_2', prompt, settings: {} }, gptImage2)).toMatchObject({
      model: 'gpt_image_2',
      aspect_ratio: 'auto',
      quality: 'high',
      resolution: '2k',
      sub_model: 'videotape-alpha',
      batch_size: 1,
      use_unlim: false,
      width: 2048,
      height: 2048,
    })
  })

  it('serializes all explicit setting options that affect the request body', () => {
    expect(buildWireParams({
      model: 'gpt_image_2',
      prompt,
      settings: {
        aspectRatio: '21:9',
        quality: 'low',
        resolution: '4k',
        subModel: 'tidepool-alpha',
        batchSize: 4,
        useUnlim: true,
      },
    }, gptImage2)).toMatchObject({
      aspect_ratio: '21:9',
      quality: 'low',
      resolution: '4k',
      sub_model: 'tidepool-alpha',
      batch_size: 4,
      use_unlim: true,
      width: 4096,
      height: 1755,
    })
  })

  it('keeps the imagegen_2_0 entry compatible with the GPT Image 2 backend model', () => {
    const wire = buildWireParams({
      model: 'imagegen_2_0',
      prompt,
      settings: { aspectRatio: '2:3', quality: 'medium', resolution: '1k' },
    }, imagegen2_0)

    expect(wire).toMatchObject({
      model: 'gpt_image_2',
      aspect_ratio: '2:3',
      quality: 'medium',
      width: 683,
      height: 1024,
    })
  })

  it('validates prompt, batch size, upload count, min side, and image ratio', () => {
    expectIssues({ model: 'gpt_image_2', settings: {} }, gptImage2, ['Prompt is required'])
    expectIssues({ model: 'gpt_image_2', prompt, settings: { batchSize: 0 } }, gptImage2, ['batchSize must be between 1 and 4'])
    expectIssues({
      model: 'gpt_image_2',
      prompt,
      media: { image: Array.from({ length: 17 }, (_, i) => ref(`g${i}`)) },
      settings: {},
    }, gptImage2, ['takes at most 16 ref(s)'])
    expectIssues({
      model: 'gpt_image_2',
      prompt,
      media: { image: ref('tiny', { width: 299, height: 600 }) },
      settings: {},
    }, gptImage2, ['minimum dimension is 300px'])
    expectIssues({
      model: 'gpt_image_2',
      prompt,
      media: { image: ref('wide', { width: 3000, height: 500 }) },
      settings: {},
    }, gptImage2, ['image aspect ratio must be between 0.4 and 2.5'])
  })
})

describe('Seedream 4.5 settings matrix', () => {
  it('applies defaults and the 1024 square fallback when no input image is present', () => {
    expect(buildWireParams({ model: 'seedream_v4_5', prompt, settings: {} }, seedreamV4_5)).toMatchObject({
      model: 'seedream_v4_5',
      aspect_ratio: '3:4',
      quality: 'basic',
      batch_size: 1,
      use_unlim: false,
      width: 1024,
      height: 1024,
      input_images: [],
    })
  })

  it('serializes optional seed, quality, batch, useUnlim, and first-image dimensions', () => {
    expect(buildWireParams({
      model: 'seedream_v4_5',
      prompt,
      media: { image: ref('seedream', { width: 1200, height: 1600 }) },
      settings: { aspectRatio: '21:9', quality: 'high', batchSize: 4, seed: 12345, useUnlim: true },
    }, seedreamV4_5)).toMatchObject({
      aspect_ratio: '21:9',
      quality: 'high',
      batch_size: 4,
      seed: 12345,
      use_unlim: true,
      width: 1200,
      height: 1600,
      input_images: [{ id: 'seedream', type: 'media_input', url: 'https://cdn/seedream.png' }],
    })
  })

  it('validates prompt, prompt length, batch size, seed, aspect ratio, and upload count', () => {
    expectIssues({ model: 'seedream_v4_5', settings: {} }, seedreamV4_5, ['Prompt is required'])
    expectIssues({
      model: 'seedream_v4_5',
      prompt: { instruction: 'x'.repeat(3001) },
      settings: {},
    }, seedreamV4_5, ['Prompt is too long (max 3000 characters)'])
    expectIssues({ model: 'seedream_v4_5', prompt, settings: { batchSize: 5 } }, seedreamV4_5, ['batchSize must be between 1 and 4'])
    expectIssues({ model: 'seedream_v4_5', prompt, settings: { seed: 0 } }, seedreamV4_5, ['seed must be between 1 and 1000000'])
    expectIssues({ model: 'seedream_v4_5', prompt, settings: { aspectRatio: 'bad' } }, seedreamV4_5, [
      'aspectRatio must be one of: 1:1, 4:3, 16:9, 3:2, 21:9, 3:4, 9:16, 2:3',
    ])
    expectIssues({
      model: 'seedream_v4_5',
      prompt,
      media: { image: Array.from({ length: 15 }, (_, i) => ref(`s${i}`)) },
      settings: {},
    }, seedreamV4_5, ['takes at most 14 ref(s)'])
  })
})

describe('Nano Banana Pro settings matrix', () => {
  it('applies defaults, bare input_images, and the default concrete ratio for auto without refs', () => {
    expect(buildWireParams({ model: 'nano_banana_2', prompt, settings: { aspectRatio: 'auto' } }, nanoBanana2)).toMatchObject({
      aspect_ratio: '3:4',
      resolution: '1k',
      batch_size: 1,
      use_unlim: false,
      is_storyboard: false,
      is_zoom_control: false,
      width: 896,
      height: 1200,
      input_images: [],
    })
  })

  it('serializes advanced application params and media-data paint image', () => {
    expect(buildWireParams({
      model: 'nano_banana_2',
      prompt,
      media: { image: ref('nano-pro', { width: 1920, height: 1080 }) },
      settings: {
        aspectRatio: 'auto',
        resolution: '4k',
        batchSize: 4,
        useUnlim: true,
        useSeedreamBonus: true,
        isStoryboard: true,
        isZoomControl: true,
        applicationSlug: 'outfit-collage',
        isDraw: true,
        isUgc: true,
        isProductPlacement: true,
        isPhotoSet: true,
        isPainting: true,
        paintImage: ref('paint'),
        fashionFactoryId: 'fashion-1',
        isBatch: true,
        presets: { outfitCollagePresetId: 'preset-1' },
      },
    }, nanoBanana2)).toMatchObject({
      aspect_ratio: '16:9',
      resolution: '4k',
      batch_size: 4,
      use_unlim: true,
      use_seedream_bonus: true,
      is_storyboard: true,
      is_zoom_control: true,
      application_slug: 'outfit-collage',
      is_draw: true,
      is_ugc: true,
      is_product_placement: true,
      is_photo_set: true,
      is_painting: true,
      paint_image: { id: 'paint', type: 'media_input', url: 'https://cdn/paint.png' },
      fashion_factory_id: 'fashion-1',
      _isBatch: true,
      presets: { outfit_collage_preset_id: 'preset-1' },
      width: 5504,
      height: 3072,
    })
  })

  it('validates prompt length, batch size, upload count, and known min side', () => {
    expectIssues({ model: 'nano_banana_2', prompt: { instruction: 'x' }, settings: {} }, nanoBanana2, ['Prompt is required'])
    expectIssues({
      model: 'nano_banana_2',
      prompt: { instruction: 'x'.repeat(15000) },
      settings: {},
    }, nanoBanana2, ['Prompt is too long (max 15000 characters)'])
    expectIssues({ model: 'nano_banana_2', prompt, settings: { batchSize: 5 } }, nanoBanana2, ['batchSize must be between 1 and 4'])
    expectIssues({
      model: 'nano_banana_2',
      prompt,
      media: { image: Array.from({ length: 15 }, (_, i) => ref(`n${i}`)) },
      settings: {},
    }, nanoBanana2, ['takes at most 14 ref(s)'])
    expectIssues({
      model: 'nano_banana_2',
      prompt,
      media: { image: ref('tiny', { width: 128, height: 127 }) },
      settings: {},
    }, nanoBanana2, ['minimum dimension is 128px'])
  })
})

describe('Nano Banana 2 settings matrix', () => {
  it('applies defaults and wrapped media for Flash', () => {
    const wire = buildWireParams({
      model: 'nano_banana_flash',
      prompt,
      media: { image: ref('flash', { width: 1000, height: 1000 }) },
      settings: {},
    }, nanoBananaFlash)

    expect(wire).toMatchObject({
      aspect_ratio: '3:4',
      resolution: '1k',
      batch_size: 1,
      use_unlim: false,
      width: 896,
      height: 1200,
    })
    expect(wire.medias).toEqual([{ role: 'image', data: { id: 'flash', type: 'media_input', url: 'https://cdn/flash.png' } }])
  })

  it('uses the shared Nano auto-ratio table and explicit generation settings', () => {
    expect(buildWireParams({
      model: 'nano_banana_flash',
      prompt,
      media: { image: ref('flash-wide', { width: 2100, height: 900 }) },
      settings: { aspectRatio: 'auto', resolution: '2k', batchSize: 3, useUnlim: true },
    }, nanoBananaFlash)).toMatchObject({
      aspect_ratio: '21:9',
      resolution: '2k',
      batch_size: 3,
      use_unlim: true,
      width: 3168,
      height: 1344,
    })
  })

  it('validates prompt length, batch size, upload count, and known min side', () => {
    expectIssues({ model: 'nano_banana_flash', prompt: { instruction: 'x' }, settings: {} }, nanoBananaFlash, ['Prompt is required'])
    expectIssues({
      model: 'nano_banana_flash',
      prompt: { instruction: 'x'.repeat(15000) },
      settings: {},
    }, nanoBananaFlash, ['Prompt is too long (max 15000 characters)'])
    expectIssues({ model: 'nano_banana_flash', prompt, settings: { batchSize: 0 } }, nanoBananaFlash, ['batchSize must be between 1 and 4'])
    expectIssues({
      model: 'nano_banana_flash',
      prompt,
      media: { image: Array.from({ length: 15 }, (_, i) => ref(`nf${i}`)) },
      settings: {},
    }, nanoBananaFlash, ['takes at most 14 ref(s)'])
    expectIssues({
      model: 'nano_banana_flash',
      prompt,
      media: { image: ref('tiny', { width: 64, height: 512 }) },
      settings: {},
    }, nanoBananaFlash, ['minimum dimension is 128px'])
  })
})

describe('Soul 2.0 settings matrix', () => {
  it('applies all Soul 2.0 defaults that the app sends', () => {
    expect(buildWireParams({ model: 'text2image_soul_v2', settings: {} }, soulV2Image)).toMatchObject({
      model: 'soul_v2',
      prompt: '',
      style_id: DEFAULT_SOUL_V2_STYLE_ID,
      style_strength: 1,
      custom_reference_strength: 1,
      quality: '1080p',
      aspect_ratio: '3:4',
      batch_size: 1,
      use_unlim: false,
      use_refiner: false,
      use_green: true,
      lora: null,
      chain_enhancer: null,
      model_version: 'fast',
      width: 1536,
      height: 2048,
      medias: [],
      enhance_prompt: false,
      negative_prompt: '',
    })
  })

  it('serializes explicit style, reference, avatar, prompt, and generation params', () => {
    expect(buildWireParams({
      model: 'text2image_soul_v2',
      prompt: { instruction: 'editorial portrait', enhance: true, negative: 'blur' },
      media: { image: ref('soul', { width: 1024, height: 768 }) },
      settings: {
        styleId: 'style-1',
        styleStrength: 0.65,
        customReferenceId: 'custom-ref',
        customReferenceStrength: 0.8,
        fashionFactoryId: 'fashion-2',
        quality: '720p',
        aspectRatio: '21:9',
        seed: 42,
        batchSize: 4,
        useUnlim: true,
        useRefiner: true,
        useGreen: false,
        useGreenAidar: true,
        lora: 'lora-id',
        chainEnhancer: true,
        colorPresetId: 'color-1',
        modelVersion: 'general',
        isCustom: true,
        useNoise: true,
        fullName: 'Ada Lovelace',
        isMarketingStudioAvatar: true,
      },
    }, soulV2Image)).toMatchObject({
      model: 'soul_v2',
      prompt: 'editorial portrait',
      enhance_prompt: true,
      negative_prompt: 'blur',
      style_id: 'style-1',
      style_strength: 0.65,
      custom_reference_id: 'custom-ref',
      custom_reference_strength: 0.8,
      fashion_factory_id: 'fashion-2',
      quality: '720p',
      aspect_ratio: '21:9',
      seed: 42,
      batch_size: 4,
      use_unlim: true,
      use_refiner: true,
      use_green: false,
      use_green_aidar: true,
      lora: 'lora-id',
      chain_enhancer: true,
      color_preset_id: 'color-1',
      model_version: 'general',
      is_custom: true,
      use_noise: true,
      full_name: 'Ada Lovelace',
      is_marketing_studio_avatar: true,
      width: 1680,
      height: 720,
    })
  })

  it('validates batch size, seed, aspect ratio, upload count, and known min side', () => {
    expectIssues({ model: 'text2image_soul_v2', settings: { batchSize: 5 } }, soulV2Image, ['batchSize must be between 1 and 4'])
    expectIssues({ model: 'text2image_soul_v2', settings: { seed: 0 } }, soulV2Image, ['seed must be between 1 and 1000000'])
    expectIssues({ model: 'text2image_soul_v2', settings: { aspectRatio: 'bad' } }, soulV2Image, [
      'aspectRatio must be one of: 9:16, 3:4, 2:3, 1:1, 4:3, 16:9, 3:2, 21:9',
    ])
    expectIssues({
      model: 'text2image_soul_v2',
      media: { image: [ref('a'), ref('b')] },
      settings: {},
    }, soulV2Image, ['takes at most 1 ref(s)'])
    expectIssues({
      model: 'text2image_soul_v2',
      media: { image: ref('tiny', { width: 1024, height: 127 }) },
      settings: {},
    }, soulV2Image, ['minimum dimension is 128px'])
  })
})

describe('Soul Cinema settings matrix', () => {
  it('applies Cinema defaults and keeps prompts when there is no image reference', () => {
    expect(buildWireParams({
      model: 'soul_cinematic',
      prompt: { instruction: 'cinematic portrait' },
      settings: {},
    }, soulCinemaImage)).toMatchObject({
      model: 'soul_cinematic',
      prompt: 'cinematic portrait',
      style_id: DEFAULT_SOUL_CINEMA_STYLE_ID,
      custom_reference_strength: null,
      aspect_ratio: '16:9',
      model_version: 'fast',
      chain_enhancer: null,
      enhance_prompt: true,
      time_denoise_from: [0.83],
      width: 2048,
      height: 1152,
    })
  })

  it('fills partial denoise arrays and maps cinematic variants', () => {
    expect(buildWireParams({
      model: 'soul_cinematic',
      prompt,
      settings: {
        batchSize: 3,
        timeDenoiseFrom: [0.5],
        cinematicVariant: 'olzhas',
        styleId: DEFAULT_SOUL_CINEMA_OLZHAS_STYLE_ID,
      },
    }, soulCinemaImage)).toMatchObject({
      use_olzhas: true,
      time_denoise_from: [0.5, 0.83, 0.83],
      style_id: DEFAULT_SOUL_CINEMA_OLZHAS_STYLE_ID,
    })

    expect(buildWireParams({
      model: 'soul_cinematic',
      prompt,
      settings: { cinematicVariant: 'aidar' },
    }, soulCinemaImage)).toMatchObject({ use_aidar: true })
  })
})

describe('Recraft V4.1 settings matrix', () => {
  it('applies text-only defaults and strips the frontend model field', () => {
    const wire = buildWireParams({ model: 'recraft_v4_1', prompt, settings: {} }, recraftV41Image)

    expect(wire).toMatchObject({
      model_type: 'standard',
      aspect_ratio: '1:1',
      resolution: '1k',
      batch_size: 1,
      use_unlim: false,
      width: 1024,
      height: 1024,
    })
    expect(wire).not.toHaveProperty('model')
  })

  it('derives model_type for every public model option', () => {
    expect(buildWireParams({ model: 'recraft_v4_1', prompt, settings: { model: 'recraft-v4-1' } }, recraftV41Image).model_type).toBe('standard')
    expect(buildWireParams({ model: 'recraft_v4_1', prompt, settings: { model: 'recraft-v4-1-vector' } }, recraftV41Image).model_type).toBe('vector')
    expect(buildWireParams({ model: 'recraft_v4_1', prompt, settings: { model: 'recraft-v4-1-utility' } }, recraftV41Image).model_type).toBe('utility')
    expect(buildWireParams({ model: 'recraft_v4_1', prompt, settings: { model: 'recraft-v4-1-utility-vector' } }, recraftV41Image).model_type).toBe('utility_vector')
  })

  it('serializes explicit palette, background, modelType, resolution, batch, and useUnlim', () => {
    expect(buildWireParams({
      model: 'recraft_v4_1',
      prompt,
      settings: {
        model: 'recraft-v4-1-utility-vector',
        modelType: 'utility_vector',
        aspectRatio: '9:16',
        resolution: '2k',
        batchSize: 4,
        colors: ['#111111', '#eeeeee'],
        backgroundColor: '#ffffff',
        useUnlim: true,
      },
    }, recraftV41Image)).toMatchObject({
      model_type: 'utility_vector',
      aspect_ratio: '9:16',
      resolution: '2k',
      batch_size: 4,
      colors: ['#111111', '#eeeeee'],
      background_color: '#ffffff',
      use_unlim: true,
      width: 1152,
      height: 2048,
    })
  })

  it('validates prompt, palette, batch, aspect, and model/modelType consistency', () => {
    expectIssues({ model: 'recraft_v4_1', settings: {} }, recraftV41Image, ['Prompt is required'])
    expectIssues({
      model: 'recraft_v4_1',
      prompt: { instruction: 'x'.repeat(3001) },
      settings: {},
    }, recraftV41Image, ['Prompt is too long (max 3000 characters)'])
    expectIssues({ model: 'recraft_v4_1', prompt, settings: { batchSize: 0 } }, recraftV41Image, ['batchSize must be between 1 and 4'])
    expectIssues({ model: 'recraft_v4_1', prompt, settings: { aspectRatio: 'bad' } }, recraftV41Image, [
      'aspectRatio must be one of: 1:1, 3:4, 4:3, 4:5, 5:4, 3:2, 2:3, 16:9, 9:16',
    ])
    expectIssues({
      model: 'recraft_v4_1',
      prompt,
      settings: { colors: Array.from({ length: 11 }, (_, i) => `#00000${i}`) },
    }, recraftV41Image, ['Color palette can include up to 10 colors'])
    expectIssues({
      model: 'recraft_v4_1',
      prompt,
      settings: { model: 'recraft-v4-1', modelType: 'vector' },
    }, recraftV41Image, ['modelType \'vector\' does not match model \'recraft-v4-1\''])
  })

  it('round-trips stored model_type back to the public model setting', () => {
    const generation = parseGeneration({
      id: 'recraft-1',
      status: 'completed',
      result_url: 'https://cdn/recraft.png',
      params: {
        prompt: 'utility mark',
        model_type: 'utility',
        aspect_ratio: '4:5',
        resolution: '2k',
        batch_size: 2,
      },
    }, recraftV41Image)

    expect(generation.input.settings.model).toBe('recraft-v4-1-utility')
    expect(buildWireParams(generation.input, recraftV41Image)).toMatchObject({
      model_type: 'utility',
      aspect_ratio: '4:5',
      width: 1638,
      height: 2048,
    })
  })
})

describe('image model SDK integration matrix', () => {
  const jobs = [
    soulV2Image,
    soulCinemaImage,
    gptImage2,
    imagegen2_0,
    seedreamV4_5,
    nanoBanana2,
    nanoBananaFlash,
    recraftV41Image,
  ] as const

  const cases: Array<{ name: string, input: GenerationInput }> = [
    { name: 'Soul 2.0', input: { model: 'text2image_soul_v2', prompt, settings: { aspectRatio: '1:1' } } },
    { name: 'Soul Cinema', input: { model: 'soul_cinematic', prompt, settings: { batchSize: 2 } } },
    { name: 'GPT Image 2', input: { model: 'gpt_image_2', prompt, settings: { resolution: '1k' } } },
    { name: 'GPT Image 2 compatibility alias', input: { model: 'imagegen_2_0', prompt, settings: { aspectRatio: '3:2' } } },
    { name: 'Seedream 4.5', input: { model: 'seedream_v4_5', prompt, settings: { quality: 'high' } } },
    { name: 'Nano Banana Pro', input: { model: 'nano_banana_2', prompt, settings: { resolution: '2k' } } },
    { name: 'Nano Banana 2', input: { model: 'nano_banana_flash', prompt, settings: { resolution: '2k' } } },
    { name: 'Recraft V4.1', input: { model: 'recraft_v4_1', prompt, settings: { model: 'recraft-v4-1-vector' } } },
  ]

  it('registers and submits every image model through the memory backend', async () => {
    const client = createJobClient({
      adapter: createMemoryBackend(),
      jobs,
    })

    for (const item of cases) {
      const result = await client.submit(item.input as never)
      const [generation] = result.generations
      const completed = await client.get(generation.id)

      expect(generation.model, item.name).toBe(item.input.model)
      expect(generation.status, item.name).toBe('queued')
      expect(completed.status, item.name).toBe('completed')
      expect(completed.type, item.name).toBe('image')
      expect(completed.results?.rawUrl, item.name).toContain(item.input.model)
    }
  })
})
