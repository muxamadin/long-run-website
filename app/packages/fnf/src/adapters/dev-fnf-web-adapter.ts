import type { FnfObservabilityOptions } from '../observability'
import type { Transport } from '../transport'
import type { FnfAdapter } from './fnf-web-adapter'
import { createFetchTransport } from './fetch-transport'
import { createFnfWebAdapter } from './fnf-web-adapter'

export type { FnfAdapter } from './fnf-web-adapter'

/** The only host that honors `hf-dev-user-id` — non-prod environments only. */
export const DEV_FNF_BASE_URL = 'https://dev-fnf.higgsfield.ai'

type MaybePromise<T> = T | Promise<T>

export interface DevFnfWebAdapterOptions {
  /** The user to act on behalf of (`hf-dev-user-id` header). */
  userId?: string
  /** Optional active workspace id source, sent as `hf-workspace-id` on every request. */
  workspaceId?: string | (() => MaybePromise<string | null | undefined>)
  /** Defaults to the dev backend — the dev header is honored nowhere else. */
  baseUrl?: string
  fetch?: typeof globalThis.fetch
  /** Inject a transport directly (tests / custom). Overrides baseUrl/userId/fetch. */
  transport?: Transport
  observability?: FnfObservabilityOptions
}

/**
 * Dev flavor of the fnf adapter: the SAME prod routes as `createFnfWebAdapter`
 * — there is only one route surface — but instead of a Clerk Bearer token it
 * sends the `hf-dev-user-id` header, acting on behalf of that user. The
 * backend honors the header only on non-prod environments (fnf-api
 * dependencies/user.py + claudesfield.py: `if dev_user_id and environment !=
 * PROD`), hence the baked-in dev base URL.
 */
export function createDevFnfWebAdapter(options: DevFnfWebAdapterOptions = {}): FnfAdapter {
  if (!options.transport && !options.userId)
    throw new Error('createDevFnfWebAdapter requires `userId` (the hf-dev-user-id header), or an explicit `transport`')
  const transport = options.transport ?? createFetchTransport({
    baseUrl: (options.baseUrl ?? DEV_FNF_BASE_URL).replace(/\/$/, ''),
    headers: async () => {
      const workspaceId = typeof options.workspaceId === 'function' ? await options.workspaceId() : options.workspaceId
      return {
        'hf-dev-user-id': options.userId ?? '',
        ...(workspaceId ? { 'hf-workspace-id': workspaceId } : {}),
      }
    },
    fetch: options.fetch,
  })
  return createFnfWebAdapter({ transport, observability: options.observability })
}
