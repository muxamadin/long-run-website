import type { GenerationBackend } from '../../backend'
import type { JobEntry } from '../../define-job'
import { describe, expect, it } from 'vitest'
import { defineJob } from '../../define-job'
import { z } from '../../z'
import { createJobClient } from '../index'
import { imageJob, makeClient, recorder, videoJob } from '../testkit'

/**
 * The fnf prod surface has no list/cost routes (the adapter throws typed
 * not_supported — covered in dev-fnf-web-adapter.test.ts), so the client-side parsing
 * here is exercised through a stub backend that records the port calls.
 */
function stubClient(responses: { list?: unknown, cost?: unknown }, jobs: JobEntry[] = [imageJob, videoJob]) {
  const calls: { op: 'list' | 'cost', arg: unknown }[] = []
  const adapter: GenerationBackend = {
    createJobs: async () => [],
    getJob: async () => ({}),
    listJobs: async (query) => {
      calls.push({ op: 'list', arg: query })
      return responses.list
    },
    estimateCost: async (req) => {
      calls.push({ op: 'cost', arg: req })
      return responses.cost
    },
  }
  return { calls, client: createJobClient({ adapter, jobs, scheduler: { sleep: async () => {} } }) }
}

describe('list', () => {
  it('passes the query through the port and parses items/next_cursor', async () => {
    const { calls, client } = stubClient({
      list: {
        items: [{ id: 'j1', job_set_type: 'demo', status: 'completed', result_url: 'https://x/1.png', min_result_url: 'https://x/1.min.png', params: { prompt: 'cat', aspectRatio: '1:1' } }],
        next_cursor: 60,
      },
    })
    const { items, cursor } = await client.list({ type: 'image', cursor: 40, size: 20 })
    expect(calls[0]).toEqual({ op: 'list', arg: { type: 'image', cursor: 40, size: 20 } })
    expect(cursor).toBe(60)
    expect(items[0]).toMatchObject({ id: 'j1', model: 'demo' })
    expect(items[0].input.prompt).toEqual({ instruction: 'cat' })
    expect(items[0].results?.minUrl).toBe('https://x/1.min.png')
  })

  it('accepts the jobs/cursor response shape', async () => {
    const { client } = stubClient({ list: { jobs: [{ id: 'j2', job_set_type: 'demo', status: 'queued', params: {} }], cursor: 'tok' } })
    const { items, cursor } = await client.list()
    expect(cursor).toBe('tok')
    expect(items[0]).toMatchObject({ id: 'j2', status: 'queued' })
  })

  it('keeps unregistered job types as loose generations (raw params in extra)', async () => {
    const { client } = stubClient({ list: { items: [{ id: 'j3', job_set_type: 'mystery', status: 'completed', result_url: 'https://x/3.png', params: { foo: 1 } }], next_cursor: null } })
    const { items } = await client.list({ type: 'image' })
    expect(items[0]).toMatchObject({ model: 'mystery', type: 'image' })
    expect(items[0].input.extra).toEqual({ foo: 1 })
  })

  it('passes parentId through to the port (derived-children filter)', async () => {
    const { calls, client } = stubClient({ list: { items: [], next_cursor: null } })
    await client.list({ parentId: 'set-9' })
    expect(calls[0].arg).toEqual({ parentId: 'set-9' })
  })

  it('the fnf adapter lists via GET /jobs; the parentId filter has no prod route and stays typed not_supported', async () => {
    const client = makeClient(recorder({ jobs: [], has_more: false }).handler)
    expect((await client.list({ type: 'image' })).items).toEqual([])
    await expect(client.list({ parentId: 'set-9' })).rejects.toMatchObject({ code: 'not_supported' })
  })
})

describe('cost', () => {
  it('sends job_set_type + wire params through the port and returns credits', async () => {
    const { calls, client } = stubClient({ cost: { credits: 12 } })
    const estimate = await client.cost({ model: 'demo', prompt: { instruction: 'cat' }, settings: { aspectRatio: '1:1' } })
    expect(calls[0]).toEqual({ op: 'cost', arg: { jobSetType: 'demo', params: { prompt: 'cat', aspectRatio: '1:1' } } })
    expect(estimate.credits).toBe(12)
  })

  it('a model-local credits() answers without hitting the backend; null falls back', async () => {
    const priced = defineJob({
      jobSetType: 'priced',
      outputType: 'image',
      params: { settings: { quality: z._default(z.enum(['sd', 'hd']), 'sd'), batchSize: z.wire('batch_size', z.optional(z.number())) } },
      // fnf-web pattern: cost per job, derived from params; null = can't price
      // locally. input.settings is typed to THIS model's schema — no casts.
      credits: ({ settings }) => {
        if (settings.quality === 'sd')
          return 1
        return settings.batchSize != null ? 2 * settings.batchSize : null
      },
    })
    const { calls, client } = stubClient({ cost: { credits: 99 } }, [priced])

    const local = await client.cost({ model: 'priced', settings: { quality: 'hd', batchSize: 3 } })
    expect(local.credits).toBe(6)
    expect(calls).toHaveLength(0) // priced locally — no network

    // settings are PARSED before the calculator runs: quality defaults to 'sd'
    const defaulted = await client.cost({ model: 'priced', settings: {} })
    expect(defaulted.credits).toBe(1)
    expect(calls).toHaveLength(0)

    const fallback = await client.cost({ model: 'priced', settings: { quality: 'hd' } })
    expect(fallback.credits).toBe(99) // null → backend estimate
    expect(calls).toHaveLength(1)
  })

  it('models without a local credits() surface the fnf adapter as not_supported', async () => {
    const client = makeClient(recorder({ credits: 12 }).handler)
    await expect(client.cost({ model: 'demo', settings: { aspectRatio: '1:1' } })).rejects.toMatchObject({ code: 'not_supported' })
  })
})
