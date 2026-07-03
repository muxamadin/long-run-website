import type { TransportRequest } from '../index'
import { describe, expect, it } from 'vitest'
import { createDevFnfWebAdapter, createJobClient, nanoBanana2, seedance2_0 } from '../index'

describe('end-to-end via public surface', () => {
  it('submits, then polls to completion, returning a parsed Generation', async () => {
    const submitted: TransportRequest[] = []
    let polls = 0
    const adapter = createDevFnfWebAdapter({
      transport: async (req) => {
        if (req.method === 'POST') {
          submitted.push(req)
          // The product create response: { job_sets: [{ jobs }] }.
          return { status: 200, body: { job_sets: [{ id: 'set-9', type: 'nano_banana_2', jobs: [{ id: 'job-9', status: 'queued' }] }] } }
        }
        polls += 1
        const status = polls < 2 ? 'in_progress' : 'completed'
        const job = { id: 'job-9', job_set_type: 'nano_banana_2', status, results: { raw: { url: 'https://x/o.png' }, min: { url: 'https://x/o.min.png' } }, params: { prompt: 'a cat', aspect_ratio: '1:1', resolution: '2k' } }
        // wait() polls the SET (the generation carries jobSetId); get() reads the job
        return req.path.startsWith('/job-sets/')
          ? { status: 200, body: { id: 'set-9', type: 'nano_banana_2', jobs: [job] } }
          : { status: 200, body: job }
      },
    })
    const client = createJobClient({
      adapter,
      jobs: [nanoBanana2, seedance2_0],
      scheduler: { sleep: async () => {} },
    })

    const { generations } = await client.submit({
      model: 'nano_banana_2',
      prompt: { instruction: 'a cat' },
      media: { image: [{ id: 'u1', type: 'media_input', url: 'https://x/u1' }] },
      settings: { aspectRatio: '1:1', resolution: '2k' },
    })
    expect(submitted[0].path).toBe('/jobs/nano-banana-2') // jobSetType kebab-cased into the route
    expect(submitted[0].body).toMatchObject({ params: { prompt: 'a cat' } })
    expect(generations[0].status).toBe('queued')
    expect(generations[0].jobSetId).toBe('set-9')

    const [done] = await client.wait(generations)
    expect(done.status).toBe('completed')
    expect(done.results?.rawUrl).toBe('https://x/o.png')
    expect(done.results?.minUrl).toBe('https://x/o.min.png')
    expect(done.input.prompt).toEqual({ instruction: 'a cat' })

    // regenerate === submit(done.input). The read model carries `model: string`,
    // so a regenerate is cast onto the typed submit input (it's runtime-validated).
    const again = await client.submit(done.input as Parameters<typeof client.submit>[0])
    expect(again.generations[0].model).toBe('nano_banana_2')
  })
})
