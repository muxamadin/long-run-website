import type { MediaBackend } from '../backend'
import { REF_TYPE_BY_UPLOAD } from '../media/types'

/**
 * A media backend implemented entirely in code — no network. Proves the
 * `MediaBackend` port is transport-agnostic. Handy for tests, offline/demo
 * modes, and local pipelines. Payload `type`s use the product's input-media
 * discriminators (media_input/video_input/audio_input), like the real backend.
 */
export interface MemoryMediaAdapterOptions {
  /** Media returned by `getMedia`/`listMedia`. */
  media?: { id: string, url?: string, type?: string }[]
}

export function createMemoryMediaAdapter(options: MemoryMediaAdapterOptions = {}): MediaBackend {
  const media = options.media ?? []
  let seq = 0

  return {
    async getMedia({ id }) {
      return media.find(m => m.id === id) ?? { id, type: 'media_input' }
    },
    async listMedia() {
      return { items: media, next_cursor: null }
    },
    async getUploadUrl({ type }) {
      const id = `mem_media_${++seq}`
      return { id, type: REF_TYPE_BY_UPLOAD[type], url: `memory://${type}/${id}`, upload_url: `memory://upload/${id}` }
    },
    async confirmMedia({ mediaId, type }) {
      return { id: mediaId, status: 'uploaded', type: REF_TYPE_BY_UPLOAD[type], url: `memory://${type}/${mediaId}` }
    },
  }
}
