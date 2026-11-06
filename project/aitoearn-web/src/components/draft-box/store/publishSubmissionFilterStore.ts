/** 发布工作台草稿筛选偏好，按当前项目用户隔离。 */
import { createPersistStore } from '@/utils/storage/createPersistStore'

export const usePublishSubmissionFilterStore = createPersistStore(
  { wxSphUnsubmittedByUser: {} as Record<string, boolean> },
  (set, get) => ({
    setWxSphUnsubmitted(userId: string, enabled: boolean) {
      set({ wxSphUnsubmittedByUser: { ...get().wxSphUnsubmittedByUser, [userId]: enabled } })
    },
  }),
  { name: 'draft-publish-submission-filter' },
  'localStorage',
)
