import { describe, expect, it, vi } from 'vitest'
import { createJobClient } from '../../client'
import { nanoBanana2 } from '../../jobs/nano-banana-2'
import { createDevFnfWebAdapter } from '../dev-fnf-web-adapter'
import { createFetchTransport } from '../fetch-transport'

interface FakeCall {
  url: string
  init: RequestInit
}

function fakeFetch(status: number, body: unknown) {
  const calls: FakeCall[] = []
  const fn = vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init })
    return {
      status,
      text: async () => (body === undefined ? '' : JSON.stringify(body)),
    } as Response
  })
  return { fn: fn as unknown as typeof globalThis.fetch, calls }
}

describe('createFetchTransport', () => {
  it('trims the base url, JSON-encodes the body, and parses the JSON response', async () => {
    const { fn, calls } = fakeFetch(200, { id: 'job-1', status: 'queued' })
    const transport = createFetchTransport({ baseUrl: 'https://dev-fnf.higgsfield.ai/', fetch: fn })
    const res = await transport({ method: 'POST', path: '/mcp/jobs', body: { a: 1 } })

    expect(calls[0].url).toBe('https://dev-fnf.higgsfield.ai/mcp/jobs')
    expect(calls[0].init.method).toBe('POST')
    expect(calls[0].init.body).toBe('{"a":1}')
    expect((calls[0].init.headers as Headers).get('content-type')).toBe('application/json')
    expect(res).toEqual({ status: 200, body: { id: 'job-1', status: 'queued' } })
  })

  it('applies injected auth headers (function form) to every request', async () => {
    const { fn, calls } = fakeFetch(200, {})
    const transport = createFetchTransport({
      baseUrl: 'https://dev-fnf.higgsfield.ai',
      headers: () => ({ 'fnf-mcp-secret': 's3cr3t' }),
      fetch: fn,
    })
    await transport({ method: 'GET', path: '/mcp/jobs/x' })
    expect((calls[0].init.headers as Headers).get('fnf-mcp-secret')).toBe('s3cr3t')
  })

  it('merges headers case-insensitively: a lowercase content-type override replaces the default', async () => {
    const { fn, calls } = fakeFetch(200, {})
    const transport = createFetchTransport({
      baseUrl: 'https://x',
      headers: { 'content-type': 'application/vnd.custom+json' },
      fetch: fn,
    })
    await transport({ method: 'POST', path: '/y', body: {} })
    expect((calls[0].init.headers as Headers).get('content-type')).toBe('application/vnd.custom+json')
  })

  it('passes the PUT method through verbatim (job cancel rides it)', async () => {
    const { fn, calls } = fakeFetch(200, { success: true })
    const transport = createFetchTransport({ baseUrl: 'https://x', fetch: fn })
    const res = await transport({ method: 'PUT', path: '/jobs/j1/cancel' })
    expect(calls[0].init.method).toBe('PUT')
    expect(res).toEqual({ status: 200, body: { success: true } })
  })

  it('returns the raw text body when the response is not JSON', async () => {
    const { fn } = fakeFetch(502, undefined)
    const transport = createFetchTransport({ baseUrl: 'https://x', fetch: fn })
    const res = await transport({ method: 'GET', path: '/health' })
    expect(res.status).toBe(502)
    expect(res.body).toBeUndefined()
  })
})

describe('createDevFnfWebAdapter over fetch (header auth)', () => {
  it('submits on behalf of the dev user, sending hf-dev-user-id to the per-type /jobs route', async () => {
    const { fn, calls } = fakeFetch(200, { id: 'job-9', status: 'queued' })
    const client = createJobClient({
      adapter: createDevFnfWebAdapter({
        baseUrl: 'https://dev-fnf.higgsfield.ai',
        userId: 'user_test00000000000000000000',
        fetch: fn,
      }),
      jobs: [nanoBanana2],
    })

    const { generations } = await client.submit({
      model: 'nano_banana_2',
      prompt: { instruction: 'a blue cat' },
      settings: { aspectRatio: '1:1', resolution: '2k' },
    })

    expect(calls[0].url).toBe('https://dev-fnf.higgsfield.ai/jobs/nano-banana-2')
    const headers = calls[0].init.headers as Headers
    expect(headers.get('hf-dev-user-id')).toBe('user_test00000000000000000000')
    expect(headers.get('fnf-mcp-secret')).toBeNull() // no service secret — the dev header alone is the auth
    expect(headers.get('authorization')).toBeNull()
    expect(JSON.parse(calls[0].init.body as string)).toEqual({
      params: {
        prompt: 'a blue cat',
        aspect_ratio: '1:1',
        resolution: '2k',
        width: 2048,
        height: 2048,
        input_images: [],
        batch_size: 1,
        use_unlim: false,
        is_storyboard: false,
        is_zoom_control: false,
      },
      use_unlim: false,
      use_seedream_bonus: false,
    })
    expect(generations[0]).toMatchObject({ id: 'job-9', status: 'queued', model: 'nano_banana_2' })
  })
})
