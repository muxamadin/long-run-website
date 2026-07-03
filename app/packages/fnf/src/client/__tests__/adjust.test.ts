import { describe, expect, it } from 'vitest'
import { createMemoryBackend } from '../../adapters/memory-backend'
import { defineJob } from '../../define-job'
import { z } from '../../z'
import { adjust } from '../adjust'
import { createContext } from '../context'
import { videoJob } from '../testkit'

const ctx = createContext({ adapter: createMemoryBackend(), jobs: [videoJob] })

describe('adjust', () => {
  it('snaps the requested kinds and reports the changes', () => {
    const { input, adjustments } = adjust(
      ctx,
      { model: 'demo_video', settings: { duration: 7, aspectRatio: '21:9' } },
      ['near-aspect-ratio', 'near-duration'],
    )
    expect(input.settings).toMatchObject({ duration: 5, aspectRatio: '16:9' })
    expect(adjustments).toEqual([
      { field: 'duration', from: 7, to: 5 },
      { field: 'aspectRatio', from: '21:9', to: '16:9' },
    ])
  })

  it('touches only the requested kinds — others pass through', () => {
    const { input, adjustments } = adjust(
      ctx,
      { model: 'demo_video', settings: { duration: 7, aspectRatio: '21:9' } },
      ['near-aspect-ratio'], // duration not requested
    )
    expect(input.settings).toMatchObject({ duration: 7, aspectRatio: '16:9' })
    expect(adjustments).toEqual([{ field: 'aspectRatio', from: '21:9', to: '16:9' }])
  })

  it('is a no-op when no kinds are requested', () => {
    const { input, adjustments } = adjust(
      ctx,
      { model: 'demo_video', settings: { duration: 7, aspectRatio: '21:9' } },
      [],
    )
    expect(input.settings).toMatchObject({ duration: 7, aspectRatio: '21:9' })
    expect(adjustments).toEqual([])
  })

  it('snaps a normalizer wrapped in z.optional (the tag survives the wrapper)', () => {
    const job = defineJob({
      jobSetType: 'opt_norm',
      outputType: 'image',
      params: { settings: { aspectRatio: z.optional(z.aspectRatio(['1:1', '16:9'])) } },
    })
    const optCtx = createContext({ adapter: createMemoryBackend(), jobs: [job] })
    const { input, adjustments } = adjust(optCtx, { model: 'opt_norm', settings: { aspectRatio: '1920:1081' } }, ['near-aspect-ratio'])
    expect(input.settings).toMatchObject({ aspectRatio: '16:9' })
    expect(adjustments).toHaveLength(1)
  })
})
