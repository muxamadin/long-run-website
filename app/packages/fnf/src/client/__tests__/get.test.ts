import { describe, expect, it } from 'vitest'
import { makeClient } from '../testkit'

describe('get', () => {
  it('fetches a job by id and parses it', async () => {
    const client = makeClient(async () => ({
      status: 200,
      body: { id: 'j1', job_set_type: 'demo', status: 'completed', result_url: 'https://x/o.png', params: { prompt: 'cat' } },
    }))
    const gen = await client.get('j1')
    expect(gen).toMatchObject({ id: 'j1', status: 'completed' })
    expect(gen.input.prompt).toEqual({ instruction: 'cat' })
    expect(gen.results?.rawUrl).toBe('https://x/o.png')
  })
})
