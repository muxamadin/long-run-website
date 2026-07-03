import type { FnfObservabilityOptions } from '../observability'
import type { Transport } from '../transport'
import type { FnfAdapter } from './fnf-web-adapter'
import { ValidationError } from '../errors'
import { createFetchTransport } from './fetch-transport'
import { createFnfWebAdapter } from './fnf-web-adapter'

export type { FnfAdapter } from './fnf-web-adapter'

export const APPS_MARKETPLACE_DEV_BASE_URL = 'https://dev-fnf.higgsfield.ai/apps-marketplace'
export const APPS_MARKETPLACE_SECRET_ENV = 'FNF_APPS_MARKETPLACE_SECRET'

type MaybePromise<T> = T | Promise<T>
type RequiredHeaderSource = string | (() => MaybePromise<string>)
type OptionalHeaderSource = string | (() => MaybePromise<string | null | undefined>)

export interface AppsMarketplaceAdapterOptions {
  /** Service secret sent as `fnf-apps-marketplace-secret`. Defaults to `FNF_APPS_MARKETPLACE_SECRET`. */
  secret?: RequiredHeaderSource
  /** Environment variable name used when `secret` is omitted. */
  secretEnv?: string
  /** User id to act on behalf of, sent as `hf-user-id`. */
  userId?: RequiredHeaderSource
  /** Optional active workspace id source, sent as `hf-workspace-id` on every request. */
  workspaceId?: OptionalHeaderSource
  /** Defaults to the dev-only apps-marketplace mount. Include `/apps-marketplace` when overriding. */
  baseUrl?: string
  fetch?: typeof globalThis.fetch
  /** Inject a transport directly (tests / custom). Overrides baseUrl/secret/userId/fetch. */
  transport?: Transport
  observability?: FnfObservabilityOptions
}

/**
 * Apps Marketplace adapter for the dev-only `/apps-marketplace` backend surface.
 *
 * This uses the existing fnf route/body behavior through `createFnfWebAdapter`,
 * but authenticates with the marketplace service-secret headers instead of a
 * Clerk bearer token. Keep this adapter on trusted server-side hosts only.
 */
export function createAppsMarketplaceAdapter(options: AppsMarketplaceAdapterOptions = {}): FnfAdapter {
  const secret = options.secret === undefined
    ? readEnvHeaderSource(options.secretEnv ?? APPS_MARKETPLACE_SECRET_ENV)
    : options.secret

  if (!options.transport && (isMissingSource(secret) || isMissingSource(options.userId))) {
    throw new Error(
      'createAppsMarketplaceAdapter requires `userId` and either `secret`, '
      + '`FNF_APPS_MARKETPLACE_SECRET`, or an explicit `transport`',
    )
  }

  const transport = options.transport ?? createFetchTransport({
    baseUrl: (options.baseUrl ?? APPS_MARKETPLACE_DEV_BASE_URL).replace(/\/$/, ''),
    headers: async () => {
      const secretValue = await requiredHeader('secret', secret)
      const userId = await requiredHeader('userId', options.userId)
      const workspaceId = await optionalHeader(options.workspaceId)
      return {
        'fnf-apps-marketplace-secret': secretValue,
        'hf-user-id': userId,
        ...(workspaceId ? { 'hf-workspace-id': workspaceId } : {}),
      }
    },
    fetch: options.fetch,
  })

  return createFnfWebAdapter({ transport, observability: options.observability })
}

function isMissingSource(source: RequiredHeaderSource | undefined): boolean {
  return source === undefined || (typeof source === 'string' && source.trim() === '')
}

function readEnvHeaderSource(name: string): RequiredHeaderSource | undefined {
  const processLike = globalThis as typeof globalThis & { process?: { env?: Record<string, string | undefined> } }
  return processLike.process?.env?.[name]
}

async function requiredHeader(name: 'secret' | 'userId', source: RequiredHeaderSource | undefined): Promise<string> {
  const value = typeof source === 'function' ? await source() : source
  if (typeof value !== 'string' || value.trim() === '')
    throw new ValidationError(`createAppsMarketplaceAdapter requires a non-empty \`${name}\``)
  return value
}

async function optionalHeader(source: OptionalHeaderSource | undefined): Promise<string | undefined> {
  const value = typeof source === 'function' ? await source() : source
  return typeof value === 'string' && value.trim() !== '' ? value : undefined
}
