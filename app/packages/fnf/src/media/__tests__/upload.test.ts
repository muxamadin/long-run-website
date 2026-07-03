import type { Handler } from '../../client/testkit'
import type { TransportRequest } from '../../transport'
import type { BinaryUploader } from '../types'
import { describe, expect, it } from 'vitest'
import { createDevFnfWebAdapter } from '../../adapters/dev-fnf-web-adapter'
import { createMemoryMediaAdapter } from '../../adapters/memory-media-adapter'
import { createMemoryUploader } from '../blob-uploader'
import { createMediaClient } from '../client'
import { createMediaContext } from '../context'
import { InvalidMediaSourceError, MediaModerationError, PresignError, UploadNotSupportedError } from '../errors'
import { inferContentType, inferUploadType } from '../mime'
import { safeUploadMedia } from '../upload'

/** A media transport that records calls and branches presign vs confirm by path. */
function uploadHandler(confirmBody: Record<string, unknown> = { id: 'm1', status: 'uploaded', url: 'https://cdn/x.png' }) {
  const calls: TransportRequest[] = []
  const handler: Handler = async (req) => {
    calls.push(req)
    if (req.path === '/media/batch') // presign answers an array of slots
      return { status: 200, body: [{ id: 'm1', url: 'https://cdn/x.png', upload_url: 'https://s3/put/m1' }] }
    if (req.path.endsWith('/upload'))
      return { status: 200, body: confirmBody }
    return { status: 404, body: {} }
  }
  return { calls, handler }
}

function recordingUploader() {
  const puts: { uploadUrl: string, contentType: string }[] = []
  const uploader: BinaryUploader = {
    async transfer(a) {
      puts.push({ uploadUrl: a.uploadUrl, contentType: a.contentType })
    },
  }
  return { puts, uploader }
}

describe('uploadMediaFromUrl', () => {
  it('downloads then uploads, passing role and moderation options through', async () => {
    const { handler } = uploadHandler()
    const { uploader } = recordingUploader()
    uploader.fetchBytes = async () => ({ bytes: new Uint8Array([9]), contentType: 'image/png' })
    const media = createMediaClient({ mediaAdapter: createDevFnfWebAdapter({ transport: handler }), blobUploader: uploader })

    const result = await media.uploadFromUrl({ url: 'https://cdn/source.png?sig=1', role: 'start_image' })
    expect(result.ref.role).toBe('start_image') // options pass through to the confirm/ref
    expect(result.filename).toBe('source.png') // derived from the URL path, query stripped
  })
})

/** A media adapter with no upload methods (read-only). */
function noUploadAdapter() {
  return {
    async getMedia() {
      return {}
    },
    async listMedia() {
      return { items: [] }
    },
  }
}

describe('uploadMedia (fnf adapter, prod routes)', () => {
  it('presigns, PUTs the bytes, confirms, and returns a submit-ready MediaRef', async () => {
    const { calls, handler } = uploadHandler()
    const { puts, uploader } = recordingUploader()
    const media = createMediaClient({ mediaAdapter: createDevFnfWebAdapter({ transport: handler }), blobUploader: uploader })

    const result = await media.upload({ source: new Uint8Array([1, 2, 3]), filename: 'cat.png', role: 'image' })

    expect(calls[0]).toMatchObject({ method: 'POST', path: '/media/batch', body: { mimetypes: ['image/png'], source: 'user_upload' } })
    expect(puts[0]).toEqual({ uploadUrl: 'https://s3/put/m1', contentType: 'image/png' })
    expect(calls[1]).toMatchObject({ method: 'POST', path: '/media/m1/upload', body: { filename: 'cat.png' } })
    expect(result.ref).toEqual({ id: 'm1', type: 'media_input', url: 'https://cdn/x.png', role: 'image' })
    expect(result.status).toBe('uploaded')
    expect(result.moderation).toBeUndefined() // a clean 'uploaded' is not a moderation verdict
  })

  it('throws MediaModerationError when confirm reports ip_detected (unless throwOnModeration:false)', async () => {
    const blocked = uploadHandler({ id: 'm1', status: 'ip_detected' })
    const media = createMediaClient({ mediaAdapter: createDevFnfWebAdapter({ transport: blocked.handler }), blobUploader: recordingUploader().uploader })
    await expect(media.upload({ source: new Uint8Array([1]), filename: 'x.png' })).rejects.toBeInstanceOf(MediaModerationError)

    const soft = await media.upload({ source: new Uint8Array([1]), filename: 'x.png', throwOnModeration: false })
    expect(soft.moderation?.status).toBe('ip_detected')
  })
})

describe('uploadMedia (memory)', () => {
  it('drives the full flow with the in-memory adapter + uploader', async () => {
    const media = createMediaClient({ mediaAdapter: createMemoryMediaAdapter(), blobUploader: createMemoryUploader() })
    const result = await media.upload({ source: new Uint8Array([1]), filename: 'clip.mp4' })
    expect(result.type).toBe('video')
    // ref.type is the product discriminator for the upload plane (video_input),
    // regardless of what the adapter's confirm response echoes back
    expect(result.ref).toMatchObject({ id: 'mem_media_1', type: 'video_input' })
    expect(result.ref.url).toContain('memory://video/')
  })

  it('audio uploads produce an audio_input ref (what the seedance audio role expects on the wire)', async () => {
    const media = createMediaClient({ mediaAdapter: createMemoryMediaAdapter(), blobUploader: createMemoryUploader() })
    const result = await media.upload({ source: new Uint8Array([1]), filename: 'track.mp3' })
    expect(result.type).toBe('audio')
    expect(result.ref.type).toBe('audio_input')
  })
})

describe('upload guards + helpers', () => {
  it('throws UploadNotSupportedError when the adapter has no getUploadUrl', async () => {
    const media = createMediaClient({ mediaAdapter: noUploadAdapter() })
    await expect(media.upload({ source: new Uint8Array([1]), filename: 'x.png' })).rejects.toBeInstanceOf(UploadNotSupportedError)
  })

  it('wraps a foreign throw from a custom adapter getUploadUrl into PresignError (mirrors confirm)', async () => {
    const media = createMediaClient({
      mediaAdapter: {
        ...noUploadAdapter(),
        async getUploadUrl() {
          throw new Error('socket hang up')
        },
      },
      blobUploader: recordingUploader().uploader,
    })
    const err = await media.upload({ source: new Uint8Array([1]), filename: 'x.png' }).then(() => null, (e: unknown) => e)
    expect(err).toBeInstanceOf(PresignError)
    expect((err as PresignError).message).toBe('socket hang up') // foreign reason preserved
  })

  it('safeUploadMedia returns error-as-data instead of throwing', async () => {
    const ctx = createMediaContext({ mediaAdapter: noUploadAdapter() })
    const res = await safeUploadMedia(ctx, { source: new Uint8Array([1]), filename: 'x.png' })
    expect(res.ok).toBe(false)
    if (!res.ok)
      expect(res.error.code).toBe('upload_not_supported')
  })

  it('rejects JSON-shaped upload sources before presign', async () => {
    const { handler } = uploadHandler()
    const media = createMediaClient({ mediaAdapter: createDevFnfWebAdapter({ transport: handler }) })

    await expect(media.upload({
      source: { 0: 1, length: 1 } as never,
      filename: 'x.png',
    })).rejects.toBeInstanceOf(InvalidMediaSourceError)
  })

  it('rejects lazy upload readers that do not return binary data', async () => {
    const { handler } = uploadHandler()
    const media = createMediaClient({ mediaAdapter: createDevFnfWebAdapter({ transport: handler }) })

    await expect(media.upload({
      source: { read: async () => ({ bytes: [1] }) } as never,
      filename: 'x.png',
    })).rejects.toMatchObject({ code: 'invalid_media_source' })
  })

  it('infers content-type and upload-type from filename', () => {
    expect(inferContentType('clip.mp4', undefined)).toBe('video/mp4')
    expect(inferContentType(undefined, 'image/webp')).toBe('image/webp')
    expect(inferUploadType('audio/mpeg')).toBe('audio')
    expect(inferUploadType('image/png')).toBe('image')
  })
})
