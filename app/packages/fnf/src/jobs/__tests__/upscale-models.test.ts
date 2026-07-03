import type { MediaRef } from '../../types'
import { describe, expect, it } from 'vitest'
import { createMemoryBackend } from '../../adapters/memory-backend'
import { createJobClient } from '../../client'
import { buildWireParams, parseGeneration } from '../../spec'
import { nanoBanana2Upscale } from '../nano-banana-2-upscale'
import { topazImageGenerativeUpscale, topazImageUpscale } from '../topaz-image-upscale'
import { bytedanceVideoUpscale, higgsfieldVideoUpscale, soraEnhanceVideo, topazVideoUpscale } from '../video-upscale'

function imageRef(id: string, meta?: MediaRef['meta']): MediaRef {
  return { id, type: 'media_input', url: `https://cdn/${id}.png`, ...(meta ? { meta } : {}) }
}

function videoRef(id: string, meta?: MediaRef['meta']): MediaRef {
  return { id, type: 'video_input', url: `https://cdn/${id}.mp4`, ...(meta ? { meta } : {}) }
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

describe('upscale image models', () => {
  it('builds Topaz image defaults from known media meta', () => {
    const wire = buildWireParams({
      model: 'topaz_image',
      media: { image: imageRef('i', { width: 640, height: 480 }) },
      settings: {},
    }, topazImageUpscale)

    expect(wire).toMatchObject({
      input_image: { id: 'i', type: 'media_input', url: 'https://cdn/i.png' },
      model: 'Standard V2',
      width: 640,
      height: 480,
      output_width: 640,
      output_height: 480,
      denoise: 0.2,
      sharpen: 0.3,
      face_enhancement: false,
      face_enhancement_creativity: 0,
      face_enhancement_strength: 0.8,
    })
    expect(wire).not.toHaveProperty('factor')
  })

  it('uses explicit source dimensions and factor when meta is unavailable', () => {
    const wire = buildWireParams({
      model: 'topaz_image',
      media: { image: imageRef('i') },
      settings: { sourceWidth: 320, sourceHeight: 200, factor: 'x4' },
    }, topazImageUpscale)

    expect(wire).toMatchObject({ width: 320, height: 200, output_width: 1280, output_height: 800 })
  })

  it('builds Topaz generative image payload with fixed Redefine model', () => {
    const wire = buildWireParams({
      model: 'topaz_image_generative',
      prompt: { instruction: 'restore the small details' },
      media: { image: imageRef('g', { width: 1024, height: 768 }) },
      settings: { creativity: 3, texture: 2, detail: 0.7, autoprompt: false },
    }, topazImageGenerativeUpscale)

    expect(wire).toMatchObject({
      prompt: 'restore the small details',
      model: 'Redefine',
      width: 1024,
      height: 768,
      creativity: 3,
      texture: 2,
      detail: 0.7,
      autoprompt: false,
    })
  })

  it('builds Nano Banana 2 upscale from the Nano size table', () => {
    const wire = buildWireParams({
      model: 'nano_banana_2_upscale',
      media: { image: [imageRef('n', { width: 1920, height: 1080 })] },
      settings: { resolution: '2k', aspectRatio: 'auto' },
    }, nanoBanana2Upscale)

    expect(wire).toMatchObject({
      resolution: '2k',
      aspect_ratio: '16:9',
      width: 2752,
      height: 1536,
      is_storyboard: false,
      is_zoom_control: false,
    })
    expect(wire.input_images).toEqual([{ id: 'n', type: 'media_input', url: 'https://cdn/n.png' }])
  })

  it('validates source dimensions, available factors, and slider ranges', () => {
    expect(issuesOf(() => buildWireParams({
      model: 'topaz_image',
      media: { image: imageRef('huge', { width: 8000, height: 5000 }) },
      settings: { factor: 'x4' },
    }, topazImageUpscale))).toContain('factor must be one of: x1 for this image size')

    expect(issuesOf(() => buildWireParams({
      model: 'topaz_image',
      media: { image: imageRef('i') },
      settings: {},
    }, topazImageUpscale))).toContain('sourceSize requires positive width and height')

    expect(issuesOf(() => buildWireParams({
      model: 'topaz_image_generative',
      media: { image: imageRef('i', { width: 320, height: 320 }) },
      settings: { creativity: 7 },
    }, topazImageGenerativeUpscale))).toContain('creativity must be between 1 and 6')
  })
})

describe('upscale video models', () => {
  it('builds nested Topaz video payload and fixed Starlight 4K output by default', () => {
    const wire = buildWireParams({
      model: 'topaz_video',
      media: { video: videoRef('v', { width: 1280, height: 720 }) },
      settings: {},
    }, topazVideoUpscale)

    expect(wire).toMatchObject({
      input_video: { id: 'v', type: 'video_input', url: 'https://cdn/v.mp4' },
      width: 1280,
      height: 720,
      output_width: 3840,
      output_height: 2160,
      model: 'slp-2.5',
      enhancement: { model: 'slp-2.5', focus_fix_level: 'Normal', params: null },
      frame_interpolation: null,
    })
  })

  it('builds Topaz manual enhancement params and frame interpolation', () => {
    const wire = buildWireParams({
      model: 'topaz_video',
      media: { video: videoRef('v', { width: 640, height: 360 }) },
      settings: {
        model: 'prob-4',
        enhancementModel: 'iris-3',
        parameters: 'manual',
        compression: 0.2,
        details: 0.4,
        preblur: 0,
        blur: -0.1,
        noise: -0.2,
        halo: 0.1,
        grainEnabled: true,
        grainStrength: 0.05,
        grainSize: 0.03,
        frameInterpolation: true,
        frameInterpolationFps: 60,
        slowMotion: 2,
        scaleFactor: 'FULL_HD',
      },
    }, topazVideoUpscale)

    expect(wire.output_width).toBe(1920)
    expect(wire.output_height).toBe(1080)
    expect(wire.enhancement).toEqual({
      model: 'iris-3',
      focus_fix_level: 'Normal',
      params: {
        compression: 0.2,
        details: 0.4,
        preblur: 0,
        blur: -0.1,
        noise: -0.2,
        halo: 0.1,
        grain: { strength: 0.05, size: 0.03 },
      },
    })
    expect(wire.frame_interpolation).toEqual({ model: 'apo-8', fps: 60, slowmo: 2 })
  })

  it('builds Higgsfield and Sora Enhance video upscales with output dims retained for parse but stripped by adapter', () => {
    const base = {
      media: { video: videoRef('v', { width: 1280, height: 720 }) },
      settings: { scaleFactor: '4k' as const, useUnlim: true },
    }

    expect(buildWireParams({ model: 'video_upscale', ...base }, higgsfieldVideoUpscale)).toMatchObject({
      width: 1280,
      height: 720,
      output_width: 3840,
      output_height: 2160,
      use_unlim: true,
    })
    expect(buildWireParams({ model: 'video_deflicker', ...base }, soraEnhanceVideo)).toMatchObject({
      width: 1280,
      height: 720,
      output_width: 3840,
      output_height: 2160,
      use_unlim: true,
    })
  })

  it('builds Bytedance video upscale with wrapped media and local credits', async () => {
    const input = {
      model: 'bytedance_video_upscale' as const,
      media: { video: videoRef('b', { width: 640, height: 360, durationSec: 12 }) },
      settings: { resolution: '4k' as const, preset: 'aigc' as const, fps: 60 },
    }
    const wire = buildWireParams(input, bytedanceVideoUpscale)

    expect(wire).toMatchObject({ width: 640, height: 360, resolution: '4k', preset: 'aigc', fps: 60 })
    expect(wire.medias).toEqual([{ role: 'video', data: { id: 'b', type: 'video_input', url: 'https://cdn/b.mp4' } }])

    const client = createJobClient({ adapter: createMemoryBackend({ cost: 999 }), jobs: [bytedanceVideoUpscale] })
    await expect(client.cost(input)).resolves.toEqual({ credits: 2 })
  })

  it('validates video source, frame interpolation, and Bytedance settings', () => {
    expect(issuesOf(() => buildWireParams({
      model: 'topaz_video',
      media: { video: videoRef('v', { width: 640, height: 360 }) },
      settings: { frameInterpolation: true, frameInterpolationFps: 300 },
    }, topazVideoUpscale))).toContain('frameInterpolationFps must be between 15 and 240')

    expect(issuesOf(() => buildWireParams({
      model: 'bytedance_video_upscale',
      media: { video: videoRef('v') },
      settings: {},
    }, bytedanceVideoUpscale))).toContain('sourceSize requires positive width and height')
  })

  it('round-trips parsed upscale params', () => {
    const gen = parseGeneration({
      id: 'u1',
      status: 'completed',
      result_url: 'https://cdn/u.mp4',
      params: {
        input_video: { id: 'v', type: 'video_input', url: 'https://cdn/v.mp4' },
        width: 1280,
        height: 720,
        output_width: 3840,
        output_height: 2160,
        model: 'prob-4',
        enhancement: null,
        frame_interpolation: null,
      },
    }, topazVideoUpscale)

    expect(gen.input.settings.sourceWidth).toBe(1280)
    expect(gen.input.settings.outputWidth).toBe(3840)
  })
})

describe('upscale local costs', () => {
  it('prices local upscale models without backend fallback', async () => {
    const client = createJobClient({
      adapter: createMemoryBackend({ cost: 999 }),
      jobs: [nanoBanana2Upscale, higgsfieldVideoUpscale, soraEnhanceVideo],
    })

    await expect(client.cost({ model: 'nano_banana_2_upscale', media: { image: imageRef('n') }, settings: { resolution: '4k' } })).resolves.toEqual({ credits: 4 })
    await expect(client.cost({ model: 'video_upscale', media: { video: videoRef('v', { width: 1, height: 1 }) }, settings: {} })).resolves.toEqual({ credits: 2 })
    await expect(client.cost({ model: 'video_deflicker', media: { video: videoRef('v', { width: 1, height: 1 }) }, settings: {} })).resolves.toEqual({ credits: 2 })
  })
})
