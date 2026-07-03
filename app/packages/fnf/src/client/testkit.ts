import type { JobEntry } from '../define-job'
import type { ResolveJobRef } from '../media'
import type { TransportRequest } from '../transport'
import { createDevFnfWebAdapter } from '../adapters/dev-fnf-web-adapter'
import { defineJob } from '../define-job'
import { createMediaClient } from '../media'
import { z } from '../z'
import { createJobClient } from './index'

export const imageJob = defineJob({
  jobSetType: 'demo',
  outputType: 'image',
  params: {
    prompt: true,
    media: { field: 'input_images', format: 'unwrapped', roles: ['image'] },
    settings: { aspectRatio: z.aspectRatio(['1:1', '16:9']), batchSize: z.wire('batch_size', z.optional(z.number())) },
  },
})

export const videoJob = defineJob({
  jobSetType: 'demo_video',
  outputType: 'video',
  params: {
    prompt: true,
    media: { field: 'medias', format: 'wrapped', roles: ['start_image'] },
    settings: { duration: z.duration({ values: [5, 10] }), aspectRatio: z.aspectRatio(['16:9']) },
  },
})

export type Handler = (req: TransportRequest) => Promise<{ status: number, body: unknown }>

/** A transport that records every request and replies with a fixed result. */
export function recorder(body: unknown, status = 200) {
  const calls: TransportRequest[] = []
  const handler: Handler = async (req) => {
    calls.push(req)
    return { status, body }
  }
  return { calls, handler }
}

/** Build a job client over the fnf adapter (prod routes) wrapping the handler, with test defaults. */
export function makeClient(handler: Handler, opts: {
  jobs?: JobEntry[]
  poll?: { intervalMs?: number, timeoutMs?: number }
  scheduler?: { sleep?: (ms: number) => Promise<void>, isActive?: () => boolean }
} = {}) {
  return createJobClient({
    adapter: createDevFnfWebAdapter({ transport: handler }),
    jobs: opts.jobs ?? [imageJob, videoJob],
    ...(opts.poll ? { poll: opts.poll } : {}),
    scheduler: opts.scheduler ?? { sleep: async () => {} },
  })
}

/** Build a media client over the fnf adapter (prod routes) wrapping the handler. */
export function makeMediaClient(handler: Handler, opts: { resolveJob?: ResolveJobRef } = {}) {
  return createMediaClient({
    mediaAdapter: createDevFnfWebAdapter({ transport: handler }),
    ...(opts.resolveJob ? { resolveJob: opts.resolveJob } : {}),
  })
}
