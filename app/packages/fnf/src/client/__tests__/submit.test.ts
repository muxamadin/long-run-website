import { describe, expect, it } from 'vitest'
import { OutOfCreditsError, UnknownSubmitResponseError } from '../../errors'
import { makeClient, recorder } from '../testkit'

describe('submit', () => {
  it('posts wire params to the per-type /jobs route, returns pending generations', async () => {
    const { calls, handler } = recorder({ id: 'job-1', status: 'queued' })
    const client = makeClient(handler)
    const { generations } = await client.submit({ model: 'demo', prompt: { instruction: 'cat' }, settings: { aspectRatio: '1:1' } })

    expect(calls[0]).toMatchObject({ method: 'POST', path: '/jobs/demo' })
    expect(calls[0].body).toEqual({ params: { prompt: 'cat', aspectRatio: '1:1' }, use_unlim: false })
    expect(generations[0]).toMatchObject({ id: 'job-1', status: 'queued', model: 'demo' })
  })

  it('treats a string[] id response (fnf /jobs) as pending generations', async () => {
    const client = makeClient(recorder(['job-a', 'job-b']).handler)
    const { generations } = await client.submit({ model: 'demo', settings: { aspectRatio: '1:1' } })
    expect(generations.map(g => g.id)).toEqual(['job-a', 'job-b'])
    expect(generations[0]).toMatchObject({ status: 'queued', model: 'demo' })
  })

  it('fans out `count` as N parallel job submissions (client behavior, not a wire param)', async () => {
    const { calls, handler } = recorder({ id: 'job-1', status: 'queued' })
    const client = makeClient(handler)
    const { generations } = await client.submit({ model: 'demo', count: 3, settings: { aspectRatio: '1:1' } })

    expect(calls).toHaveLength(3) // N separate /jobs requests, not one batched call
    expect((calls[0].body as { params: Record<string, unknown> }).params).not.toHaveProperty('count') // count never goes on the wire
    expect(generations).toHaveLength(3)
  })

  it('composes count × batchSize: N requests, each carrying the wire batch_size', async () => {
    const { calls, handler } = recorder({ id: 'job-1', status: 'queued' })
    const client = makeClient(handler)
    await client.submit({ model: 'demo', count: 2, settings: { aspectRatio: '1:1', batchSize: 3 } })

    expect(calls).toHaveLength(2)
    // typed key batchSize → wire key batch_size (z.wire mapping)
    expect((calls[0].body as { params: { batch_size?: number } }).params.batch_size).toBe(3)
    expect((calls[1].body as { params: { batch_size?: number } }).params.batch_size).toBe(3)
  })

  it('fan-out partial failure: keeps successes, records failed[] and a warning', async () => {
    let n = 0
    const client = makeClient(async () =>
      n++ === 0
        ? { status: 200, body: { id: 'ok', status: 'queued' } }
        : { status: 402, body: { detail: { error_type: 'not_enough_credits' } } })
    const { generations, failed, warning } = await client.submit({ model: 'demo', count: 2, settings: { aspectRatio: '1:1' } })

    expect(generations).toHaveLength(1)
    expect(failed).toHaveLength(1)
    expect(failed?.[0].code).toBe('out_of_credits')
    expect(warning).toMatch(/1 of 2/)
  })

  it('serializes folderId into params and lifts parentId to the body top level', async () => {
    const { calls, handler } = recorder({ id: 'job-1', status: 'queued' })
    const client = makeClient(handler)
    await client.submit({ model: 'demo', folderId: 'f1', parentId: 'set-9', settings: { aspectRatio: '1:1' } })

    const body = calls[0].body as { params: Record<string, unknown>, parent_id?: string }
    expect(body.params.folder_id).toBe('f1')
    // derived jobs (upscale/outpaint) link via parent_id — the product sends it
    // at the top level of the body, not inside params
    expect(body.parent_id).toBe('set-9')
    expect(body.params.parent_id).toBeUndefined()
  })

  it('a 2xx response with an unrecognized shape throws UnknownSubmitResponseError carrying the body', async () => {
    const client = makeClient(recorder({ unexpected: 'shape' }).handler)
    const err = await client.submit({ model: 'demo', settings: { aspectRatio: '1:1' } }).then(() => null, (e: unknown) => e)
    expect(err).toBeInstanceOf(UnknownSubmitResponseError)
    // the body rides data.responseBody, so it survives toJSON/Comlink
    expect((err as UnknownSubmitResponseError).data?.responseBody).toEqual({ unexpected: 'shape' })
  })

  it('throws a typed error when the request fails', async () => {
    const client = makeClient(recorder({ detail: { error_type: 'not_enough_credits' } }, 402).handler)
    await expect(client.submit({ model: 'demo', settings: { aspectRatio: '1:1' } })).rejects.toBeInstanceOf(OutOfCreditsError)
  })

  it('throws for an unknown model', async () => {
    const client = makeClient(recorder({}).handler)
    await expect(client.submit({ model: 'nope', settings: {} })).rejects.toThrow(/unknown model/i)
  })
})

describe('safeSubmit', () => {
  it('returns a serializable error instead of throwing', async () => {
    const client = makeClient(recorder({ detail: { error_type: 'not_enough_credits' } }, 402).handler)
    const result = await client.safeSubmit({ model: 'demo', settings: { aspectRatio: '1:1' } })
    expect(result.ok).toBe(false)
    if (!result.ok)
      expect(result.error.code).toBe('out_of_credits')
  })

  it('returns ok:true with generations on success', async () => {
    const client = makeClient(recorder({ id: 'job-1', status: 'queued' }).handler)
    const result = await client.safeSubmit({ model: 'demo', settings: { aspectRatio: '1:1' } })
    expect(result.ok && result.generations[0].id).toBe('job-1')
  })
})
