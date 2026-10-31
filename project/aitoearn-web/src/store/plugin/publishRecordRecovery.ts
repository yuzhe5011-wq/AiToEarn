/** 提交前持久化视频号快照，刷新后确认原结果并补存，绝不重新执行平台发布。 */

import type { PublishResult } from './types/baseTypes'
import type { ChannelCreatePublishFlowParams } from '@/api/channels/channel.types'
import { createChannelPublishFlowApi, getChannelPublishFlowApi } from '@/api/channels/channel.api'
import { getPublishRecordIdFromFlow } from '@/components/PublishDialog/PublishDialog.util'
import { useUserStore } from '@/store/user'
import { createPersistStore } from '@/utils/storage/createPersistStore'
import { appLocalStorage } from '@/utils/storage/localStorage'

export interface PendingPublishRecord {
  userId: string
  accountId: string
  scheduledTime?: number
  flow: ChannelCreatePublishFlowParams
  recordId?: string
  result?: PublishResult
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
type AcceptedPublishRecord = PendingPublishRecord & { result: PublishResult }
let onRecovered: ((id: string, job: AcceptedPublishRecord) => Promise<void>) | undefined
let resolveResult: ((id: string, job: PendingPublishRecord) => Promise<PublishResult | undefined>) | undefined

export function startPublishRecordRecovery(
  callback: (id: string, job: AcceptedPublishRecord) => Promise<void>,
  resolver?: typeof resolveResult,
) {
  onRecovered = callback
  resolveResult = resolver
  if (typeof window === 'undefined' || retryTimer)
    return
  const retry = () => {
    const userId = useUserStore.getState().userInfo?.id
    if (!userId || !useUserStore.getState().token || !usePendingPublishRecords.getState()._hasHydrated)
      return
    for (const [id, job] of Object.entries(usePendingPublishRecords.getState().jobs)) {
      if (job.userId === userId)
        void savePublishRecord(id, job).catch(() => {})
    }
  }
  retryTimer = setInterval(retry, 20_000)
  retry()
}

/** 在调用插件前持久化；没有平台确认的快照绝不能创建成功记录。 */
export async function preparePublishRecord(id: string, job: PendingPublishRecord) {
  if (!usePendingPublishRecords.getState()._hasHydrated)
    await usePendingPublishRecords.persist.rehydrate()
  usePendingPublishRecords.getState().save(id, job)
  // Await a durable write: a full/disabled localStorage must block platform submission.
  try {
    await appLocalStorage.setItem('plugin-publish-record-recovery', JSON.stringify({
      state: usePendingPublishRecords.getState(),
      version: 0,
    }))
  }
  catch (error) {
    usePendingPublishRecords.getState().remove(id)
    throw error
  }
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
    if (!job.result) {
      const result = await resolveResult?.(id, job)
      if (!result)
        throw new Error('Waiting for the original plugin publication result')
      if (useUserStore.getState().userInfo?.id !== job.userId)
        throw new Error('Publication record owner changed')
      // Do not overwrite a result that arrived through the original page callback.
      job = usePendingPublishRecords.getState().jobs[id] || job
      if (!job.result) {
        job = { ...job, result }
        usePendingPublishRecords.getState().save(id, job)
      }
    }
    if (!job.result)
      throw new Error('Waiting for the original plugin publication result')
    const acceptedJob = { ...job, result: job.result }
    if (!job.result.success) {
      await onRecovered?.('', acceptedJob)
      usePendingPublishRecords.getState().remove(id)
      return ''
    }
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
    await onRecovered?.(recordId, acceptedJob)
    usePendingPublishRecords.getState().remove(id)
    return recordId
  })()
  inFlight.set(id, request)
  void request.finally(() => inFlight.delete(id)).catch(() => {})
  return request
}
