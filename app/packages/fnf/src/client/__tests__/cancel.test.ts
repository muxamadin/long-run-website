import { describe, expect, it } from 'vitest'
import { createMemoryBackend } from '../../adapters/memory-backend'
import { createJobClient } from '../index'
import { imageJob } from '../testkit'

describe('cancel', () => {
  it('cancels a job server-side via the adapter', async () => {
    const client = createJobClient({ adapter: createMemoryBackend(), jobs: [imageJob] })
    const { generations } = await client.submit({ model: 'demo', settings: { aspectRatio: '1:1' } })

    await client.cancel(generations[0].id)
    expect((await client.get(generations[0].id)).status).toBe('canceled')
  })

  it('throws the typed cancel_not_supported error when the adapter has no cancelJob', async () => {
    // a bare port without the optional cancelJob capability
    const client = createJobClient({
      adapter: {
        createJobs: async () => [],
        getJob: async () => ({ id: 'j1', status: 'queued' }),
        listJobs: async () => ({ items: [] }),
        estimateCost: async () => ({ credits: 0 }),
      },
      jobs: [imageJob],
    })
    await expect(client.cancel('j1')).rejects.toMatchObject({ code: 'cancel_not_supported' })
  })
})
