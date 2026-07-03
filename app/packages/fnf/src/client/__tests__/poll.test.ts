import { describe, expect, it } from 'vitest'
import { JobAbortedError } from '../../errors'
import { makeClient } from '../testkit'

describe('poll', () => {
  it('polls until terminal', async () => {
    const seq = ['queued', 'in_progress', 'completed']
    let i = 0
    const client = makeClient(async () => ({
      status: 200,
      body: { id: 'j1', job_set_type: 'demo', status: seq[Math.min(i++, seq.length - 1)], result_url: 'https://x/o.png', params: {} },
    }))
    expect((await client.poll('j1')).status).toBe('completed')
    expect(i).toBe(3)
  })

  it('throws JobTimeoutError carrying the last-known generation when no terminal status is reached', async () => {
    const client = makeClient(
      async () => ({ status: 200, body: { id: 'j1', job_set_type: 'demo', status: 'in_progress', params: {} } }),
      { poll: { timeoutMs: 0 } },
    )
    await expect(client.poll('j1')).rejects.toMatchObject({
      code: 'timeout',
      generation: { id: 'j1', status: 'in_progress' },
    })
  })
})

describe('poll transient-error resilience', () => {
  const inProgress = { status: 200, body: { id: 'j1', job_set_type: 'demo', status: 'in_progress', params: {} } }
  const completed = { status: 200, body: { id: 'j1', job_set_type: 'demo', status: 'completed', result_url: 'https://x/o.png', params: {} } }
  const blip = { status: 503, body: { detail: 'service unavailable' } }

  it('a 5xx mid-poll is a missed tick: the loop retries and still reaches terminal', async () => {
    const replies = [inProgress, blip, completed]
    let i = 0
    const client = makeClient(async () => replies[Math.min(i++, replies.length - 1)])
    expect((await client.poll('j1')).status).toBe('completed')
    expect(i).toBe(3) // the failed tick retried instead of rejecting the poll
  })

  it('a thrown fetch (the adapter surfaces it as code network) is transient too', async () => {
    let i = 0
    const client = makeClient(async () => {
      if (i++ === 0)
        throw new Error('socket hang up')
      return completed
    })
    expect((await client.poll('j1')).status).toBe('completed')
    expect(i).toBe(2)
  })

  it('rethrows the last error once the consecutive-failure backstop trips (hard-down backend)', async () => {
    let gets = 0
    const client = makeClient(async () => {
      gets++
      return blip
    })
    await expect(client.poll('j1')).rejects.toMatchObject({ status: 503 })
    expect(gets).toBe(30) // MAX_CONSECUTIVE_TRANSIENT_FAILURES — ~a minute at the default interval
  })

  it('the failure counter resets on success — blips never accumulate across a long wait', async () => {
    const replies = [blip, blip, blip, blip, inProgress, blip, blip, blip, blip, completed]
    let i = 0
    const client = makeClient(async () => replies[Math.min(i++, replies.length - 1)])
    expect((await client.poll('j1')).status).toBe('completed')
    expect(i).toBe(replies.length)
  })

  it('a deterministic error (404) is immediately fatal — no retry', async () => {
    let gets = 0
    const client = makeClient(async () => {
      gets++
      return { status: 404, body: { detail: 'Job not found' } }
    })
    await expect(client.poll('j1')).rejects.toMatchObject({ status: 404 })
    expect(gets).toBe(1)
  })
})

describe('poll cancellation (AbortSignal)', () => {
  it('aborting mid-poll stops the loop with JobAbortedError', async () => {
    const controller = new AbortController()
    let gets = 0
    const client = makeClient(async () => {
      gets++
      return { status: 200, body: { id: 'j1', job_set_type: 'demo', status: 'in_progress', params: {} } }
    })
    const polling = client.poll('j1', {
      signal: controller.signal,
      onProgress: () => {
        if (gets >= 3)
          controller.abort()
      },
    })
    await expect(polling).rejects.toBeInstanceOf(JobAbortedError)
    const after = gets
    await new Promise(resolve => setTimeout(resolve, 10))
    expect(gets).toBe(after) // polling actually stopped
  })

  it('abort works while the scheduler reports inactive (paused loop stays cancellable)', async () => {
    const controller = new AbortController()
    const client = makeClient(
      async () => ({ status: 200, body: { id: 'j1', job_set_type: 'demo', status: 'in_progress', params: {} } }),
      {
        poll: { intervalMs: 5, timeoutMs: 60_000 },
        scheduler: { sleep: ms => new Promise(resolve => setTimeout(resolve, ms)), isActive: () => false },
      },
    )
    setTimeout(() => controller.abort(), 15)
    await expect(client.poll('j1', { signal: controller.signal })).rejects.toBeInstanceOf(JobAbortedError)
  })
})
