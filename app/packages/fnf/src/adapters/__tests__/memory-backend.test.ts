import { describe, expect, it } from 'vitest'
import { createJobClient } from '../../client'
import { nanoBanana2 } from '../../jobs/nano-banana-2'
import { createMediaClient } from '../../media'
import { createMemoryBackend } from '../memory-backend'
import { createMemoryMediaAdapter } from '../memory-media-adapter'

describe('createMemoryBackend (in-code jobs adapter, no network)', () => {
  it('drives the full job client with zero HTTP', async () => {
    const client = createJobClient({
      adapter: createMemoryBackend({ cost: 7 }),
      jobs: [nanoBanana2],
    })

    const { generations } = await client.submit({
      model: 'nano_banana_2',
      prompt: { instruction: 'a cat' },
      settings: { aspectRatio: '1:1', resolution: '2k' },
    })
    const gen = await client.get(generations[0].id)
    expect(gen.status).toBe('completed')
    expect(gen.input.prompt).toEqual({ instruction: 'a cat' })
    expect(gen.results?.rawUrl).toBe(`memory://nano_banana_2/${gen.id}.out`)

    expect((await client.cost({ model: 'nano_banana_2', prompt: { instruction: 'a cat' }, settings: { aspectRatio: '1:1' } })).credits).toBe(2)
    expect((await client.list({ type: 'image' })).items.map(g => g.id)).toEqual([gen.id])
  })
})

describe('createMemoryMediaAdapter (in-code media adapter, no network)', () => {
  it('drives the media client with zero HTTP', async () => {
    const media = createMediaClient({
      mediaAdapter: createMemoryMediaAdapter({ media: [{ id: 'm1', url: 'memory://m1.png', type: 'media_input' }] }),
    })
    expect((await media.list({ type: 'image' })).items).toEqual([{ id: 'm1', type: 'media_input', url: 'memory://m1.png' }])
    expect(await media.get('m1', 'image')).toEqual({ id: 'm1', type: 'media_input', url: 'memory://m1.png' })
  })
})
