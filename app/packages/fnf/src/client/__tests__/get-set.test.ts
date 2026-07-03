import type { GenerationBackend } from '../../backend'
import { describe, expect, it } from 'vitest'
import { ApiJobError } from '../../errors'
import { createJobClient } from '../index'
import { imageJob } from '../testkit'

function setBackend(jobs: Array<Record<string, unknown>> | unknown, counts = { getJobSet: 0 }) {
  const adapter: GenerationBackend = {
    createJobs: async () => [],
    getJob: async () => ({}),
    getJobSet: async () => {
      counts.getJobSet++
      return jobs
    },
    listJobs: async () => ({ items: [] }),
    estimateCost: async () => ({ credits: 0 }),
  }
  return { client: createJobClient({ adapter, jobs: [imageJob] }), counts }
}

describe('getSet', () => {
  it('fetches every member of the set in ONE request, parsed in payload order', async () => {
    const { client, counts } = setBackend([
      { id: 'a', job_set_type: 'demo', status: 'completed', result_url: 'https://x/a.png', params: { prompt: 'cat' } },
      { id: 'b', job_set_type: 'demo', status: 'in_progress', params: { prompt: 'cat' } },
    ])
    const members = await client.getSet('set-1')
    expect(members.map(g => g.id)).toEqual(['a', 'b'])
    expect(members.map(g => g.status)).toEqual(['completed', 'in_progress'])
    expect(members[0].results?.rawUrl).toBe('https://x/a.png')
    expect(counts.getJobSet).toBe(1)
  })

  it('throws the typed not_supported when the adapter has no getJobSet', async () => {
    const adapter: GenerationBackend = {
      createJobs: async () => [],
      getJob: async () => ({}),
      listJobs: async () => ({ items: [] }),
      estimateCost: async () => ({ credits: 0 }),
    }
    const client = createJobClient({ adapter, jobs: [imageJob] })
    const err = await client.getSet('set-1').catch(e => e)
    expect(err).toBeInstanceOf(ApiJobError)
    expect((err as ApiJobError).code).toBe('not_supported')
  })

  it('fails fast on an unregistered job type (a local configuration error)', async () => {
    const { client } = setBackend([{ id: 'a', job_set_type: 'not_registered', status: 'queued' }])
    const err = await client.getSet('set-1').catch(e => e)
    expect(err).toBeInstanceOf(ApiJobError)
    expect((err as ApiJobError).code).toBe('unknown_model')
  })

  it('a non-array payload parses as an empty set', async () => {
    const { client } = setBackend({ unexpected: true })
    expect(await client.getSet('set-1')).toEqual([])
  })
})
