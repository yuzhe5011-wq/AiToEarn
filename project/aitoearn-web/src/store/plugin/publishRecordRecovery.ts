/** 平台已接受的发布结果只重试保存记录，绝不重新执行平台发布。 */

import type { PublishResult } from './types/baseTypes'
import type { ChannelCreatePublishFlowParams } from '@/api/channels/channel.types'
import { createChannelPublishFlowApi, getChannelPublishFlowApi } from '@/api/channels/channel.api'
import { getPublishRecordIdFromFlow } from '@/components/PublishDialog/PublishDialog.util'
import { useUserStore } from '@/store/user'
import { createPersistStore } from '@/utils/storage/createPersistStore'

interface PendingPublishRecord {
  userId: string
  accountId: string
  flow: ChannelCreatePublishFlowParams
  recordId?: string
  result: PublishResult
}

const usePendingPublishRecords = createPersistStore(
  { jobs: {} as Record<string, PendingPublishRecord> },
  (set, get) => ({
    save(id: string, job: PendingPublishRecord) {
      set({ jobs: { ...get().jobs, [id]: job } })
    },
    remove(id: string) {
      const jobs = { ...get().jobs }
      delete jobs[id]
      set({ jobs })
    },
  }),
  { name: 'plugin-publish-record-recovery' },
  'localStorage',
)

const inFlight = new Map<string, Promise<string>>()
let retryTimer: ReturnType<typeof setInterval> | undefined
let onRecovered: ((id: string, job: PendingPublishRecord) => Promise<void>) | undefined

export function startPublishRecordRecovery(callback: (id: string, job: PendingPublishRecord) => Promise<void>) {
  onRecovered = callback
  if (typeof window === 'undefined' || retryTimer)
    return
  retryTimer = setInterval(() => {
    const userId = useUserStore.getState().userInfo?.id
    if (!userId || !useUserStore.getState().token || !usePendingPublishRecords.getState()._hasHydrated)
      return
    for (const [id, job] of Object.entries(usePendingPublishRecords.getState().jobs)) {
      if (job.userId === userId) {
        void savePublishRecord(id, job).catch(() => {})
      }
    }
  }, 20_000)
}

export function queuePublishRecord(id: string, job: PendingPublishRecord) {
  usePendingPublishRecords.getState().save(id, job)
  return savePublishRecord(id, job)
}

function savePublishRecord(id: string, job: PendingPublishRecord): Promise<string> {
  const existing = inFlight.get(id)
  if (existing)
    return existing
  const request = (async () => {
    if (useUserStore.getState().userInfo?.id !== job.userId)
      throw new Error('Publication record owner changed')
    let recordId = job.recordId
    try {
      if (!recordId) {
        const response = await createChannelPublishFlowApi(job.flow, true)
        if (response?.code === 0)
          recordId = getPublishRecordIdFromFlow(response.data, job.accountId)
      }
    }
    catch {
      // POST 可能已成功，但响应丢失；先核对固定 flowId，再决定是否继续保留重试。
    }
    if (!recordId) {
      const response = await getChannelPublishFlowApi(id, true)
      if (response?.code === 0)
        recordId = getPublishRecordIdFromFlow(response.data, job.accountId)
    }
    if (!recordId)
      throw new Error('Publication record is awaiting recovery')
    if (useUserStore.getState().userInfo?.id !== job.userId)
      throw new Error('Publication record owner changed')
    usePendingPublishRecords.getState().save(id, { ...job, recordId })
    await onRecovered?.(recordId, job)
    usePendingPublishRecords.getState().remove(id)
    return recordId
  })()
  inFlight.set(id, request)
  void request.finally(() => inFlight.delete(id)).catch(() => {})
  return request
}
