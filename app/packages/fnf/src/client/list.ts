import type { Generation, GenerationStatus, OutputType } from '../types'
import type { GenerationContext } from './context'
import { observeAsync } from '../observability'
import { parseGeneration } from '../spec'

export interface ListOptions {
  /** Generation kind bucket (the backend expands it into per-type sets). */
  type?: OutputType
  /** Filter by terminal/progress statuses (repeatable). */
  status?: GenerationStatus | GenerationStatus[]
  /** Filter by model (`jobSetType`, repeatable). */
  model?: string | string[]
  cursor?: string | number
  size?: number
  /** List only the derived children of this job set (e.g. its upscales). */
  parentId?: string
}

export interface ListResult {
  items: Generation[]
  cursor?: string | number
}

export async function listGenerations(ctx: GenerationContext, opts: ListOptions = {}): Promise<ListResult> {
  return observeAsync(ctx.observability, 'fnf.job.list', {
    ...(opts.type ? { type: opts.type } : {}),
    ...(opts.size !== undefined ? { size: opts.size } : {}),
    ...(opts.cursor !== undefined ? { has_cursor: true } : {}),
    ...(opts.parentId ? { parent_id: opts.parentId } : {}),
    ...(opts.model !== undefined ? { model_count: Array.isArray(opts.model) ? opts.model.length : 1 } : {}),
    ...(opts.status !== undefined ? { status_count: Array.isArray(opts.status) ? opts.status.length : 1 } : {}),
  }, async () => {
    const body = (await ctx.adapter.listJobs(opts) ?? {}) as {
      items?: RawListItem[]
      jobs?: RawListItem[]
      next_cursor?: string | number | null
      cursor?: string | number | null
    }
    const items = (body.items ?? body.jobs ?? []).map(item => parseListItem(ctx, item, opts.type))
    const cursor = body.next_cursor ?? body.cursor ?? undefined
    return { items, ...(cursor != null ? { cursor } : {}) }
  }, {
    successAttributes: result => ({ item_count: result.items.length, has_cursor: result.cursor !== undefined }),
  })
}

interface RawListItem {
  id: string
  job_set_type?: string
  status?: string
  result_url?: string | null
  min_result_url?: string | null
  params?: Record<string, unknown>
  created_at?: number
}

function parseListItem(ctx: GenerationContext, item: RawListItem, fallbackType?: OutputType): Generation {
  const entry = item.job_set_type ? ctx.registry.get(item.job_set_type) : undefined
  if (entry) {
    return parseGeneration(
      {
        id: item.id,
        status: item.status ?? 'pending',
        result_url: item.result_url,
        min_result_url: item.min_result_url,
        params: item.params,
        created_at: item.created_at,
      },
      entry,
    )
  }
  // Unregistered job type: keep raw params in `extra` so nothing is dropped.
  const completed = item.status === 'completed' && Boolean(item.result_url)
  const results = completed
    ? { rawUrl: item.result_url as string, ...(item.min_result_url ? { minUrl: item.min_result_url } : {}) }
    : undefined
  return {
    id: item.id,
    model: item.job_set_type ?? 'unknown',
    type: fallbackType ?? 'image',
    status: (item.status ?? 'pending') as GenerationStatus,
    input: { model: item.job_set_type ?? 'unknown', settings: {}, ...(item.params ? { extra: item.params } : {}) },
    ...(results ? { results } : {}),
    ...(item.created_at !== undefined ? { createdAt: item.created_at } : {}),
  }
}
