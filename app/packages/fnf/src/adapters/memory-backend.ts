import type { GenerationBackend } from '../backend'

/**
 * A backend implemented entirely in code — no network, no HTTP. Proves the port
 * is transport-agnostic: anything that satisfies `GenerationBackend` works with
 * the client core. Handy for tests, offline/demo modes, and local pipelines.
 *
 * Jobs are created as immediately `completed` with a synthetic result url.
 */
export interface MemoryBackendOptions {
  /** Credits returned by `estimateCost`. */
  cost?: number
  /** Build the result url for a created job (defaults to a synthetic path). */
  resultUrl?: (jobSetType: string, id: string) => string
}

interface MemoryJob {
  id: string
  job_set_type: string
  status: string
  params: Record<string, unknown>
  result_url: string
  created_at: number
}

export function createMemoryBackend(options: MemoryBackendOptions = {}): GenerationBackend {
  const jobs = new Map<string, MemoryJob>()
  const cost = options.cost ?? 1
  const resultUrl = options.resultUrl ?? ((jobSetType, id) => `memory://${jobSetType}/${id}.out`)
  let seq = 0

  return {
    async createJobs({ jobSetType, params }) {
      const id = `mem_${++seq}`
      jobs.set(id, {
        id,
        job_set_type: jobSetType,
        status: 'completed',
        params,
        result_url: resultUrl(jobSetType, id),
        created_at: seq,
      })
      return [id]
    },
    async getJob(id) {
      return jobs.get(id) ?? { id, status: 'failed', fail_reason: 'not found' }
    },
    async listJobs() {
      return { items: [...jobs.values()], next_cursor: null }
    },
    async estimateCost() {
      return { credits: cost }
    },
    async cancelJob(id) {
      const job = jobs.get(id)
      if (job)
        job.status = 'canceled'
      return {}
    },
  }
}
