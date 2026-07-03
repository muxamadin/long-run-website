import type { MediaRef } from '../../types'
import { describe, expect, it } from 'vitest'
import { createMemoryBackend } from '../../adapters/memory-backend'
import { createJobClient } from '../../client'
import { buildWireParams, parseGeneration } from '../../spec'
import { gptImage2, imagegen2_0 } from '../gpt-image-2'
import { nanoBanana2 } from '../nano-banana-2'
import { nanoBananaFlash } from '../nano-banana-flash'
import { recraftV41Image } from '../recraft-v4-1'
import { seedreamV4_5 } from '../seedream-v4-5'
import { DEFAULT_SOUL_CINEMA_STYLE_ID, DEFAULT_SOUL_V2_STYLE_ID, soulCinemaImage, soulV2Image } from '../soul-v2'

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

describe('new image model wire params', () => {
  it('GPT Image 2 resolves auto dimensions from the first image meta and wraps media', () => {
    const wire = buildWireParams({
      model: 'gpt_image_2',
      prompt: { instruction: 'make this editorial' },
      media: { image: [ref('g', { width: 1200, height: 800 })] },
      settings: { aspectRatio: 'auto', quality: 'medium', resolution: '2k', batchSize: 2 },
    }, gptImage2)

    expect(wire).toMatchObject({
      model: 'gpt_image_2',
      prompt: 'make this editorial',
      aspect_ratio: 'auto',
      quality: 'medium',
      resolution: '2k',
      sub_model: 'videotape-alpha',
      batch_size: 2,
      width: 1200,
      height: 800,
    })
    expect(wire.medias).toEqual([{ role: 'image', data: { id: 'g', type: 'media_input', url: 'https://cdn/g.png' } }])
  })

  it('imagegen_2_0 compatibility entry submits the GPT Image 2 wire model', () => {
    const wire = buildWireParams({
      model: 'imagegen_2_0',
      prompt: { instruction: 'poster' },
      settings: { aspectRatio: '16:9', resolution: '1k' },
    }, imagegen2_0)

    expect(wire.model).toBe('gpt_image_2')
    expect([wire.width, wire.height]).toEqual([1024, 576])
  })

  it('Seedream 4.5 uses first image dimensions and bare input_images', () => {
    const wire = buildWireParams({
      model: 'seedream_v4_5',
      prompt: { instruction: 'restyle' },
      media: { image: [ref('s', { width: 640, height: 960 })] },
      settings: { aspectRatio: '3:4', quality: 'high', batchSize: 4 },
    }, seedreamV4_5)

    expect(wire).toMatchObject({
      model: 'seedream_v4_5',
      width: 640,
      height: 960,
      quality: 'high',
      batch_size: 4,
    })
    expect(wire.input_images).toEqual([{ id: 's', type: 'media_input', url: 'https://cdn/s.png' }])
  })

  it('Nano Banana Pro exposes advanced backend params and keeps bare input_images', () => {
    const wire = buildWireParams({
      model: 'nano_banana_2',
      prompt: { instruction: 'turn it into a campaign image' },
      media: { image: [ref('n', { width: 1920, height: 1080 })] },
      settings: {
        aspectRatio: 'auto',
        resolution: '2k',
        useSeedreamBonus: true,
        presets: { outfitCollagePresetId: 'preset-1' },
        paintImage: ref('paint'),
        isPainting: true,
      },
    }, nanoBanana2)

    expect(wire).toMatchObject({
      aspect_ratio: '16:9',
      width: 2752,
      height: 1536,
      use_seedream_bonus: true,
      presets: { outfit_collage_preset_id: 'preset-1' },
      paint_image: { id: 'paint', type: 'media_input', url: 'https://cdn/paint.png' },
      is_painting: true,
      is_storyboard: false,
      is_zoom_control: false,
    })
    expect(wire.input_images).toEqual([{ id: 'n', type: 'media_input', url: 'https://cdn/n.png' }])
  })

  it('Nano Banana 2 uses the Flash job type and wrapped medias', () => {
    const wire = buildWireParams({
      model: 'nano_banana_flash',
      prompt: { instruction: 'make it sharper' },
      media: { image: [ref('f', { width: 1080, height: 1920 })] },
      settings: { aspectRatio: 'auto', resolution: '1k' },
    }, nanoBananaFlash)

    expect(wire).toMatchObject({
      aspect_ratio: '9:16',
      width: 768,
      height: 1376,
    })
    expect(wire.medias).toEqual([{ role: 'image', data: { id: 'f', type: 'media_input', url: 'https://cdn/f.png' } }])
  })

  it('Soul 2.0 sends the new Soul model defaults', () => {
    const wire = buildWireParams({ model: 'text2image_soul_v2', settings: {} }, soulV2Image)

    expect(wire).toMatchObject({
      model: 'soul_v2',
      prompt: '',
      style_id: DEFAULT_SOUL_V2_STYLE_ID,
      style_strength: 1,
      custom_reference_strength: 1,
      aspect_ratio: '3:4',
      quality: '1080p',
      width: 1536,
      height: 2048,
      batch_size: 1,
      use_refiner: false,
      use_green: true,
      lora: null,
      chain_enhancer: null,
      model_version: 'fast',
      enhance_prompt: false,
      negative_prompt: '',
      medias: [],
    })
  })

  it('Soul Cinema suppresses prompt with image refs and fills denoise per batch item', () => {
    const wire = buildWireParams({
      model: 'soul_cinematic',
      prompt: { instruction: 'cinematic portrait' },
      media: { image: ref('cin', { width: 1024, height: 768 }) },
      settings: { batchSize: 2, cinematicVariant: 'sultan' },
    }, soulCinemaImage)

    expect(wire).toMatchObject({
      model: 'soul_cinematic',
      prompt: '',
      style_id: DEFAULT_SOUL_CINEMA_STYLE_ID,
      aspect_ratio: '16:9',
      width: 2048,
      height: 1152,
      model_version: 'fast',
      chain_enhancer: null,
      use_sultan: true,
      time_denoise_from: [0.83, 0.83],
    })
  })

  it('Recraft strips frontend model and keeps backend model_type', () => {
    const wire = buildWireParams({
      model: 'recraft_v4_1',
      prompt: { instruction: 'clean vector mark' },
      settings: { model: 'recraft-v4-1-vector', aspectRatio: '3:2', resolution: '2k', colors: ['#000000'] },
    }, recraftV41Image)

    expect(wire).toMatchObject({
      model_type: 'vector',
      aspect_ratio: '3:2',
      resolution: '2k',
      colors: ['#000000'],
      width: 2048,
      height: 1365,
    })
    expect(wire).not.toHaveProperty('model')
  })

  it('Recraft restores model from stored model_type', () => {
    const gen = parseGeneration({
      id: 'r1',
      status: 'completed',
      result_url: 'https://cdn/r.png',
      params: { prompt: 'x', model_type: 'utility_vector', aspect_ratio: '1:1', resolution: '1k', batch_size: 1 },
    }, recraftV41Image)

    expect(gen.input.settings.model).toBe('recraft-v4-1-utility-vector')
    expect(buildWireParams(gen.input, recraftV41Image).model_type).toBe('utility_vector')
  })
})

describe('new image model validation', () => {
  it('validates upload counts and known dimensions', () => {
    const refs = Array.from({ length: 17 }, (_, i) => ref(`g${i}`))
    expect(() => buildWireParams({
      model: 'gpt_image_2',
      prompt: { instruction: 'x' },
      media: { image: refs },
      settings: {},
    }, gptImage2)).toThrow(/at most 16/)

    expect(() => buildWireParams({
      model: 'nano_banana_flash',
      prompt: { instruction: 'x' },
      media: { image: ref('tiny', { width: 64, height: 64 }) },
      settings: {},
    }, nanoBananaFlash)).toThrow(/minimum dimension is 128px/)
  })

  it('validates prompt and palette limits', () => {
    expect(issuesOf(() => buildWireParams({
      model: 'seedream_v4_5',
      prompt: { instruction: 'x'.repeat(3001) },
      settings: {},
    }, seedreamV4_5))).toContain('Prompt is too long (max 3000 characters)')

    expect(issuesOf(() => buildWireParams({
      model: 'recraft_v4_1',
      prompt: { instruction: 'mark' },
      settings: { colors: Array.from({ length: 11 }, (_, i) => `#00000${i}`) },
    }, recraftV41Image))).toContain('Color palette can include up to 10 colors')
  })
})

describe('new image model local costs', () => {
  it('prices static image models locally', async () => {
    const client = createJobClient({
      adapter: createMemoryBackend({ cost: 999 }),
      jobs: [soulV2Image, soulCinemaImage, gptImage2, nanoBanana2, nanoBananaFlash, recraftV41Image, seedreamV4_5],
    })

    await expect(client.cost({ model: 'text2image_soul_v2', settings: { batchSize: 4 } })).resolves.toEqual({ credits: 0.5 })
    await expect(client.cost({ model: 'soul_cinematic', settings: { batchSize: 2 } })).resolves.toEqual({ credits: 0.25 })
    await expect(client.cost({ model: 'gpt_image_2', settings: { quality: 'high', resolution: '4k', batchSize: 2 } })).resolves.toEqual({ credits: 24 })
    await expect(client.cost({ model: 'nano_banana_2', settings: { resolution: '4k', batchSize: 2 } })).resolves.toEqual({ credits: 8 })
    await expect(client.cost({ model: 'nano_banana_flash', settings: { resolution: '2k', batchSize: 3 } })).resolves.toEqual({ credits: 6 })
    await expect(client.cost({ model: 'recraft_v4_1', settings: { model: 'recraft-v4-1-vector', resolution: '2k', batchSize: 2 } })).resolves.toEqual({ credits: 20 })
    await expect(client.cost({ model: 'seedream_v4_5', settings: { batchSize: 4 } })).resolves.toEqual({ credits: 4 })
  })
})
