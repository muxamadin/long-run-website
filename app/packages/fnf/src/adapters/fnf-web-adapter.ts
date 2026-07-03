import type { ConfirmMediaRequest, GenerationBackend, JobListQuery, MediaBackend, MediaGetQuery, MediaListQuery, ProfileBackend, SwitchWorkspaceRequest, UploadUrlRequest } from '../backend'
import type { FnfObservabilityOptions } from '../observability'
import type { JobResponse } from '../spec'
import type { Transport, TransportResponse } from '../transport'
import { ApiJobError, errorFromResponse, ValidationError } from '../errors'
import { withObservedTransport } from '../observability'
import { createFetchTransport } from './fetch-transport'

/**
 * THE concrete adapter shape for the fnf backend — one object that satisfies
 * both ports, so it plugs into `createJobClient({ adapter })` and
 * `createMediaClient({ mediaAdapter })` alike.
 */
export interface FnfAdapter extends GenerationBackend, MediaBackend, ProfileBackend {}

type MaybePromise<T> = T | Promise<T>

/**
 * Adapter for the PRODUCT fnf API surface (the one fnf-web itself talks to):
 * user-scoped Bearer auth and per-type job routes. This is the adapter for
 * in-app consumers — e.g. the supercomputer app-viewer host SDK — where the
 * caller has a Clerk session, not the service secret. For the dev backend
 * (header auth instead of a Clerk session) use `createDevFnfWebAdapter`, which
 * delegates here — there is only ONE route surface.
 *
 *   jobs:  POST /jobs/{route}  ·  GET /jobs/{id}  ·  GET /job-sets/{id}
 *          GET /jobs (list)  ·  PUT /jobs/{id}/cancel  ·  GET /job-sets/costs
 *   media: POST /media/batch (presign)  ·  POST /media/{id}/upload (confirm)
 *          POST /video · /video/{id}/upload  ·  POST /audio · /audio/{id}/upload
 *          GET /input-{type}s/{id}
 *
 * Responses are normalized to the SDK's wire shape here (results.raw.url →
 * result_url, etc.), so the client core stays adapter-agnostic. A `completed`
 * job whose IP check hasn't finished maps to the non-terminal `ip_detect`, so
 * `wait()` keeps polling until the check settles — same gate the product uses.
 */
export interface FnfWebAdapterOptions {
  /** API origin, e.g. "https://fnf.higgsfield.ai". */
  baseUrl?: string
  /** Async bearer-token source (e.g. Clerk's `getToken`). */
  getToken?: () => Promise<string | null>
  /** Optional active workspace id source, sent as `hf-workspace-id` on every request. */
  workspaceId?: string | (() => MaybePromise<string | null | undefined>)
  fetch?: typeof globalThis.fetch
  /** Inject a transport directly (tests / custom). Overrides baseUrl/getToken/fetch. */
  transport?: Transport
  observability?: FnfObservabilityOptions
  /** Per-jobSetType route overrides; default route is the kebab-cased type. */
  routes?: Record<string, string>
}

// Newer job types submit under /jobs/v2/{snake_type} instead of the kebab-cased
// v1 route (fnf-web: submitVideoSeedance2_0Job). Extendable via options.routes.
const DEFAULT_ROUTES: Record<string, string> = {
  bytedance_video_upscale: 'bytedance-video-upscale',
  gpt_image_2: 'v2/gpt_image_2',
  imagegen_2_0: 'v2/gpt_image_2',
  grok_video: 'v2/grok_video',
  grok_video_v15: 'v2/grok_video_v15',
  happy_horse_video: 'v2/happy_horse_video',
  kling3_0: 'v2/kling3_0',
  kling3_0_motion_control: 'v2/kling3_0_motion_control',
  nano_banana_flash: 'v2/nano_banana_flash',
  nano_banana_2_upscale: 'nano-banana-2-upscale',
  recraft_v4_1: 'v2/recraft_v4_1',
  seedance_2_0: 'v2/seedance_2_0',
  soul_cinematic: 'v2/soul_cinematic',
  text2image_soul_v2: 'v2/text2image_soul_v2',
  veo3_1_lite: 'v2/veo3_1_lite',
  wan2_7: 'v2/wan2_7',
}

const DRY_RUN_COST_ROUTES = new Set([
  'topaz_image',
  'topaz_image_generative',
  'topaz_video',
])

// Job types whose product submitter strips use_unlim OUT of the nested params
// (sending it top-level only) — see createJobs.
const STRIP_NESTED_USE_UNLIM = new Set([
  'gpt_image_2',
  'grok_video',
  'grok_video_v15',
  'imagegen_2_0',
  'kling',
  'kling3_0',
  'kling3_0_motion_control',
  'recraft_v4_1',
  'video_deflicker',
  'video_upscale',
  'wan2_7',
])

const STRIP_NESTED_OUTPUT_DIMS = new Set([
  'video_deflicker',
  'video_upscale',
])

interface ProdJob {
  id: string
  status: string
  results?: { raw?: { url?: string }, min?: { url?: string } }
  // Some responses carry the urls flat instead of nested under `results`.
  result_url?: string | null
  min_result_url?: string | null
  fail_reason?: string | null
  // No serializer emits a top-level fail_reason; seedance_2_0 nests a converted
  // string at meta.fail_reason on GET /jobs/{id} for failed/nsfw jobs only
  // (fnf-api src/use_cases/job/v2/seedance_2_0.py:298-316).
  meta?: { fail_reason?: string } & Record<string, unknown>
  // Computed per-item on GET /jobs list responses (fnf-api src/handlers/
  // job.py:1259-1267): total job-set charge ÷ batch_size, or null.
  cost?: number | null
  ip_check_finished?: boolean | null
  created_at?: number
  job_set_type?: string
  job_set_id?: string
  job_set_parent_id?: string | null
  params?: Record<string, unknown>
}

// GET /job-sets/costs entries (fnf-web src/entities/credits-config/api).
interface CostConfigItem {
  job_set_type?: string
  cost?: CostConfigEntry[]
}

type CostConfigEntry = SeedanceCostModel | KlingCostModel | ResolutionCostModel

interface SeedanceCostModel {
  model: string
  resolutions: ResolutionCostModel[]
}

interface KlingCostModel {
  mode: string
  audio: Record<string, number>
}

interface ResolutionCostModel {
  resolution: string
  cost_per_second: number
  original_cost_per_second?: number
}

interface ProdJobSet {
  id: string
  type?: string
  parent_id?: string | null
  params?: Record<string, unknown>
  jobs?: ProdJob[]
  created_at?: number
}

export function createFnfWebAdapter(options: FnfWebAdapterOptions = {}): FnfAdapter {
  if (!options.transport && !options.baseUrl)
    throw new Error('createFnfWebAdapter requires `baseUrl` (e.g. "https://fnf.higgsfield.ai") or an explicit `transport`')
  const baseTransport = options.transport ?? createFetchTransport({
    baseUrl: (options.baseUrl ?? '').replace(/\/$/, ''),
    headers: async (): Promise<Record<string, string>> => {
      const token = await options.getToken?.()
      const workspaceId = typeof options.workspaceId === 'function' ? await options.workspaceId() : options.workspaceId
      return cleanHeaders({
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(workspaceId ? { 'hf-workspace-id': workspaceId } : {}),
      })
    },
    fetch: options.fetch,
  })
  const transport = options.observability ? withObservedTransport(baseTransport, options.observability) : baseTransport

  async function send(method: 'GET' | 'POST' | 'PUT', path: string, body?: unknown): Promise<unknown> {
    let res: TransportResponse
    try {
      res = await transport({ method, path, body })
    }
    catch (err) {
      if (err instanceof ApiJobError)
        throw err
      throw new ApiJobError('network', `Network error: ${err instanceof Error ? err.message : String(err)}`)
    }
    const error = errorFromResponse(res.status, res.body)
    if (error)
      throw error
    return res.body
  }

  const routeFor = (jobSetType: string): string =>
    options.routes?.[jobSetType] ?? DEFAULT_ROUTES[jobSetType] ?? jobSetType.replace(/_/g, '-')

  // GET /job-sets/costs is a static config table (fnf-api src/routers/
  // job_set.py:8, src/handlers/job_set.py:252-382) — fetched lazily, once per
  // adapter instance. A failed fetch is not cached; the next estimate retries.
  let costsPromise: Promise<CostConfigItem[]> | undefined
  const costs = (): Promise<CostConfigItem[]> => {
    costsPromise ??= (async () => {
      try {
        const body = await send('GET', '/job-sets/costs') as { data?: CostConfigItem[] } | CostConfigItem[]
        return Array.isArray(body) ? body : body.data ?? []
      }
      catch (err) {
        costsPromise = undefined
        throw err
      }
    })()
    return costsPromise
  }

  return {
    // ── jobs ──
    async createJobs({ jobSetType, params }) {
      // The product lifts parent_id out of params to the top level of the body
      // (see fnf-web submitImageNanoBanana2Job); folder_id stays inside params.
      const { parent_id, ...rest } = params as Record<string, unknown> & {
        parent_id?: string
        use_seedream_bonus?: boolean
        use_unlim?: boolean
        use_free_gens?: boolean
        batch_size?: number
      }
      // use_unlim normally rides BOTH inside params and at the top level (the
      // product's soul/nano submitters keep the nested copy) — except kling,
      // where the product strips it from params (entities/job/model/submit/
      // kling.ts destructures it out). Mirror that byte-for-byte instead of
      // assuming the backend tolerates a nested copy it never receives.
      const useUnlim = rest.use_unlim === true
      if (STRIP_NESTED_USE_UNLIM.has(jobSetType))
        delete rest.use_unlim
      if (STRIP_NESTED_OUTPUT_DIMS.has(jobSetType)) {
        delete rest.output_width
        delete rest.output_height
      }
      const useFreeGens = rest.use_free_gens === true
      delete rest.use_free_gens
      const useSeedreamBonus = jobSetType === 'nano_banana_2' ? rest.use_seedream_bonus : undefined
      if (jobSetType === 'nano_banana_2')
        delete rest.use_seedream_bonus
      if (jobSetType === 'kling3_0_motion_control' && rest.isChain === true) {
        const chainParams = chainMotionControlParams(rest)
        const body = await send('POST', '/chains/motion-control', {
          params: chainParams,
          use_unlim: useUnlim,
          use_free_gens: useFreeGens,
          ...(parent_id !== undefined ? { parent_id } : {}),
        })
        const jobSets = (body as { job_sets?: ProdJobSet[] } | null)?.job_sets
        if (Array.isArray(jobSets))
          return jobSets.flatMap(set => (set.jobs ?? []).map(job => mapJob(job, set)))
        return body
      }
      // Batched submits cannot ride unlimited mode — the product clamps the
      // top-level flag to false when batch_size > 1 (submitImageNanoBanana2Job).
      const batchSize = typeof rest.batch_size === 'number' ? rest.batch_size : 1
      const body = await send('POST', `/jobs/${routeFor(jobSetType)}`, {
        params: rest,
        use_unlim: batchSize > 1 ? false : useUnlim,
        ...(useFreeGens ? { use_free_gens: true } : {}),
        ...(jobSetType === 'nano_banana_2' ? { use_seedream_bonus: !!useSeedreamBonus } : {}),
        ...(parent_id !== undefined ? { parent_id } : {}),
      })
      // Flatten the product's { job_sets: [{ jobs }] } into normalized job objects.
      const jobSets = (body as { job_sets?: ProdJobSet[] } | null)?.job_sets
      if (Array.isArray(jobSets))
        return jobSets.flatMap(set => (set.jobs ?? []).map(job => mapJob(job, set)))
      // Other response shapes (bare ids, a single job object) — the client's
      // submit normalization handles them.
      return body
    },
    // NOTE: GET /jobs/{id} (ApiBaseJobInsideOut) carries ip_check_finished as
    // a required field, and the product reads it when polling single jobs
    // (api-job-set-model.ts, job-api.ts getJobById) — so the IP gate in mapJob
    // fires on this read too. wait()/poll() still prefer getJobSet below when
    // a generation has a jobSetId — one request per batch per tick — but
    // that's an efficiency win, not the only path that sees the gate.
    getJob: async id => mapJob(await send('GET', `/jobs/${encodeURIComponent(id)}`) as ProdJob),
    async getJobSet(id) {
      const body = await send('GET', `/job-sets/${encodeURIComponent(id)}`) as ProdJobSet
      // The set payload's jobs DO carry ip_check_finished/ip_detected, so the
      // completed-with-unfinished-IP-check → 'ip_detect' gate works here.
      return (body.jobs ?? []).map(job => mapJob(job, body))
    },
    async listJobs(query: JobListQuery) {
      // GET /jobs (fnf-api src/routers/job.py:413 → src/handlers/job.py:1280-1301).
      // The route has NO parent-id filter — a job set's derived children are not
      // reachable here, so refuse rather than silently return the unfiltered feed.
      if (query.parentId !== undefined)
        throw new ApiJobError('not_supported', 'GET /jobs has no parent filter — the prod surface cannot list a job set\'s children (parentId)')
      const qs = new URLSearchParams()
      // gen_type expands server-side into per-type job_set_type buckets; 'video'
      // excludes the speak types (handlers/job.py:1198-1205).
      if (query.type !== undefined)
        qs.append('gen_type', query.type)
      // cursor is a float created_at timestamp (handlers/job.py:1286).
      if (query.cursor !== undefined)
        qs.set('cursor', String(query.cursor))
      if (query.size !== undefined)
        qs.set('size', String(query.size))
      // Repeatable filters, one pair per value: 'status' (handlers/job.py:1285)
      // and 'job_set_type' (dependencies/job_set_type.py:9-21 — singular alias).
      for (const status of asArray(query.status))
        qs.append('status', status)
      for (const model of asArray(query.model))
        qs.append('job_set_type', model)
      const search = qs.toString()
      const body = await send('GET', `/jobs${search ? `?${search}` : ''}`) as { jobs?: ProdJob[], has_more?: boolean }
      // Every serializer the list dispatches to emits job_set_type (legacy
      // utils/job.py:476, v2 abc_.py:286, v1 services/job_sets/*), so the
      // client's registry resolution always has a type to key on; the computed
      // per-item 'cost' (handlers/job.py:1259-1267) rides along.
      const jobs = (body.jobs ?? []).map(job => ({
        ...mapJob(job),
        ...(job.cost !== undefined ? { cost: job.cost } : {}),
      }))
      // The cursor protocol is the last item's created_at: the next page filters
      // strictly past it (db/job.py:713-722), so surface it as next_cursor.
      const last = jobs[jobs.length - 1]
      return {
        jobs,
        has_more: body.has_more ?? false,
        ...(body.has_more && last?.created_at !== undefined ? { next_cursor: last.created_at } : {}),
      }
    },
    async estimateCost({ jobSetType, params }) {
      if (DRY_RUN_COST_ROUTES.has(jobSetType)) {
        const { parent_id, ...rest } = params as Record<string, unknown> & { parent_id?: string }
        const body = await send('POST', `/jobs/${routeFor(jobSetType)}?dry_run=true`, {
          params: rest,
          ...(parent_id !== undefined ? { parent_id } : {}),
        }) as { cost?: number, credits?: number, credits_exact?: number }
        const credits = body.cost ?? body.credits ?? body.credits_exact
        if (typeof credits !== 'number')
          throw new ApiJobError('not_supported', `dry-run cost for '${jobSetType}' returned no numeric cost`)
        return { credits }
      }

      const table = await costs()
      const item = table.find(entry => entry.job_set_type === jobSetType)
      if (!item?.cost)
        throw new ApiJobError('not_supported', `GET /job-sets/costs lists no cost table for '${jobSetType}'`)

      const batchSize = typeof params.batch_size === 'number' ? params.batch_size : 1
      const duration = typeof params.duration === 'number' ? params.duration : undefined
      if (duration === undefined)
        throw new ValidationError(`estimateCost(${jobSetType}) requires wire params with \`duration\``)

      if (jobSetType === 'seedance_2_0') {
        const model = typeof params.model === 'string' ? params.model : 'seedance_2_0'
        const resolution = stringParam(params, 'resolution')
        const modelRow = item.cost.find((entry): entry is SeedanceCostModel => isSeedanceCost(entry) && entry.model === model)
        const perSecond = modelRow?.resolutions.find(r => r.resolution === resolution)?.cost_per_second
        if (perSecond === undefined)
          throw new ApiJobError('not_supported', `GET /job-sets/costs lists no seedance_2_0 cost for model '${model}' at '${resolution}'`)
        // The server charge is int(duration * cost_per_second * 100) * batch_size
        // (src/use_cases/job/v2/seedance_2_0.py:202-217).
        return { credits: Math.trunc(duration * perSecond * 100) * batchSize }
      }

      if (jobSetType === 'kling3_0') {
        const mode = stringParam(params, 'mode', 'std')
        const sound = stringParam(params, 'sound', 'off')
        const modeRow = item.cost.find((entry): entry is KlingCostModel => isKlingCost(entry) && entry.mode === mode)
        const perSecond = modeRow?.audio[sound]
        if (perSecond === undefined)
          throw new ApiJobError('not_supported', `GET /job-sets/costs lists no kling3_0 cost for mode '${mode}' and sound '${sound}'`)
        return { credits: duration * perSecond }
      }

      const resolution = stringParam(params, 'resolution')
      const row = item.cost.find((entry): entry is ResolutionCostModel => isResolutionCost(entry) && entry.resolution === resolution)
      if (!row)
        throw new ApiJobError('not_supported', `GET /job-sets/costs lists no '${jobSetType}' cost for resolution '${resolution}'`)
      return { credits: Math.ceil(duration * row.cost_per_second) * batchSize }
    },
    // PUT /jobs/{job_id}/cancel → { success: true } (fnf-api src/routers/
    // job.py:411, src/handlers/job.py:1471-1488). Only QUEUED jobs are
    // cancellable (src/use_cases/job/cancel.py:38-44) and a successful cancel
    // REFUNDS the job's credits (cancel.py:130-132). 404 'Job not found' /
    // 400 'Job can only be canceled when in queued status' arrive as string
    // details, i.e. the typed ApiMessageError.
    cancelJob: id => send('PUT', `/jobs/${encodeURIComponent(id)}/cancel`),

    // ── profile ──
    getUser: () => send('GET', '/user'),
    listWorkspaces: () => send('GET', '/workspaces'),
    getCurrentWorkspace: () => send('GET', '/workspaces/details'),
    getWorkspaceWallet: () => send('GET', '/workspaces/wallet'),
    switchWorkspace: ({ workspaceId }: SwitchWorkspaceRequest) => send('POST', '/workspaces/context', { workspace_id: workspaceId }),

    // ── media ──
    getMedia: ({ id, type }: MediaGetQuery) => send('GET', `/input-${type}s/${encodeURIComponent(id)}`),
    async listMedia(_query: MediaListQuery) {
      throw new ApiJobError('not_supported', 'createFnfWebAdapter does not implement media listing yet')
    },
    async getUploadUrl(req: UploadUrlRequest) {
      // The port has no presign-time moderation fields, so `extra` is the
      // vehicle for what the product sends at presign — the backend rate-limits
      // the IP check there: force_ip_check on /video and /media/batch, surface
      // on /media/batch (createVideoMediaSchema, generateFileUploadUrlRequest).
      // Videos have their own upload plane (fnf-web createVideoMediaSchema):
      // POST /video answers a single schema, not a /media/batch slot array.
      if (req.type === 'video')
        return send('POST', '/video', { mimetype: req.contentType ?? 'video/mp4', ...req.extra })
      // Audio likewise (fnf-web preflightAudioRequest): POST /audio keys on
      // { extension, name }, NOT a mimetype.
      if (req.type === 'audio') {
        const extension = audioExtensionOf(req)
        return send('POST', '/audio', { extension, name: req.filename ?? `upload.${extension}`, ...req.extra })
      }
      // /media/batch mimetypes is a closed Literal of six image types — anything
      // else 422s (fnf-api src/schemas/media.py:23-32). 'image/jpeg' is the
      // backend's own single-create default (schemas/media.py:17).
      const slots = await send('POST', '/media/batch', {
        mimetypes: [req.contentType ?? 'image/jpeg'],
        source: 'user_upload',
        ...req.extra,
      }) as Array<{ id: string, url?: string, upload_url: string }>
      return slots[0] ?? {}
    },
    confirmMedia: ({ mediaId, type, filename, jobId, forceNsfwCheck, forceIpCheck, startSeconds, endSeconds, extra }: ConfirmMediaRequest) => {
      // Confirm bodies spread `extra` after the fixed fields — the product also
      // sends `surface` here (confirmUploadRequest, confirmVideoMediaUpload),
      // which the port doesn't model.
      // Video confirm (fnf-web confirmVideoMediaUpload): trim bounds ride the
      // query string; the body carries only the moderation flags.
      if (type === 'video') {
        const query = new URLSearchParams()
        if (startSeconds !== undefined)
          query.set('start_seconds', String(startSeconds))
        if (endSeconds !== undefined)
          query.set('end_seconds', String(endSeconds))
        const qs = query.toString()
        return send('POST', `/video/${encodeURIComponent(mediaId)}/upload${qs ? `?${qs}` : ''}`, {
          force_nsfw_check: forceNsfwCheck ?? false,
          ...(forceIpCheck !== undefined ? { force_ip_check: forceIpCheck } : {}),
          ...extra,
        })
      }
      // Audio confirm (fnf-web confirmAudioRequest): a bare POST — no body
      // unless `extra` supplies one. The response IS the audio object (type
      // 'audio_input'), the shape seedance submits under its 'audio' role.
      if (type === 'audio')
        return send('POST', `/audio/${encodeURIComponent(mediaId)}/upload`, extra)
      return send('POST', `/media/${encodeURIComponent(mediaId)}/upload`, {
        job_id: jobId,
        filename,
        force_nsfw_check: forceNsfwCheck ?? false,
        force_ip_check: forceIpCheck ?? false,
        ...extra,
      })
    },
  }
}

// The /audio presign schema accepts ONLY these extensions — anything else 422s
// (fnf-api src/schemas/audio.py:8-10, AudioInputCreateSchema's Literal).
const AUDIO_SCHEMA_EXTENSIONS = new Set(['wav', 'mp3', 'webm'])

// The content-type fallback for filename-less callers, restricted to types
// that land inside the schema whitelist.
const AUDIO_EXTENSION_BY_CONTENT_TYPE: Record<string, string> = {
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/webm': 'webm',
}

// The /audio presign keys on the file extension, not a mimetype. Like the
// product (upload-audio-input.ts) it comes from the filename, falling back to
// the content type, then to wav when the request carries no information at
// all. Anything outside the schema whitelist throws the typed validation
// error here — a clear local failure instead of the backend 422.
function audioExtensionOf(req: UploadUrlRequest): string {
  const fromName = req.filename?.includes('.') ? req.filename.split('.').pop()?.toLowerCase() : undefined
  const fromType = req.contentType ? AUDIO_EXTENSION_BY_CONTENT_TYPE[req.contentType] : undefined
  const extension = fromName ?? fromType ?? (req.contentType ? undefined : 'wav')
  if (extension === undefined || !AUDIO_SCHEMA_EXTENSIONS.has(extension))
    throw new ValidationError(`Audio uploads support only wav, mp3 or webm — cannot presign '${extension ?? req.contentType}'`)
  return extension
}

function asArray(value: string | string[] | undefined): string[] {
  return value === undefined ? [] : Array.isArray(value) ? value : [value]
}

function stringParam(params: Record<string, unknown>, key: string, fallback?: string): string {
  const value = params[key]
  if (typeof value === 'string')
    return value
  if (fallback !== undefined)
    return fallback
  throw new ValidationError(`estimateCost requires wire params with \`${key}\``)
}

function isSeedanceCost(entry: CostConfigEntry): entry is SeedanceCostModel {
  return typeof (entry as SeedanceCostModel).model === 'string' && Array.isArray((entry as SeedanceCostModel).resolutions)
}

function isKlingCost(entry: CostConfigEntry): entry is KlingCostModel {
  return typeof (entry as KlingCostModel).mode === 'string'
    && typeof (entry as KlingCostModel).audio === 'object'
    && (entry as KlingCostModel).audio !== null
}

function isResolutionCost(entry: CostConfigEntry): entry is ResolutionCostModel {
  return typeof (entry as ResolutionCostModel).resolution === 'string'
    && typeof (entry as ResolutionCostModel).cost_per_second === 'number'
}

function chainMotionControlParams(params: Record<string, unknown>): Record<string, unknown> {
  return cleanUndefined({
    mode: params.mode,
    medias: params.medias,
    height: params.height,
    width: params.width,
    background_source: params.background_source ?? params.backgroundSource,
    model_name: 'kling-v3',
    folder_id: params.folder_id,
  })
}

function cleanUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T
}

function cleanHeaders(headers: Record<string, string | undefined>): Record<string, string> {
  return Object.fromEntries(Object.entries(headers).filter(([, value]) => value !== undefined)) as Record<string, string>
}

/** Normalize a product job (+ its set, when known) into the SDK wire shape. */
function mapJob(job: ProdJob, set?: ProdJobSet): JobResponse & { job_set_type?: string } {
  // Legacy serializers leak the raw 'waiting' status (fnf-api src/utils/job.py:112-136 has no rewrite; the v2 base does — abc_.py:366).
  const status = job.status === 'waiting' ? 'queued' : job.status
  return {
    id: job.id,
    job_set_type: job.job_set_type ?? set?.type,
    job_set_id: job.job_set_id ?? set?.id,
    job_set_parent_id: job.job_set_parent_id ?? set?.parent_id ?? null,
    // A completed job whose IP check is still running is NOT done yet.
    status: status === 'completed' && job.ip_check_finished === false ? 'ip_detect' : status,
    result_url: job.results?.raw?.url ?? job.result_url ?? null,
    min_result_url: job.results?.min?.url ?? job.min_result_url ?? null,
    params: job.params ?? set?.params,
    created_at: job.created_at ?? set?.created_at,
    fail_reason: job.fail_reason ?? job.meta?.fail_reason ?? null,
  }
}
