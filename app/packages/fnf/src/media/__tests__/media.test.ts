import { describe, expect, it } from 'vitest'
import { makeMediaClient, recorder } from '../../client/testkit'
import { createMediaClient } from '../client'

describe('media.list', () => {
  it('passes the query through the port and maps items to media_input refs', async () => {
    const queries: unknown[] = []
    const media = createMediaClient({
      mediaAdapter: {
        async getMedia() {
          return {}
        },
        async listMedia(query) {
          queries.push(query)
          return { items: [{ id: 'm1', type: 'media_input', url: 'https://x/m1.png', created_at: 1 }], next_cursor: 5 }
        },
      },
    })
    const { items, cursor } = await media.list({ type: 'image', size: 2 })
    expect(queries[0]).toEqual({ type: 'image', size: 2 })
    expect(items).toEqual([{ id: 'm1', type: 'media_input', url: 'https://x/m1.png' }])
    expect(cursor).toBe(5)
  })

  it('surfaces the fnf adapter (prod routes, no media listing) as typed not_supported', async () => {
    await expect(makeMediaClient(recorder({}).handler).list({ type: 'image' })).rejects.toMatchObject({ code: 'not_supported' })
  })
})

describe('media.get', () => {
  it('gets media by id via the per-type route and normalizes to a MediaRef', async () => {
    const { calls, handler } = recorder({ id: 'v1', url: 'https://x/v1.mp4', type: 'video_input' })
    const ref = await makeMediaClient(handler).get('v1', 'video')
    expect(calls[0]).toMatchObject({ method: 'GET', path: '/input-videos/v1' })
    expect(ref).toEqual({ id: 'v1', type: 'video_input', url: 'https://x/v1.mp4' }) // backend discriminator preserved
  })
})

describe('media.resolve', () => {
  it('passes through urls and structured refs, falls back for bare ids', async () => {
    const client = makeMediaClient(recorder({}).handler)
    expect(await client.resolve(['https://x/cat.png'])).toEqual([{ id: 'https://x/cat.png', type: 'media_input', url: 'https://x/cat.png' }])
    expect(await client.resolve([{ id: 'm1', type: 'media_input' }])).toEqual([{ id: 'm1', type: 'media_input' }])
    expect(await client.resolve(['unknown'])).toEqual([{ id: 'unknown', type: 'media_input' }])
  })

  it('resolves a bare id to a job ref when a resolveJob is wired', async () => {
    const client = makeMediaClient(recorder({}).handler, {
      resolveJob: async id => (id === 'job-7' ? { id, type: 'video_job', url: 'https://x/out.mp4' } : undefined),
    })
    expect(await client.resolve(['job-7'])).toEqual([{ id: 'job-7', type: 'video_job', url: 'https://x/out.mp4' }])
    expect(await client.resolve(['nope'])).toEqual([{ id: 'nope', type: 'media_input' }])
  })
})
