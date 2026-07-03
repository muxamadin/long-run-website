import type { GenerationBackend } from '../../backend'
import type { Generation } from '../../types'
import { describe, expect, it } from 'vitest'
import { ApiJobError } from '../../errors'
import { createContext, createJobClient, pollJobSetGroup } from '../index'
import { imageJob } from '../testkit'

function member(id: string, jobSetId?: string): Generation {
  return {
    id,
    model: 'demo',
    type: 'image',
    status: 'queued',
    input: { model: 'demo', settings: {} },
    ...(jobSetId ? { jobSetId } : {}),
  }
}

/** A backend that scripts per-tick set payloads and counts both read paths. */
function setBackend(ticks: Array<Array<{ id: string, status: string }>>) {
  const counts = { getJob: 0, getJobSet: 0 }
  let tick = 0
  const adapter: GenerationBackend = {
    createJobs: async () => [],
    getJob: async (id) => {
      counts.getJob++
      return { id, job_set_type: 'demo', status: 'completed', params: {} }
    },
    getJobSet: async () => {
      const jobs = ticks[Math.min(tick++, ticks.length - 1)]
      counts.getJobSet++
      return jobs.map(j => ({ ...j, job_set_type: 'demo', result_url: j.status === 'completed' ? 'https://x/o.png' : null, params: {} }))
    },
    listJobs: async () => ({ items: [] }),
    estimateCost: async () => ({ credits: 0 }),
  }
  const client = createJobClient({ adapter, jobs: [imageJob], scheduler: { sleep: async () => {} } })
  return { client, counts }
}

describe('wait — set-aware polling', () => {
  it('polls a batch sharing a jobSetId with ONE getJobSet request per tick', async () => {
    const { client, counts } = setBackend([
      [{ id: 'a', status: 'in_progress' }, { id: 'b', status: 'in_progress' }],
      [{ id: 'a', status: 'completed' }, { id: 'b', status: 'completed' }],
    ])
    const done = await client.wait([member('a', 'set-1'), member('b', 'set-1')])
    expect(done.map(g => g.status)).toEqual(['completed', 'completed'])
    expect(counts.getJobSet).toBe(2) // one request per tick for the whole batch
    expect(counts.getJob).toBe(0) // per-job path never used
  })

  it('the ip gate holds: a set member stays non-terminal as ip_detect until the check settles', async () => {
    const { client, counts } = setBackend([
      [{ id: 'a', status: 'completed' }, { id: 'b', status: 'ip_detect' }], // completed but IP check pending
      [{ id: 'a', status: 'completed' }, { id: 'b', status: 'ip_detect' }],
      [{ id: 'a', status: 'completed' }, { id: 'b', status: 'completed' }],
    ])
    const seen: string[] = []
    const done = await client.wait(
      [member('a', 'set-1'), member('b', 'set-1')],
      { onProgress: g => g.id === 'b' && seen.push(g.status) },
    )
    expect(seen).toEqual(['ip_detect', 'ip_detect', 'completed']) // kept polling through the gate
    expect(done[1].status).toBe('completed')
    expect(counts.getJobSet).toBe(3)
  })

  it('mixes paths: set members go through getJobSet, setless generations through getJob', async () => {
    const { client, counts } = setBackend([[{ id: 'a', status: 'completed' }]])
    const done = await client.wait([member('a', 'set-1'), member('solo')])
    expect(done.map(g => g.status)).toEqual(['completed', 'completed'])
    expect(counts.getJobSet).toBe(1)
    expect(counts.getJob).toBe(1)
  })

  it('a set job that resolves no registered entry throws unknown_model fast — no timeout-length spin', async () => {
    let fetches = 0
    const adapter: GenerationBackend = {
      createJobs: async () => [],
      getJob: async () => ({}),
      getJobSet: async () => {
        fetches++
        return [{ id: 'a', job_set_type: 'mystery', status: 'in_progress', params: {} }]
      },
      listJobs: async () => ({ items: [] }),
      estimateCost: async () => ({ credits: 0 }),
    }
    const client = createJobClient({ adapter, jobs: [imageJob], scheduler: { sleep: async () => {} } })
    await expect(client.wait([{ ...member('a', 'set-1'), model: 'mystery' }])).rejects.toMatchObject({ code: 'unknown_model' })
    expect(fetches).toBe(1) // failed on the first payload, not after hammering to the deadline
  })

  it('a transient getJobSet failure is a missed tick for the whole set', async () => {
    let tick = 0
    const adapter: GenerationBackend = {
      createJobs: async () => [],
      getJob: async () => ({}),
      getJobSet: async () => {
        if (tick++ === 0)
          throw new ApiJobError('network', 'socket hang up')
        return [{ id: 'a', job_set_type: 'demo', status: 'completed', result_url: 'https://x/o.png', params: {} }]
      },
      listJobs: async () => ({ items: [] }),
      estimateCost: async () => ({ credits: 0 }),
    }
    const client = createJobClient({ adapter, jobs: [imageJob], scheduler: { sleep: async () => {} } })
    const done = await client.wait([member('a', 'set-1')])
    expect(done[0].status).toBe('completed')
    expect(tick).toBe(2)
  })

  it('throwOnFail fails fast on a failed set member while a sibling is still running', async () => {
    const { client, counts } = setBackend([
      [{ id: 'a', status: 'failed' }, { id: 'b', status: 'in_progress' }],
      [{ id: 'a', status: 'failed' }, { id: 'b', status: 'in_progress' }], // 'b' never settles
    ])
    await expect(client.wait([member('a', 'set-1'), member('b', 'set-1')], { throwOnFail: true }))
      .rejects
      .toMatchObject({ code: 'job_failed' }) // not a deadline-length 'timeout'
    expect(counts.getJobSet).toBe(1) // judged on the first payload, sibling poll aborted
  })

  it('pollJobSetGroup on an adapter without getJobSet throws the typed not_supported', async () => {
    const adapter: GenerationBackend = {
      createJobs: async () => [],
      getJob: async () => ({}),
      listJobs: async () => ({ items: [] }),
      estimateCost: async () => ({ credits: 0 }),
    }
    const ctx = createContext({ adapter, jobs: [imageJob] })
    await expect(pollJobSetGroup(ctx, 'set-1', [member('a', 'set-1')])).rejects.toMatchObject({ code: 'not_supported' })
  })

  it('falls back to per-job polling when the adapter has no getJobSet', async () => {
    let gets = 0
    const adapter: GenerationBackend = {
      createJobs: async () => [],
      getJob: async (id) => {
        gets++
        return { id, job_set_type: 'demo', status: 'completed', params: {} }
      },
      listJobs: async () => ({ items: [] }),
      estimateCost: async () => ({ credits: 0 }),
    }
    const client = createJobClient({ adapter, jobs: [imageJob], scheduler: { sleep: async () => {} } })
    const done = await client.wait([member('a', 'set-1'), member('b', 'set-1')])
    expect(done.map(g => g.status)).toEqual(['completed', 'completed'])
    expect(gets).toBe(2)
  })
})
