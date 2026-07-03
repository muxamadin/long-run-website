import type { MediaRef } from '../../types'
import { describe, expect, it } from 'vitest'
import { createMemoryBackend } from '../../adapters/memory-backend'
import { createJobClient } from '../../client'
import { buildWireParams, parseGeneration } from '../../spec'
import { grokImagine, grokImagineV15 } from '../grok-imagine'
import { happyHorse } from '../happy-horse'
import { kling3_0 } from '../kling-3'
import { kling3MotionControl } from '../kling-3-motion-control'
import { seedance2_0 } from '../seedance-2-0'
import { veo3_1Lite } from '../veo-3-1-lite'
import { wan27 } from '../wan-2-7'

function ref(id: string, meta?: MediaRef['meta'], type = 'media_input'): MediaRef {
  return { id, type, url: `https://cdn/${id}`, ...(meta ? { meta } : {}) }
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

describe('screenshot video model wire params', () => {
  it('Seedance 2.0 keeps the existing job type and adds bitrate mode parity', () => {
    const wire = buildWireParams({
      model: 'seedance_2_0',
      prompt: { instruction: 'camera drift' },
      settings: { duration: 5, aspectRatio: '16:9', mode: 'fast' },
    }, seedance2_0)

    expect(wire).toMatchObject({
      model: 'seedance_2_0_fast',
      resolution: '720p',
      bitrate_mode: 'standard',
      width: 1280,
      height: 720,
    })

    expect(issuesOf(() => buildWireParams({
      model: 'seedance_2_0',
      prompt: { instruction: 'x' },
      settings: { duration: 5, aspectRatio: '16:9', mode: 'fast', resolution: '1080p' },
    }, seedance2_0))).toContain('resolution \'1080p\' is not available in fast mode')
  })

  it('Kling 3.0 wraps start/end frames, derives ratio from start frame, and serializes multi-shot fields', () => {
    const wire = buildWireParams({
      model: 'kling3_0',
      prompt: { instruction: 'shot one' },
      media: { start_image: ref('start.png', { width: 720, height: 1280 }) },
      settings: {
        aspectRatio: '16:9',
        mode: 'pro',
        sound: 'on',
        duration: 6,
        multiShots: true,
        multiShotMode: 'custom',
        multiPrompt: [{ prompt: 'wide shot', duration: 3 }, { prompt: 'close shot', duration: 3 }],
      },
    }, kling3_0)

    expect(wire).toMatchObject({
      prompt: '',
      aspect_ratio: '9:16',
      mode: 'pro',
      sound: 'on',
      duration: 6,
      width: 1080,
      height: 1920,
      enhance_prompt: false,
      multi_shots: true,
      multi_shot_mode: 'custom',
      kling_element_ids: [],
    })
    expect(wire.medias).toEqual([{ role: 'start_image', data: { id: 'start.png', type: 'media_input', url: 'https://cdn/start.png' } }])
  })

  it('Kling 3.0 validates frame dependencies, prompt length, shot prompts, and element count', () => {
    expect(issuesOf(() => buildWireParams({
      model: 'kling3_0',
      prompt: { instruction: 'x' },
      media: { end_image: ref('end.png') },
      settings: { duration: 5, aspectRatio: '16:9' },
    }, kling3_0))).toContain('Start frame is required when end frame is provided')

    expect(issuesOf(() => buildWireParams({
      model: 'kling3_0',
      media: { start_image: ref('start.png') },
      settings: { duration: 5, aspectRatio: '16:9', multiShots: true, multiShotMode: 'custom', multiPrompt: [{ prompt: '', duration: 1 }] },
    }, kling3_0))).toContain('Each shot must have a prompt')

    expect(issuesOf(() => buildWireParams({
      model: 'kling3_0',
      prompt: { instruction: '<<<a>>> <<<b>>> <<<c>>> <<<d>>>' },
      media: { start_image: ref('start.png') },
      settings: { duration: 5, aspectRatio: '16:9' },
    }, kling3_0))).toContain('Too many elements (max 3). Please remove some elements from your prompt.')
  })

  it('Kling 3.0 Motion Control requires image+video and prices chain mode locally', async () => {
    const wire = buildWireParams({
      model: 'kling3_0_motion_control',
      prompt: { instruction: 'guide the move' },
      media: {
        image: ref('pose.png', { width: 512, height: 768 }),
        video: ref('clip.mp4', { width: 1280, height: 720, durationSec: 6 }, 'video_input'),
      },
      settings: { mode: 'pro', characterOrientation: 'video', duration: 6, isChain: true, backgroundSource: 'input_video' },
    }, kling3MotionControl)

    expect(wire).toMatchObject({
      prompt: 'guide the move',
      mode: 'pro',
      character_orientation: 'video',
      width: 1280,
      height: 720,
      duration: 6,
      isChain: true,
      background_source: 'input_video',
    })
    expect(issuesOf(() => buildWireParams({
      model: 'kling3_0_motion_control',
      media: { image: ref('pose.png') },
      settings: { mode: 'std' },
    }, kling3MotionControl))).toContain('media role \'video\' requires at least 1 ref(s), got 0')

    const client = createJobClient({ adapter: createMemoryBackend({ cost: 999 }), jobs: [kling3MotionControl] })
    await expect(client.cost({
      model: 'kling3_0_motion_control',
      media: { image: ref('pose.png'), video: ref('clip.mp4', { durationSec: 6 }, 'video_input') },
      settings: { mode: 'pro', characterOrientation: 'video', isChain: true },
    })).resolves.toEqual({ credits: 17 })
  })

  it('HappyHorse accepts prompt-or-image, uses start frame dimensions, and validates integer ranges', () => {
    const wire = buildWireParams({
      model: 'happy_horse_video',
      media: { start_image: ref('horse.png', { width: 1000, height: 1400 }) },
      settings: { duration: 5, resolution: '1080p', aspectRatio: '3:4', batchSize: 2 },
    }, happyHorse)

    expect(wire).toMatchObject({
      prompt: '',
      resolution: '1080p',
      aspect_ratio: '3:4',
      batch_size: 2,
      width: 1000,
      height: 1400,
    })
    expect(issuesOf(() => buildWireParams({ model: 'happy_horse_video', settings: { duration: 5 } }, happyHorse)))
      .toContain('Prompt is required when no image is provided')
    expect(issuesOf(() => buildWireParams({
      model: 'happy_horse_video',
      prompt: { instruction: 'x' },
      settings: { duration: 3.5 },
    }, happyHorse))).toContain('duration must be an integer between 3 and 15')
  })

  it('Grok Imagine resolves auto dimensions and Grok 1.5 keeps wire aspect auto', () => {
    const classic = buildWireParams({
      model: 'grok_video',
      prompt: { instruction: 'neon city' },
      settings: { duration: 6, aspectRatio: 'auto', resolution: '720p' },
    }, grokImagine)
    expect(classic).toMatchObject({ aspect_ratio: '16:9', width: 1280, height: 720 })

    const v15 = buildWireParams({
      model: 'grok_video_v15',
      prompt: { instruction: 'animate portrait' },
      media: { start_image: ref('portrait.png', { width: 720, height: 1280 }) },
      settings: { duration: 2, resolution: '480p' },
    }, grokImagineV15)
    expect(v15).toMatchObject({ aspect_ratio: 'auto', width: 480, height: 854 })

    expect(issuesOf(() => buildWireParams({
      model: 'grok_video_v15',
      prompt: { instruction: 'x' },
      settings: { duration: 2 },
    }, grokImagineV15))).toContain('media role \'start_image\' requires at least 1 ref(s), got 0')
  })

  it('Veo 3.1 Lite validates duration combinations and uses app dimensions', () => {
    const auto = buildWireParams({
      model: 'veo3_1_lite',
      prompt: { instruction: 'glass product video' },
      settings: { duration: 8, resolution: '720p', aspectRatio: 'auto' },
    }, veo3_1Lite)
    expect(auto).toMatchObject({ aspect_ratio: 'auto', width: 1920, height: 1080, generate_audio: true })

    expect(issuesOf(() => buildWireParams({
      model: 'veo3_1_lite',
      prompt: { instruction: 'x' },
      settings: { duration: 6, resolution: '1080p' },
    }, veo3_1Lite))).toContain('Duration must be 8 seconds for 1080p resolution')

    expect(issuesOf(() => buildWireParams({
      model: 'veo3_1_lite',
      prompt: { instruction: 'x' },
      media: { start_image: ref('s.png'), end_image: ref('e.png') },
      settings: { duration: 6, resolution: '720p' },
    }, veo3_1Lite))).toContain('Duration must be 8 seconds when both first and last frames are provided')
  })

  it('Wan 2.7 wires quality/resolution, strips no media into input_images, and restores quality', () => {
    const wire = buildWireParams({
      model: 'wan2_7',
      prompt: { instruction: 'storm over mountains', negative: 'blur' },
      media: { start_image: ref('s.png'), end_image: ref('e.png') },
      settings: { quality: '1080p', aspectRatio: '4:3', duration: 5, useUnlim: true },
    }, wan27)

    expect(wire).toMatchObject({
      prompt: 'storm over mountains',
      negative_prompt: 'blur',
      quality: '1080p',
      resolution: '1080p',
      aspect_ratio: '4:3',
      width: 1440,
      height: 1080,
      input_images: [],
      use_unlim: true,
    })

    const gen = parseGeneration({ id: 'w1', status: 'completed', result_url: 'https://cdn/out.mp4', params: { prompt: 'x', resolution: '720p', duration: 5, aspect_ratio: '16:9' } }, wan27)
    expect(gen.input.settings.quality).toBe('720p')
    expect(buildWireParams(gen.input, wan27).resolution).toBe('720p')
  })
})

describe('screenshot video model local costs', () => {
  it('prices local video models and falls back where the app uses backend tables', async () => {
    const client = createJobClient({
      adapter: createMemoryBackend({ cost: 123 }),
      jobs: [seedance2_0, kling3_0, kling3MotionControl, happyHorse, grokImagine, grokImagineV15, veo3_1Lite, wan27],
    })

    await expect(client.cost({ model: 'seedance_2_0', prompt: { instruction: 'x' }, settings: { mode: 'std', duration: 5, aspectRatio: '16:9', resolution: '720p', batchSize: 1 } })).resolves.toEqual({ credits: 23 })
    await expect(client.cost({ model: 'seedance_2_0', prompt: { instruction: 'x' }, settings: { mode: 'fast', duration: 10, aspectRatio: '16:9', resolution: '720p', batchSize: 1 } })).resolves.toEqual({ credits: 35 })
    await expect(client.cost({ model: 'kling3_0', prompt: { instruction: 'x' }, settings: { duration: 5, aspectRatio: '16:9', mode: '4k' } })).resolves.toEqual({ credits: 30 })
    await expect(client.cost({ model: 'kling3_0', prompt: { instruction: 'x' }, settings: { duration: 5, aspectRatio: '16:9', mode: 'std' } })).resolves.toEqual({ credits: 123 })
    await expect(client.cost({ model: 'happy_horse_video', prompt: { instruction: 'x' }, settings: { duration: 5 } })).resolves.toEqual({ credits: 123 })
    await expect(client.cost({ model: 'grok_video', prompt: { instruction: 'x' }, settings: { duration: 6 } })).resolves.toEqual({ credits: 9 })
    await expect(client.cost({ model: 'grok_video_v15', prompt: { instruction: 'x' }, media: { start_image: ref('s.png') }, settings: { duration: 2, resolution: '720p' } })).resolves.toEqual({ credits: 9 })
    await expect(client.cost({ model: 'veo3_1_lite', prompt: { instruction: 'x' }, settings: { duration: 8, resolution: '1080p', generateAudio: false } })).resolves.toEqual({ credits: 12 })
    await expect(client.cost({ model: 'wan2_7', prompt: { instruction: 'x' }, settings: { duration: 5, quality: '1080p' } })).resolves.toEqual({ credits: 13 })
  })
})
