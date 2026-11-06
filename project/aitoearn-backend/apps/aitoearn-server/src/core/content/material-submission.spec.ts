import { AccountType } from '@yikart/common'
import { PublishRecordRepository } from '../../../../../libs/mongodb/src/repositories/publish-record.repository'
import { PublishStatus } from '../../../../../libs/mongodb/src/enums'
import { expect, it, vi } from 'vitest'

vi.mock('../../../../../libs/mongodb/src/schemas', () => ({ PublishRecord: class {}, PublishInfo: class {}, PublishDayInfo: class {} }))

it('uses owner/platform and accepted statuses, independently of link lookup failure', async () => {
  const exec = vi.fn().mockResolvedValue(['draft-accepted'])
  const distinct = vi.fn().mockReturnValue({ exec })
  const repository = new PublishRecordRepository({ distinct } as never, {} as never, {} as never)
  expect(await repository.listMaterialIdsByUserIdAndAccountTypeAndStatuses('owner', AccountType.WeChatChannels)).toEqual(['draft-accepted'])
  expect(distinct).toHaveBeenCalledWith('materialId', {
    userId: 'owner', accountType: AccountType.WeChatChannels,
    materialId: { $exists: true, $ne: null },
    status: { $in: [PublishStatus.Published, PublishStatus.PlatformScheduled] },
  })
})
