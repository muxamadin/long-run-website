import type { Transport } from '../../transport'
import { describe, expect, it, vi } from 'vitest'
import { createDevFnfWebAdapter } from '../dev-fnf-web-adapter'

const transport: Transport = async () => ({ status: 200, body: {} })

describe('createDevFnfWebAdapter construction guard', () => {
  it('throws a clear error when neither userId nor transport is given', () => {
    expect(() => createDevFnfWebAdapter()).toThrow(/userId.*transport/i)
  })

  it('does not throw with userId (dev base url is baked in) or an explicit transport', () => {
    expect(() => createDevFnfWebAdapter({ userId: 'u' })).not.toThrow()
    expect(() => createDevFnfWebAdapter({ transport })).not.toThrow()
  })
})

describe('one adapter, both ports — prod routes only', () => {
  it('serves jobs (/jobs/*) and media (/media/*, /input-{type}s/{id}) from one object', async () => {
    const calls: { method: string, path: string }[] = []
    const adapter = createDevFnfWebAdapter({
      transport: async (req) => {
        calls.push({ method: req.method, path: req.path })
        return { status: 200, body: {} }
      },
    })

    await adapter.createJobs({ jobSetType: 'demo_video', params: {} })
    await adapter.createJobs({ jobSetType: 'seedance_2_0', params: {} })
    await adapter.getJob('j1')
    await adapter.getMedia({ id: 'm1', type: 'video' })
    await adapter.getUploadUrl?.({ type: 'image' })
    await adapter.confirmMedia?.({ mediaId: 'm1', type: 'image' })
    await adapter.getUser()
    await adapter.getCurrentWorkspace()

    expect(calls.map(c => c.path)).toEqual([
      '/jobs/demo-video', // jobSetType is kebab-cased into the per-type route
      '/jobs/v2/seedance_2_0', // newer types route under /jobs/v2/{snake_type}
      '/jobs/j1',
      '/input-videos/m1',
      '/media/batch',
      '/media/m1/upload',
      '/user',
      '/workspaces/details',
    ])
  })

  it('sends the dev user and optional workspace headers', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: 'u1' }), { status: 200 }))
    const adapter = createDevFnfWebAdapter({
      baseUrl: 'https://dev-fnf.higgsfield.ai',
      userId: 'dev-user',
      workspaceId: () => 'workspace-1',
      fetch: fetchMock as unknown as typeof globalThis.fetch,
    })

    await adapter.getUser()

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://dev-fnf.higgsfield.ai/user')
    expect((init.headers as Headers).get('hf-dev-user-id')).toBe('dev-user')
    expect((init.headers as Headers).get('hf-workspace-id')).toBe('workspace-1')
  })

  it('clamps top-level use_unlim to false when batch_size > 1 (the product rule)', async () => {
    const bodies: unknown[] = []
    const adapter = createDevFnfWebAdapter({
      transport: async (req) => {
        bodies.push(req.body)
        return { status: 200, body: {} }
      },
    })
    await adapter.createJobs({ jobSetType: 'demo', params: { use_unlim: true, batch_size: 3 } })
    await adapter.createJobs({ jobSetType: 'demo', params: { use_unlim: true, batch_size: 1 } })
    await adapter.createJobs({ jobSetType: 'demo', params: { use_unlim: true } })

    expect((bodies[0] as { use_unlim: boolean }).use_unlim).toBe(false) // batched → never unlimited
    expect((bodies[1] as { use_unlim: boolean }).use_unlim).toBe(true)
    expect((bodies[2] as { use_unlim: boolean }).use_unlim).toBe(true)
  })

  it('uploads videos through the video plane: POST /video presign, trim bounds on the confirm query', async () => {
    const calls: { path: string, body: unknown }[] = []
    const adapter = createDevFnfWebAdapter({
      transport: async (req) => {
        calls.push({ path: req.path, body: req.body })
        return { status: 200, body: { id: 'v1', upload_url: 'https://s3/put/v1' } }
      },
    })
    await adapter.getUploadUrl!({ type: 'video', contentType: 'video/mp4' })
    await adapter.confirmMedia!({ mediaId: 'v1', type: 'video', startSeconds: 2.5, endSeconds: 8, forceIpCheck: true })

    expect(calls[0]).toEqual({ path: '/video', body: { mimetype: 'video/mp4' } })
    expect(calls[1].path).toBe('/video/v1/upload?start_seconds=2.5&end_seconds=8')
    expect(calls[1].body).toEqual({ force_nsfw_check: false, force_ip_check: true })
  })

  it('getJobSet hits /job-sets/{id} and applies the IP gate to the set jobs', async () => {
    const adapter = createDevFnfWebAdapter({
      transport: async req => ({
        status: 200,
        body: {
          id: 'set-1',
          type: 'demo',
          _path: req.path,
          jobs: [
            { id: 'a', status: 'completed', ip_check_finished: true, results: { raw: { url: 'https://x/a.png' } } },
            // completed but the IP check hasn't settled → NOT terminal yet
            { id: 'b', status: 'completed', ip_check_finished: false },
          ],
        },
      }),
    })
    const jobs = await adapter.getJobSet!('set-1') as Array<{ id: string, status: string, result_url: string | null }>
    expect(jobs.map(j => j.status)).toEqual(['completed', 'ip_detect'])
    expect(jobs[0].result_url).toBe('https://x/a.png')
  })

  it('capabilities the prod surface lacks throw typed not_supported', async () => {
    const adapter = createDevFnfWebAdapter({ transport })
    await expect(adapter.listMedia({ type: 'image' })).rejects.toMatchObject({ code: 'not_supported' })
    // cost works only for the types GET /job-sets/costs covers (seedance_2_0)
    await expect(adapter.estimateCost({ jobSetType: 'demo', params: {} })).rejects.toMatchObject({ code: 'not_supported' })
    // the list route exists, but it has no parent_id filter
    await expect(adapter.listJobs({ parentId: 'set-1' })).rejects.toMatchObject({ code: 'not_supported' })
  })
})

describe('network-level failures stay in the typed catalog', () => {
  const offline: Transport = async () => {
    throw new TypeError('Failed to fetch')
  }

  it('a rejecting transport surfaces as ApiJobError with code network', async () => {
    const adapter = createDevFnfWebAdapter({ transport: offline })
    await expect(adapter.getJob('j1')).rejects.toMatchObject({ code: 'network' })
    await expect(adapter.getMedia({ id: 'm1', type: 'image' })).rejects.toMatchObject({ code: 'network' })
    await expect(adapter.getUser()).rejects.toMatchObject({ code: 'network' })
  })
})
