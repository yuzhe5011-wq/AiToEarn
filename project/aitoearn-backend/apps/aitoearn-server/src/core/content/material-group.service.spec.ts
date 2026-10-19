import { describe, expect, it, vi } from 'vitest'
import { MaterialGroupOrderSchema } from './material-group.dto'
import { MaterialGroupService } from './material-group.service'

vi.mock('@yikart/mongodb', () => ({
  MaterialGroupRepository: class {},
  MaterialType: { VIDEO: 'video', ARTICLE: 'article' },
}))

describe('draft-box order', () => {
  const ids = ['aaaaaaaaaaaaaaaaaaaaaaaa', 'bbbbbbbbbbbbbbbbbbbbbbbb', 'cccccccccccccccccccccccc']

  it('preserves omitted groups and allows moving the default group', async () => {
    const repository = {
      listByUserId: vi.fn().mockResolvedValue([{ id: ids[0] }, { id: ids[1], isDefault: true }, { id: ids[2] }]),
      updateRanksByUserId: vi.fn().mockResolvedValue(undefined),
    }
    const service = new MaterialGroupService(repository as never)
    expect(await service.reorderGroups('owner', [ids[1], ids[0]])).toEqual({ count: 3 })
    expect(repository.listByUserId).toHaveBeenCalledWith('owner')
    expect(repository.updateRanksByUserId).toHaveBeenCalledWith('owner', [ids[1], ids[0], ids[2]])
  })

  it('rejects another owner or missing group before any write', async () => {
    const repository = {
      listByUserId: vi.fn().mockResolvedValue([{ id: ids[0] }]),
      updateRanksByUserId: vi.fn(),
    }
    const service = new MaterialGroupService(repository as never)
    await expect(service.reorderGroups('owner', [ids[1], ids[0]])).rejects.toThrow()
    expect(repository.updateRanksByUserId).not.toHaveBeenCalled()
  })

  it('propagates persistence failures instead of reporting success', async () => {
    const repository = {
      listByUserId: vi.fn().mockResolvedValue([{ id: ids[0] }]),
      updateRanksByUserId: vi.fn().mockRejectedValue(new Error('write failed')),
    }
    await expect(new MaterialGroupService(repository as never).reorderGroups('owner', [ids[0]])).rejects.toThrow('write failed')
  })

  it('rejects empty, duplicate, and invalid group IDs', () => {
    for (const invalid of [[], [ids[0], ids[0]], ['not-an-object-id']]) {
      expect(MaterialGroupOrderSchema.safeParse({ ids: invalid }).success).toBe(false)
    }
    expect(MaterialGroupOrderSchema.safeParse({ ids }).success).toBe(true)
  })
})
