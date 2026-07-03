import type { TransportRequest } from '../../transport'
import { describe, expect, it, vi } from 'vitest'
import { createJobClient } from '../../client'
import { ValidationError } from '../../errors'
import { klingVideo } from '../../jobs/kling'
import { textToImageSoul } from '../../jobs/text2image-soul'
import { createFnfWebAdapter } from '../fnf-web-adapter'

function recordingTransport(respond: (req: TransportRequest) => unknown) {
  const calls: TransportRequest[] = []
  return {
    calls,
    transport: async (req: TransportRequest) => {
      calls.push(req)
      return { status: 200, body: respond(req) }
    },
  }
}

function prodJob(id: string, status = 'queued', extra: Record<string, unknown> = {}) {
  return {
    id,
    status,
    results: { raw: { url: `https://cdn/${id}.png` }, min: { url: `https://cdn/${id}.min.png` } },
    ip_check_finished: true,
    ...extra,
  }
}

describe('createFnfWebAdapter', () => {
  it('sends the async bearer token and posts to the kebab-cased per-type route', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ job_sets: [] }), { status: 200 }))
    const adapter = createFnfWebAdapter({
      baseUrl: 'https://fnf.higgsfield.ai',
      getToken: async () => 'clerk-jwt',
      fetch: fetchMock as unknown as typeof globalThis.fetch,
    })
    await adapter.createJobs({ jobSetType: 'text2image_soul', params: { prompt: 'x' } })

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://fnf.higgsfield.ai/jobs/text2image-soul')
    expect((init.headers as Headers).get('authorization')).toBe('Bearer clerk-jwt')
  })

  it('sends bearer and optional workspace headers on profile requests', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: 'u1' }), { status: 200 }))
    const adapter = createFnfWebAdapter({
      baseUrl: 'https://fnf.higgsfield.ai',
      getToken: async () => 'clerk-jwt',
      workspaceId: async () => 'workspace-1',
      fetch: fetchMock as unknown as typeof globalThis.fetch,
    })

    await adapter.getUser()

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://fnf.higgsfield.ai/user')
    expect((init.headers as Headers).get('authorization')).toBe('Bearer clerk-jwt')
    expect((init.headers as Headers).get('hf-workspace-id')).toBe('workspace-1')
  })

  it('flattens { job_sets } into normalized jobs the client parses into Generations', async () => {
    const { transport } = recordingTransport(req => req.method === 'POST'
      ? { job_sets: [{ id: 'set-1', type: 'text2image_soul', params: { prompt: 'x' }, created_at: 1, jobs: [prodJob('j1'), prodJob('j2')] }] }
      : prodJob('j1', 'completed'))
    const client = createJobClient({ adapter: createFnfWebAdapter({ transport }), jobs: [textToImageSoul] })

    const { generations } = await client.submit({ model: 'text2image_soul', prompt: { instruction: 'a cat' }, settings: { seed: 7 } })
    expect(generations.map(g => g.id)).toEqual(['j1', 'j2'])
    expect(generations[0].jobSetId).toBe('set-1')
    expect(generations[0].model).toBe('text2image_soul')
  })

  it('normalizes results.raw/min into result_url and gates completed on the IP check', async () => {
    const pendingIp = prodJob('j1', 'completed', { ip_check_finished: false, job_set_type: 'text2image_soul' })
    const { transport } = recordingTransport(() => pendingIp)
    const adapter = createFnfWebAdapter({ transport })

    const job = await adapter.getJob('j1') as { status: string, result_url: string }
    expect(job.status).toBe('ip_detect') // completed-but-unchecked is NOT terminal
    expect(job.result_url).toBe('https://cdn/j1.png')
  })

  it('presigns via /media/batch and confirms via /media/{id}/upload', async () => {
    const { calls, transport } = recordingTransport(req => req.path === '/media/batch'
      ? [{ id: 'm1', url: 'https://cdn/m1.png', upload_url: 'https://s3/put/m1', content_type: 'image/png' }]
      : { id: 'm1', status: 'uploaded' })
    const adapter = createFnfWebAdapter({ transport })

    const slot = await adapter.getUploadUrl!({ type: 'image', contentType: 'image/png' }) as { upload_url: string }
    expect(slot.upload_url).toBe('https://s3/put/m1')
    await adapter.confirmMedia!({ mediaId: 'm1', type: 'image', filename: 'cat.png' })
    expect(calls[1]).toMatchObject({ method: 'POST', path: '/media/m1/upload' })
  })

  it('presigns audio via POST /audio with { extension, name } and confirms with a bodiless POST', async () => {
    const { calls, transport } = recordingTransport(req => req.path === '/audio'
      ? { id: 'a1', url: 'https://cdn/a1.mp3', upload_url: 'https://s3/put/a1', content_type: 'audio/mpeg' }
      : { id: 'a1', type: 'audio_input', url: 'https://cdn/a1.mp3', status: 'uploaded' })
    const adapter = createFnfWebAdapter({ transport })

    const slot = await adapter.getUploadUrl!({ type: 'audio', filename: 'Track.MP3' }) as { upload_url: string }
    expect(calls[0]).toMatchObject({ method: 'POST', path: '/audio', body: { extension: 'mp3', name: 'Track.MP3' } })
    expect((calls[0].body as Record<string, unknown>).mimetype).toBeUndefined() // the audio plane keys on extension+name
    expect(slot.upload_url).toBe('https://s3/put/a1')

    await adapter.confirmMedia!({ mediaId: 'a1', type: 'audio' })
    expect(calls[1]).toMatchObject({ method: 'POST', path: '/audio/a1/upload' })
    expect(calls[1].body).toBeUndefined() // the product confirm is a bare POST
  })

  it('derives the audio extension from contentType when no filename is given', async () => {
    const { calls, transport } = recordingTransport(() => ({ id: 'a1', upload_url: 'https://s3/put/a1' }))
    const adapter = createFnfWebAdapter({ transport })

    await adapter.getUploadUrl!({ type: 'audio', contentType: 'audio/mpeg' })
    expect(calls[0].body).toMatchObject({ extension: 'mp3', name: 'upload.mp3' })
  })

  it('spreads req.extra into presign and confirm bodies (force_ip_check/surface ride it)', async () => {
    const { calls, transport } = recordingTransport(req => req.path === '/media/batch'
      ? [{ id: 'm1', upload_url: 'https://s3/put/m1' }]
      : { id: 'm1', status: 'uploaded' })
    const adapter = createFnfWebAdapter({ transport })

    await adapter.getUploadUrl!({ type: 'image', contentType: 'image/png', extra: { force_ip_check: true, surface: 'seedance_2' } })
    expect(calls[0].body).toMatchObject({ mimetypes: ['image/png'], source: 'user_upload', force_ip_check: true, surface: 'seedance_2' })

    await adapter.confirmMedia!({ mediaId: 'm1', type: 'image', filename: 'cat.png', forceIpCheck: true, extra: { surface: 'seedance_2' } })
    expect(calls[1].body).toMatchObject({ filename: 'cat.png', force_ip_check: true, surface: 'seedance_2' })
  })

  it('keeps the dedicated /video presign plane and spreads extra there too', async () => {
    const { calls, transport } = recordingTransport(() => ({ id: 'v1', upload_url: 'https://s3/put/v1' }))
    const adapter = createFnfWebAdapter({ transport })

    await adapter.getUploadUrl!({ type: 'video', contentType: 'video/mp4', extra: { force_ip_check: true } })
    expect(calls[0]).toMatchObject({ method: 'POST', path: '/video', body: { mimetype: 'video/mp4', force_ip_check: true } })
  })

  it('rejects audio extensions outside the backend wav/mp3/webm whitelist locally', async () => {
    const { calls, transport } = recordingTransport(() => ({ id: 'a1', upload_url: 'https://s3/put/a1' }))
    const adapter = createFnfWebAdapter({ transport })

    // AudioInputCreateSchema is Literal['wav','mp3','webm'] — m4a would 422 server-side.
    const err = await adapter.getUploadUrl!({ type: 'audio', filename: 'voice.m4a' }).catch((e: unknown) => e)
    expect(ValidationError.is(err)).toBe(true)
    expect((err as ValidationError).message).toMatch(/wav, mp3 or webm/)
    expect(calls).toHaveLength(0) // refused before reaching the backend

    await adapter.getUploadUrl!({ type: 'audio', filename: 'clip.webm' })
    expect(calls[0].body).toMatchObject({ extension: 'webm', name: 'clip.webm' })
  })

  it('presigns images without a content type as image/jpeg (the backend schema default)', async () => {
    const { calls, transport } = recordingTransport(() => [{ id: 'm1', upload_url: 'https://s3/put/m1' }])
    const adapter = createFnfWebAdapter({ transport })

    await adapter.getUploadUrl!({ type: 'image' })
    expect(calls[0].body).toMatchObject({ mimetypes: ['image/jpeg'] }) // octet-stream is outside the closed Literal
  })

  it('falls back to meta.fail_reason (seedance nests the converted string there)', async () => {
    const { transport } = recordingTransport(() => ({ id: 'j1', status: 'failed', meta: { fail_reason: 'Output flagged' } }))
    const adapter = createFnfWebAdapter({ transport })

    const job = await adapter.getJob('j1') as { status: string, fail_reason: string | null }
    expect(job.fail_reason).toBe('Output flagged')
  })

  it('normalizes the legacy raw \'waiting\' status to queued', async () => {
    const { transport } = recordingTransport(() => prodJob('j1', 'waiting'))
    const adapter = createFnfWebAdapter({ transport })

    const job = await adapter.getJob('j1') as { status: string }
    expect(job.status).toBe('queued')
  })

  it('cancels via PUT /jobs/{id}/cancel', async () => {
    const { calls, transport } = recordingTransport(() => ({ success: true }))
    const adapter = createFnfWebAdapter({ transport })

    const body = await adapter.cancelJob!('j1') as { success: boolean }
    expect(calls[0]).toMatchObject({ method: 'PUT', path: '/jobs/j1/cancel' })
    expect(body.success).toBe(true)
  })

  it('serves profile routes from the same adapter', async () => {
    const { calls, transport } = recordingTransport((req) => {
      if (req.path === '/workspaces')
        return []
      if (req.path === '/workspaces/wallet')
        return { workspace_id: 'w1', subscription_balance: 100, total_credits: 200, credits_balance: 50 }
      return { id: 'w1', name: 'Workspace', type: 'private', user_role: 'owner' }
    })
    const adapter = createFnfWebAdapter({ transport })

    await adapter.getUser()
    await adapter.listWorkspaces()
    await adapter.getCurrentWorkspace()
    await adapter.getWorkspaceWallet()
    await adapter.switchWorkspace({ workspaceId: 'w2' })

    expect(calls.map(c => ({ method: c.method, path: c.path, body: c.body }))).toEqual([
      { method: 'GET', path: '/user', body: undefined },
      { method: 'GET', path: '/workspaces', body: undefined },
      { method: 'GET', path: '/workspaces/details', body: undefined },
      { method: 'GET', path: '/workspaces/wallet', body: undefined },
      { method: 'POST', path: '/workspaces/context', body: { workspace_id: 'w2' } },
    ])
  })

  it('maps profile route errors through the typed error catalog', async () => {
    const adapter = createFnfWebAdapter({
      transport: async () => ({ status: 403, body: { detail: { error_type: 'workspace_selection_required' } } }),
    })

    await expect(adapter.getUser()).rejects.toMatchObject({ code: 'workspace_selection_required' })
  })

  it('lists via GET /jobs with repeatable filters and maps jobs/has_more/next_cursor', async () => {
    const { calls, transport } = recordingTransport(() => ({
      jobs: [prodJob('j1', 'waiting', { job_set_type: 'text2image_soul', created_at: 111.5, cost: 900 })],
      has_more: true,
    }))
    const adapter = createFnfWebAdapter({ transport })

    const body = await adapter.listJobs({
      type: 'video',
      cursor: 222.25,
      size: 10,
      status: ['queued', 'completed'],
      model: 'seedance_2_0',
    }) as { jobs: Array<Record<string, unknown>>, has_more: boolean, next_cursor?: number }

    expect(calls[0]).toMatchObject({
      method: 'GET',
      path: '/jobs?gen_type=video&cursor=222.25&size=10&status=queued&status=completed&job_set_type=seedance_2_0',
    })
    expect(body.has_more).toBe(true)
    expect(body.jobs[0]).toMatchObject({ id: 'j1', status: 'queued', job_set_type: 'text2image_soul', cost: 900 })
    expect(body.next_cursor).toBe(111.5) // the last item's created_at IS the cursor protocol
  })

  it('refuses listJobs parentId — GET /jobs has no parent filter', async () => {
    const { calls, transport } = recordingTransport(() => ({ jobs: [], has_more: false }))
    const adapter = createFnfWebAdapter({ transport })

    await expect(adapter.listJobs({ parentId: 'set-1' })).rejects.toMatchObject({ code: 'not_supported' })
    expect(calls).toHaveLength(0)
  })

  it('computes seedance cost from /job-sets/costs and caches the table per instance', async () => {
    const { calls, transport } = recordingTransport(() => ({
      data: [{
        job_set_type: 'seedance_2_0',
        cost: [
          {
            model: 'seedance_2_0',
            resolutions: [
              { resolution: '480p', cost_per_second: 3, original_cost_per_second: 6 },
              { resolution: '720p', cost_per_second: 4.5, original_cost_per_second: 6 },
              { resolution: '1080p', cost_per_second: 9, original_cost_per_second: 12 },
            ],
          },
          { model: 'seedance_2_0_fast', resolutions: [{ resolution: '720p', cost_per_second: 3.5, original_cost_per_second: 3.5 }] },
        ],
      }],
    }))
    const adapter = createFnfWebAdapter({ transport })

    const first = await adapter.estimateCost({
      jobSetType: 'seedance_2_0',
      params: { model: 'seedance_2_0', resolution: '720p', duration: 5, batch_size: 2 },
    }) as { credits: number }
    expect(first.credits).toBe(4500) // int(5 × 4.5 × 100) × 2 — the server's own charge formula

    const second = await adapter.estimateCost({
      jobSetType: 'seedance_2_0',
      params: { model: 'seedance_2_0_fast', resolution: '720p', duration: 10, batch_size: 1 },
    }) as { credits: number }
    expect(second.credits).toBe(3500)
    expect(calls.filter(c => c.path === '/job-sets/costs')).toHaveLength(1) // the table promise is cached
  })

  it('keeps the typed not_supported for job types absent from the cost table', async () => {
    const { calls, transport } = recordingTransport(() => ({ data: [] }))
    const adapter = createFnfWebAdapter({ transport })

    await expect(adapter.estimateCost({ jobSetType: 'kling', params: {} })).rejects.toMatchObject({ code: 'not_supported' })
    expect(calls).toHaveLength(1)
  })

  it('computes Kling mode/audio and flat resolution costs from /job-sets/costs', async () => {
    const { calls, transport } = recordingTransport(() => ({
      data: [
        { job_set_type: 'kling3_0', cost: [{ mode: 'std', audio: { off: 1.5, on: 2 } }, { mode: 'pro', audio: { off: 3, on: 4 } }] },
        { job_set_type: 'happy_horse_video', cost: [{ resolution: '720p', cost_per_second: 1.25, original_cost_per_second: 2 }] },
      ],
    }))
    const adapter = createFnfWebAdapter({ transport })

    await expect(adapter.estimateCost({
      jobSetType: 'kling3_0',
      params: { mode: 'pro', sound: 'on', duration: 5 },
    })).resolves.toEqual({ credits: 20 })

    await expect(adapter.estimateCost({
      jobSetType: 'happy_horse_video',
      params: { resolution: '720p', duration: 5, batch_size: 2 },
    })).resolves.toEqual({ credits: 14 })

    expect(calls.filter(c => c.path === '/job-sets/costs')).toHaveLength(1)
  })
})

describe('soul/kling wire params', () => {
  it('soul submits the /ai/image product defaults: table dims, steps 50, sampler fields, default style', async () => {
    const { calls, transport } = recordingTransport(() => ({ job_sets: [] }))
    const client = createJobClient({ adapter: createFnfWebAdapter({ transport }), jobs: [textToImageSoul] })
    await client.submit({ model: 'text2image_soul', prompt: { instruction: 'a cat' }, settings: { aspectRatio: '16:9', seed: 7 } }).catch(() => {})

    const params = (calls[0].body as { params: Record<string, unknown> }).params
    expect(params).toMatchObject({
      width: 2048, // SOUL_RESOLUTION_MAP 1080p 16:9, not a short-side box
      height: 1152,
      aspect_ratio: '16:9',
      steps: 50,
      sample_shift: 4,
      sample_guide_scale: 4,
      negative_prompt: '',
      batch_size: 1,
      quality: '1080p',
      style_id: '464ea177-8d40-4940-8d9d-b438bab269c7', // the product default style — never null/null (version:3 is dead weight the backend drops)
    })
  })

  it('kling takes dims from the start image, keeps the enum ratio, and snaps duration to 5|10 via adjust', async () => {
    const { calls, transport } = recordingTransport(() => ({ job_sets: [] }))
    const client = createJobClient({ adapter: createFnfWebAdapter({ transport }), jobs: [klingVideo] })

    const { input } = client.adjust(
      // 8 is deliberately out of the typed 5|10 union — adjust() exists for untyped/raw inputs
      {
        model: 'kling',
        prompt: { instruction: 'pan' },
        media: { input_image: { id: 'start', type: 'media_input', meta: { width: 720, height: 1280 } } },
        settings: { duration: 8 as unknown as 5, aspectRatio: '9:16' },
      },
      ['near-duration'],
    )
    expect(input.settings.duration).toBe(10) // host's >7 → 10 snap, via the SDK mechanism
    await client.submit(input).catch(() => {})

    const params = (calls[0].body as { params: Record<string, unknown> }).params
    expect(params).toMatchObject({ width: 720, height: 1280, model: 'kling-v2-5-turbo', resolution: '720p', duration: 10, mode: 'std' }) // mode derived, not an input; dead seed/cfg_scale not wired
    expect(params.aspect_ratio).toBe('9:16') // backend-enum value rides along
  })
})

describe('new image job adapter routes', () => {
  it('posts new v2 image models to their product routes', async () => {
    const { calls, transport } = recordingTransport(() => ({ job_sets: [] }))
    const adapter = createFnfWebAdapter({ transport })

    await adapter.createJobs({ jobSetType: 'text2image_soul_v2', params: { prompt: '', use_unlim: false, batch_size: 1 } })
    await adapter.createJobs({ jobSetType: 'soul_cinematic', params: { prompt: '', use_unlim: false, batch_size: 1 } })
    await adapter.createJobs({ jobSetType: 'gpt_image_2', params: { prompt: 'x', use_unlim: false, batch_size: 1 } })
    await adapter.createJobs({ jobSetType: 'imagegen_2_0', params: { prompt: 'x', use_unlim: false, batch_size: 1 } })
    await adapter.createJobs({ jobSetType: 'nano_banana_flash', params: { prompt: 'x', use_unlim: false, batch_size: 1 } })
    await adapter.createJobs({ jobSetType: 'recraft_v4_1', params: { prompt: 'x', use_unlim: false, batch_size: 1 } })

    expect(calls.map(c => c.path)).toEqual([
      '/jobs/v2/text2image_soul_v2',
      '/jobs/v2/soul_cinematic',
      '/jobs/v2/gpt_image_2',
      '/jobs/v2/gpt_image_2',
      '/jobs/v2/nano_banana_flash',
      '/jobs/v2/recraft_v4_1',
    ])
  })

  it('matches product body quirks for GPT/Recraft use_unlim and Nano Pro seedream bonus', async () => {
    const { calls, transport } = recordingTransport(() => ({ job_sets: [] }))
    const adapter = createFnfWebAdapter({ transport })

    await adapter.createJobs({ jobSetType: 'gpt_image_2', params: { prompt: 'x', use_unlim: true, batch_size: 1 } })
    await adapter.createJobs({ jobSetType: 'recraft_v4_1', params: { prompt: 'x', use_unlim: true, batch_size: 1 } })
    await adapter.createJobs({ jobSetType: 'nano_banana_2', params: { prompt: 'x', use_unlim: false, use_seedream_bonus: true, batch_size: 1 } })

    expect(calls[0].body).toEqual({ params: { prompt: 'x', batch_size: 1 }, use_unlim: true })
    expect(calls[1].body).toEqual({ params: { prompt: 'x', batch_size: 1 }, use_unlim: true })
    expect(calls[2].body).toEqual({
      params: { prompt: 'x', use_unlim: false, batch_size: 1 },
      use_unlim: false,
      use_seedream_bonus: true,
    })
  })
})

describe('new video job adapter routes', () => {
  it('posts screenshot video models to their v2 product routes', async () => {
    const { calls, transport } = recordingTransport(() => ({ job_sets: [] }))
    const adapter = createFnfWebAdapter({ transport })

    await adapter.createJobs({ jobSetType: 'kling3_0', params: { prompt: 'x', use_unlim: true, duration: 5 } })
    await adapter.createJobs({ jobSetType: 'kling3_0_motion_control', params: { prompt: 'x', use_unlim: true, duration: 5, isChain: false } })
    await adapter.createJobs({ jobSetType: 'happy_horse_video', params: { prompt: 'x', duration: 5 } })
    await adapter.createJobs({ jobSetType: 'grok_video', params: { prompt: 'x', use_unlim: true, duration: 5 } })
    await adapter.createJobs({ jobSetType: 'grok_video_v15', params: { prompt: 'x', use_unlim: true, duration: 5 } })
    await adapter.createJobs({ jobSetType: 'veo3_1_lite', params: { prompt: 'x', duration: 8 } })
    await adapter.createJobs({ jobSetType: 'wan2_7', params: { prompt: 'x', use_unlim: true, duration: 5 } })

    expect(calls.map(c => c.path)).toEqual([
      '/jobs/v2/kling3_0',
      '/jobs/v2/kling3_0_motion_control',
      '/jobs/v2/happy_horse_video',
      '/jobs/v2/grok_video',
      '/jobs/v2/grok_video_v15',
      '/jobs/v2/veo3_1_lite',
      '/jobs/v2/wan2_7',
    ])
    expect(calls[0].body).toMatchObject({ params: { prompt: 'x', duration: 5 }, use_unlim: true })
    expect(calls[3].body).toMatchObject({ params: { prompt: 'x', duration: 5 }, use_unlim: true })
    expect(calls[6].body).toMatchObject({ params: { prompt: 'x', duration: 5 }, use_unlim: true })
  })

  it('posts Motion Control chains to /chains/motion-control with chain-only params stripped', async () => {
    const { calls, transport } = recordingTransport(() => ({ job_sets: [] }))
    const adapter = createFnfWebAdapter({ transport })

    await adapter.createJobs({
      jobSetType: 'kling3_0_motion_control',
      params: {
        prompt: 'x',
        mode: 'pro',
        medias: [{ role: 'video', data: { id: 'v', type: 'video_input' } }],
        width: 1280,
        height: 720,
        background_source: 'input_video',
        isChain: true,
        character_orientation: 'image',
        duration: 5,
        use_unlim: true,
        use_free_gens: true,
        folder_id: 'folder-1',
      },
    })

    expect(calls[0]).toMatchObject({
      method: 'POST',
      path: '/chains/motion-control',
      body: {
        params: {
          mode: 'pro',
          medias: [{ role: 'video', data: { id: 'v', type: 'video_input' } }],
          width: 1280,
          height: 720,
          background_source: 'input_video',
          model_name: 'kling-v3',
          folder_id: 'folder-1',
        },
        use_unlim: true,
        use_free_gens: true,
      },
    })
  })
})

describe('upscale job adapter routes', () => {
  it('posts upscale jobs to product routes and preserves parent_id top-level', async () => {
    const { calls, transport } = recordingTransport(() => ({ job_sets: [] }))
    const adapter = createFnfWebAdapter({ transport })

    await adapter.createJobs({ jobSetType: 'topaz_image', params: { input_image: { id: 'i' }, width: 1, height: 1, output_width: 2, output_height: 2, parent_id: 'p1' } })
    await adapter.createJobs({ jobSetType: 'topaz_image_generative', params: { input_image: { id: 'i' }, width: 1, height: 1, output_width: 2, output_height: 2, parent_id: 'p2' } })
    await adapter.createJobs({ jobSetType: 'nano_banana_2_upscale', params: { input_images: [], resolution: '4k' } })
    await adapter.createJobs({ jobSetType: 'topaz_video', params: { input_video: { id: 'v' }, width: 1, height: 1, output_width: 2, output_height: 2, parent_id: 'p3' } })
    await adapter.createJobs({ jobSetType: 'bytedance_video_upscale', params: { medias: [], width: 1, height: 1, resolution: '2k' } })

    expect(calls.map(c => c.path)).toEqual([
      '/jobs/topaz-image',
      '/jobs/topaz-image-generative',
      '/jobs/nano-banana-2-upscale',
      '/jobs/topaz-video',
      '/jobs/bytedance-video-upscale',
    ])
    expect(calls[0].body).toMatchObject({ parent_id: 'p1', params: { width: 1, height: 1, output_width: 2, output_height: 2 } })
    expect(calls[1].body).toMatchObject({ parent_id: 'p2' })
    expect(calls[3].body).toMatchObject({ parent_id: 'p3' })
  })

  it('lifts use_unlim and strips nested output dimensions for simple video upscales', async () => {
    const { calls, transport } = recordingTransport(() => ({ job_sets: [] }))
    const adapter = createFnfWebAdapter({ transport })

    await adapter.createJobs({ jobSetType: 'video_upscale', params: { input_video: { id: 'v' }, width: 1280, height: 720, output_width: 3840, output_height: 2160, use_unlim: true, parent_id: 'p1' } })
    await adapter.createJobs({ jobSetType: 'video_deflicker', params: { input_video: { id: 'v' }, width: 1280, height: 720, output_width: 3840, output_height: 2160, use_unlim: true, parent_id: 'p2' } })

    expect(calls[0]).toMatchObject({
      method: 'POST',
      path: '/jobs/video-upscale',
      body: { params: { input_video: { id: 'v' }, width: 1280, height: 720 }, parent_id: 'p1', use_unlim: true },
    })
    expect(calls[1]).toMatchObject({
      method: 'POST',
      path: '/jobs/video-deflicker',
      body: { params: { input_video: { id: 'v' }, width: 1280, height: 720 }, parent_id: 'p2', use_unlim: true },
    })
  })

  it('uses dry-run submit routes for Topaz upscale costs', async () => {
    const { calls, transport } = recordingTransport(() => ({ cost: 17 }))
    const adapter = createFnfWebAdapter({ transport })

    await expect(adapter.estimateCost({ jobSetType: 'topaz_image', params: { width: 1, height: 1, output_width: 2, output_height: 2, parent_id: 'p1' } })).resolves.toEqual({ credits: 17 })
    await expect(adapter.estimateCost({ jobSetType: 'topaz_image_generative', params: { width: 1, height: 1, output_width: 2, output_height: 2 } })).resolves.toEqual({ credits: 17 })
    await expect(adapter.estimateCost({ jobSetType: 'topaz_video', params: { width: 1, height: 1, output_width: 2, output_height: 2 } })).resolves.toEqual({ credits: 17 })

    expect(calls.map(c => c.path)).toEqual([
      '/jobs/topaz-image?dry_run=true',
      '/jobs/topaz-image-generative?dry_run=true',
      '/jobs/topaz-video?dry_run=true',
    ])
    expect(calls[0].body).toMatchObject({ parent_id: 'p1', params: { width: 1, height: 1, output_width: 2, output_height: 2 } })
  })
})
