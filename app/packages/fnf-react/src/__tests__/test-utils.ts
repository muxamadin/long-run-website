import type { Generation } from '@higgsfield/fnf/client'

export function gen(id: string, status: Generation['status'], extra?: Partial<Generation>): Generation {
  return { id, model: 'demo', type: 'image', status, input: { model: 'demo', settings: {} }, ...extra }
}
