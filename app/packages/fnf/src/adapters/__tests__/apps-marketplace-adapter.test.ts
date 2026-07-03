import type { Transport } from '../../transport'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAppsMarketplaceAdapter } from '../apps-marketplace-adapter'

const transport: Transport = async () => ({ status: 200, body: {} })

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('createAppsMarketplaceAdapter construction guard', () => {
  it('throws a clear error without secret/userId unless transport is injected', () => {
    expect(() => createAppsMarketplaceAdapter()).toThrow(/userId.*secret.*FNF_APPS_MARKETPLACE_SECRET.*transport/i)
    expect(() => createAppsMarketplaceAdapter({ secret: 's' })).toThrow(/userId.*secret.*FNF_APPS_MARKETPLACE_SECRET.*transport/i)
    expect(() => createAppsMarketplaceAdapter({ userId: 'u' })).toThrow(/userId.*secret.*FNF_APPS_MARKETPLACE_SECRET.*transport/i)
    expect(() => createAppsMarketplaceAdapter({ secret: '', userId: 'u' }))
      .toThrow(/userId.*secret.*FNF_APPS_MARKETPLACE_SECRET.*transport/i)
    expect(() => createAppsMarketplaceAdapter({ transport })).not.toThrow()
  })
})

describe('createAppsMarketplaceAdapter over fetch', () => {
  it('targets the dev-only apps-marketplace base URL and sends marketplace headers', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: 'u1' }), { status: 200 }))
    const adapter = createAppsMarketplaceAdapter({
      secret: 'marketplace-secret',
      userId: 'user-1',
      fetch: fetchMock as unknown as typeof globalThis.fetch,
    })

    await adapter.getUser()

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    const headers = init.headers as Headers
    expect(url).toBe('https://dev-fnf.higgsfield.ai/apps-marketplace/user')
    expect(headers.get('fnf-apps-marketplace-secret')).toBe('marketplace-secret')
    expect(headers.get('hf-user-id')).toBe('user-1')
    expect(headers.get('authorization')).toBeNull()
  })

  it('uses FNF_APPS_MARKETPLACE_SECRET when secret is omitted', async () => {
    vi.stubEnv('FNF_APPS_MARKETPLACE_SECRET', 'env-secret')
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: 'u1' }), { status: 200 }))
    const adapter = createAppsMarketplaceAdapter({
      userId: 'user-1',
      fetch: fetchMock as unknown as typeof globalThis.fetch,
    })

    await adapter.getUser()

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    const headers = init.headers as Headers
    expect(headers.get('fnf-apps-marketplace-secret')).toBe('env-secret')
  })

  it('supports a custom secret env var name', async () => {
    vi.stubEnv('CUSTOM_MARKETPLACE_SECRET', 'custom-env-secret')
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: 'u1' }), { status: 200 }))
    const adapter = createAppsMarketplaceAdapter({
      secretEnv: 'CUSTOM_MARKETPLACE_SECRET',
      userId: 'user-1',
      fetch: fetchMock as unknown as typeof globalThis.fetch,
    })

    await adapter.getUser()

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    const headers = init.headers as Headers
    expect(headers.get('fnf-apps-marketplace-secret')).toBe('custom-env-secret')
  })

  it('supports async secret/user/workspace sources', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: 'w1' }), { status: 200 }))
    const adapter = createAppsMarketplaceAdapter({
      baseUrl: 'https://dev-fnf.higgsfield.ai/apps-marketplace/',
      secret: async () => 'rotating-secret',
      userId: async () => 'user-2',
      workspaceId: async () => 'workspace-1',
      fetch: fetchMock as unknown as typeof globalThis.fetch,
    })

    await adapter.getCurrentWorkspace()

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    const headers = init.headers as Headers
    expect(url).toBe('https://dev-fnf.higgsfield.ai/apps-marketplace/workspaces/details')
    expect(headers.get('fnf-apps-marketplace-secret')).toBe('rotating-secret')
    expect(headers.get('hf-user-id')).toBe('user-2')
    expect(headers.get('hf-workspace-id')).toBe('workspace-1')
  })
})

describe('createAppsMarketplaceAdapter delegation', () => {
  it('reuses fnf-web job, media, and profile route behavior unchanged', async () => {
    const calls: { method: string, path: string, body: unknown }[] = []
    const adapter = createAppsMarketplaceAdapter({
      transport: async (req) => {
        calls.push({ method: req.method, path: req.path, body: req.body })
        return { status: 200, body: req.path === '/media/batch' ? [{ id: 'm1', upload_url: 'https://s3/m1' }] : {} }
      },
    })

    await adapter.createJobs({ jobSetType: 'seedance_2_0', params: { prompt: 'x' } })
    await adapter.getUploadUrl?.({ type: 'image', contentType: 'image/png' })
    await adapter.confirmMedia?.({ mediaId: 'm1', type: 'image', filename: 'cat.png' })
    await adapter.getWorkspaceWallet()

    expect(calls.map(c => ({ method: c.method, path: c.path, body: c.body }))).toEqual([
      {
        method: 'POST',
        path: '/jobs/v2/seedance_2_0',
        body: { params: { prompt: 'x' }, use_unlim: false },
      },
      {
        method: 'POST',
        path: '/media/batch',
        body: { mimetypes: ['image/png'], source: 'user_upload' },
      },
      {
        method: 'POST',
        path: '/media/m1/upload',
        body: { filename: 'cat.png', force_nsfw_check: false, force_ip_check: false, job_id: undefined },
      },
      { method: 'GET', path: '/workspaces/wallet', body: undefined },
    ])
  })

  it('maps backend errors through the existing typed error catalog', async () => {
    const adapter = createAppsMarketplaceAdapter({
      transport: async () => ({ status: 403, body: { detail: { error_type: 'workspace_selection_required' } } }),
    })

    await expect(adapter.getUser()).rejects.toMatchObject({ code: 'workspace_selection_required' })
  })

  it('does not expose secret or user id in observability events', async () => {
    const events: unknown[] = []
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: 'u1' }), { status: 200 }))
    const adapter = createAppsMarketplaceAdapter({
      secret: 'super-secret',
      userId: 'user-sensitive',
      fetch: fetchMock as unknown as typeof globalThis.fetch,
      observability: {
        observer: (event) => {
          events.push(event)
        },
        idFactory: () => `id-${events.length + 1}`,
        now: () => 10,
      },
    })

    await adapter.getUser()

    const serialized = JSON.stringify(events)
    expect(serialized).toContain('fnf.transport.request')
    expect(serialized).toContain('/user')
    expect(serialized).not.toContain('super-secret')
    expect(serialized).not.toContain('user-sensitive')
  })
})
