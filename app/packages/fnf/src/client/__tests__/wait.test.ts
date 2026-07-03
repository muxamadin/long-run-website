import type { Generation } from '../../types'
import { describe, expect, it } from 'vitest'
import { JobAbortedError } from '../../errors'
import { makeClient } from '../testkit'

const pending = (id: string): Generation => ({ id, model: 'demo', type: 'image', status: 'queued', input: { model: 'demo', settings: {} } })

describe('wait', () => {
  it('resolves a batch to terminal states', async () => {
    const seqs: Record<string, string[]> = { a: ['queued', 'completed'], b: ['in_progress', 'failed'] }
    const at: Record<string, number> = { a: 0, b: 0 }
    const client = makeClient(async (req) => {
      const id = req.path.split('/').pop() as string
      const s = seqs[id][Math.min(at[id]++, seqs[id].length - 1)]
      return { status: 200, body: { id, job_set_type: 'demo', status: s, result_url: 'https://x/o.png', params: {} } }
    })
    const done = await client.wait([pending('a'), pending('b')])
    expect(done.find(g => g.id === 'a')?.status).toBe('completed')
    expect(done.find(g => g.id === 'b')?.status).toBe('failed')
  })
})

describe('wait onProgress (per tick)', () => {
  it('fires on EVERY poll tick, including intermediate statuses', async () => {
    const seq = ['queued', 'in_progress', 'completed']
    let i = 0
    const client = makeClient(async () => ({
      status: 200,
      body: { id: 'j1', job_set_type: 'demo', status: seq[Math.min(i++, seq.length - 1)], result_url: 'https://x/o.png', params: {} },
    }))
    const seen: string[] = []
    await client.wait([pending('j1')], { onProgress: g => seen.push(g.status) })
    expect(seen).toEqual(['queued', 'in_progress', 'completed'])
  })

  it('fires once for an already-terminal input without fetching', async () => {
    let gets = 0
    const client = makeClient(async () => {
      gets++
      return { status: 200, body: { id: 'j1', job_set_type: 'demo', status: 'completed', params: {} } }
    })
    const terminal: Generation = { ...pending('j1'), status: 'completed' }
    const seen: string[] = []
    await client.wait([terminal], { onProgress: g => seen.push(g.status) })
    expect(seen).toEqual(['completed'])
    expect(gets).toBe(0)
  })
})

describe('wait throwOnFail (failure taxonomy)', () => {
  it('judges an already-terminal failed INPUT — same verdict as failing one tick later', async () => {
    let gets = 0
    const client = makeClient(async () => {
      gets++
      return { status: 200, body: { id: 'j1', job_set_type: 'demo', status: 'completed', params: {} } }
    })
    const failed: Generation = { ...pending('j1'), status: 'failed', failReason: 'boom' }
    await expect(client.wait([failed], { throwOnFail: true })).rejects.toThrow(/boom/)
    expect(gets).toBe(0) // never polled — the input itself is the verdict
  })

  it('ip_detected (the moderation sibling of nsfw) throws', async () => {
    const client = makeClient(async () => ({ status: 200, body: { id: 'j1', job_set_type: 'demo', status: 'ip_detected', params: {} } }))
    await expect(client.wait([pending('j1')], { throwOnFail: true })).rejects.toMatchObject({ code: 'job_failed' })
  })

  it('canceled resolves — a user action, not a failure', async () => {
    const client = makeClient(async () => ({ status: 200, body: { id: 'j1', job_set_type: 'demo', status: 'canceled', params: {} } }))
    const done = await client.wait([pending('j1')], { throwOnFail: true })
    expect(done[0].status).toBe('canceled')
  })
})

describe('wait transient-error resilience', () => {
  it('one 503 on a poller is a missed tick — the batch still resolves, siblings unaffected', async () => {
    const at: Record<string, number> = { 'job-a': 0, 'job-b': 0 }
    const client = makeClient(async (req) => {
      const id = req.path.split('/').pop() as string
      const tick = at[id]++
      if (id === 'job-a' && tick === 0)
        return { status: 503, body: { detail: 'unavailable' } }
      return { status: 200, body: { id, job_set_type: 'demo', status: tick >= 1 ? 'completed' : 'in_progress', result_url: 'https://x/o.png', params: {} } }
    })
    const done = await client.wait([pending('job-a'), pending('job-b')])
    expect(done.map(g => g.status)).toEqual(['completed', 'completed'])
  })
})

describe('wait cancellation + fail-fast', () => {
  it('an already-aborted signal rejects with JobAbortedError before any request', async () => {
    let gets = 0
    const client = makeClient(async () => {
      gets++
      return { status: 200, body: { id: 'j1', job_set_type: 'demo', status: 'in_progress', params: {} } }
    })
    const controller = new AbortController()
    controller.abort()
    await expect(client.wait([pending('j1')], { signal: controller.signal })).rejects.toBeInstanceOf(JobAbortedError)
    expect(gets).toBe(0)
  })

  it('throwOnFail aborts the surviving pollers after the first failure', async () => {
    let bGets = 0
    const client = makeClient(async (req) => {
      if (req.path.endsWith('/job-a'))
        return { status: 200, body: { id: 'job-a', job_set_type: 'demo', status: 'failed', fail_reason: 'boom', params: {} } }
      bGets++
      return { status: 200, body: { id: 'job-b', job_set_type: 'demo', status: 'in_progress', params: {} } } // would poll forever
    })
    await expect(client.wait([pending('job-a'), pending('job-b')], { throwOnFail: true })).rejects.toThrow(/boom/)
    const after = bGets
    await new Promise(resolve => setTimeout(resolve, 10))
    expect(bGets).toBe(after) // job-b's poller was aborted, not orphaned
  })
})
