import { AccountType } from '@yikart/common'
import { describe, expect, it, vi } from 'vitest'
import { MaterialService } from './material.service'

vi.mock('@yikart/assets', () => ({
  AssetsService: class {},
  VideoMetadataService: class {},
}))

vi.mock('./media.service', () => ({ MediaService: class {} }))

vi.mock('@yikart/mongodb', () => ({
  MaterialRepository: class {},
  PublishRecordRepository: class {},
  AssetType: { VideoThumbnail: 'videoThumbnail' },
  MaterialType: { VIDEO: 'video' },
  MediaType: { VIDEO: 'video' },
}))

function createService() {
  const materialRepository = {
    getInfo: vi.fn(),
    getList: vi.fn(),
  }
  const publishRecordRepository = {
    countByMaterialsGroupedByAccountType: vi.fn().mockResolvedValue([]),
    listScheduledByMaterials: vi.fn().mockResolvedValue([]),
  }
  return {
    service: new MaterialService(materialRepository as never, {} as never, {} as never, {} as never, publishRecordRepository as never),
    materialRepository,
    publishRecordRepository,
  }
}

describe('material successful publication counts', () => {
  it('keeps same-title drafts separate and batches counts scoped to their owners', async () => {
    const { service, materialRepository, publishRecordRepository } = createService()
    const materials = [
      { id: 'draft-1', userId: 'user-1', title: '同名草稿', useCount: 2, accountTypes: [AccountType.WeChatChannels] },
      { id: 'draft-2', userId: 'user-1', title: '同名草稿', useCount: 0, accountTypes: [AccountType.WeChatChannels] },
    ]
    materialRepository.getList.mockResolvedValue({ total: 2, list: materials })
    publishRecordRepository.countByMaterialsGroupedByAccountType.mockResolvedValue([
      { materialId: 'draft-1', accountType: AccountType.WeChatChannels, count: 1 },
      { materialId: 'draft-1', accountType: AccountType.RedNote, count: 1 },
    ])

    const result = await service.getList({ pageNo: 1, pageSize: 20 }, { userId: 'user-1' })

    expect(publishRecordRepository.countByMaterialsGroupedByAccountType).toHaveBeenCalledExactlyOnceWith([
      { materialId: 'draft-1', userId: 'user-1' },
      { materialId: 'draft-2', userId: 'user-1' },
    ])
    expect(result.total).toBe(2)
    expect(result.list[0]).toMatchObject({
      useCount: 2,
      useCountByAccountType: { [AccountType.WeChatChannels]: 1, [AccountType.RedNote]: 1 },
      accountTypes: [AccountType.WeChatChannels],
    })
    expect(result.list[1].useCountByAccountType).toEqual({})
    expect(materials[0]).not.toHaveProperty('useCountByAccountType')
  })

  it('returns the same platform statistics in draft details', async () => {
    const { service, materialRepository, publishRecordRepository } = createService()
    materialRepository.getInfo.mockResolvedValue({ id: 'draft-1', userId: 'user-1', useCount: 3 })
    publishRecordRepository.countByMaterialsGroupedByAccountType.mockResolvedValue([
      { materialId: 'draft-1', accountType: AccountType.WeChatChannels, count: 3 },
    ])
    expect(await service.getInfo('draft-1')).toMatchObject({
      useCount: 3,
      useCountByAccountType: { [AccountType.WeChatChannels]: 3 },
    })
  })

  it('keeps scheduled arrangements separate from success counts and scoped to each draft', async () => {
    const { service, materialRepository, publishRecordRepository } = createService()
    materialRepository.getList.mockResolvedValue({ total: 2, list: [
      { id: 'draft-1', userId: 'user-1', useCount: 0 },
      { id: 'draft-2', userId: 'user-1', useCount: 0 },
    ] })
    const publishTime = new Date('2026-10-24T08:00:00Z')
    publishRecordRepository.listScheduledByMaterials.mockResolvedValue([
      { id: 'record-1', materialId: 'draft-1', accountType: AccountType.WeChatChannels, publishTime },
    ])
    const result = await service.getList({ pageNo: 1, pageSize: 20 }, { userId: 'user-1' })
    expect(result.list[0]).toMatchObject({ useCount: 0, scheduledPublications: [
      { id: 'record-1', accountType: AccountType.WeChatChannels, publishTime },
    ] })
    expect(result.list[1].scheduledPublications).toEqual([])
    expect(publishRecordRepository.listScheduledByMaterials).toHaveBeenCalledWith([
      { materialId: 'draft-1', userId: 'user-1' },
      { materialId: 'draft-2', userId: 'user-1' },
    ])
  })

  it('preserves exhausted polling status without changing successful publication counts', async () => {
    const { service, materialRepository, publishRecordRepository } = createService()
    materialRepository.getInfo.mockResolvedValue({ id: 'draft-1', userId: 'user-1', useCount: 0 })
    publishRecordRepository.listScheduledByMaterials.mockResolvedValue([
      { id: 'record-1', materialId: 'draft-1', accountType: AccountType.WeChatChannels, publishTime: new Date(), linkStatus: 'failed' },
    ])
    expect(await service.getInfo('draft-1')).toMatchObject({
      useCount: 0,
      scheduledPublications: [{ id: 'record-1', linkStatus: 'failed' }],
    })
  })

  it('does not query publication records for a missing draft', async () => {
    const { service, materialRepository, publishRecordRepository } = createService()
    materialRepository.getInfo.mockResolvedValue(null)
    expect(await service.getInfo('missing')).toBeNull()
    expect(publishRecordRepository.countByMaterialsGroupedByAccountType).not.toHaveBeenCalled()
  })
})
