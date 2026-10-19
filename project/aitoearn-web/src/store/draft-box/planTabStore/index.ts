/**
 * 草稿箱 Tab 栏 Store
 * 管理 Tab 列表切换、选中计划持久化、更多面板分页加载
 */

import type { IPlanTabStoreState } from './types'
import type { PromotionPlan } from '@/api/materials/material.types'
import { apiGetMaterialGroupList, apiReorderMaterialGroups } from '@/api/materials/material.api'
import { createPersistStore } from '@/utils/storage/createPersistStore'
import { orderPlansByIds } from './utils/orderPlans'

const PAGE_SIZE = 50

const initialState: IPlanTabStoreState = {
  tabPlans: [],
  tabPlansLoading: false,
  orderSaving: false,
  orderRevision: 0,
  selectedPlanId: null,
  morePlans: [],
  morePlansLoading: false,
  morePlansPagination: {
    current: 1,
    pageSize: PAGE_SIZE,
    total: 0,
    hasMore: true,
  },
  morePanelOpen: false,
  initialized: false,
}

export const usePlanTabStore = createPersistStore(
  initialState,
  (set, get) => {
    const mergePlanToTop = (list: PromotionPlan[], plan: PromotionPlan) => {
      return [plan, ...list.filter(item => item.id !== plan.id)]
    }

    const syncTabs = async (preferredPlanId?: string | null) => {
      const requestedOrderRevision = get().orderRevision
      set({ tabPlansLoading: true })
      try {
        const res = await apiGetMaterialGroupList(1, PAGE_SIZE)
        const rawList = res?.data?.list || []
        const list = requestedOrderRevision === get().orderRevision
          ? rawList
          : orderPlansByIds(rawList, get().tabPlans.map(plan => plan.id))
        const total = res?.data?.total || 0

        const { selectedPlanId } = get()
        const validPreferredPlanId = preferredPlanId && list.some(p => p.id === preferredPlanId)
          ? preferredPlanId
          : null

        let validSelectedId: string | null = null
        if (validPreferredPlanId) {
          validSelectedId = validPreferredPlanId
        }
        else if (selectedPlanId && list.some(p => p.id === selectedPlanId)) {
          validSelectedId = selectedPlanId
        }
        else if (list.length > 0) {
          validSelectedId = list[0].id
        }

        set({
          tabPlans: list,
          morePlans: list,
          selectedPlanId: validSelectedId,
          initialized: true,
          morePlansPagination: {
            current: 1,
            pageSize: PAGE_SIZE,
            total,
            hasMore: list.length < total,
          },
        })
      }
      catch (error) {
        set({ initialized: true })
      }
      finally {
        set({ tabPlansLoading: false })
      }
    }

    const methods = {
      reorderPlans: async (ids: string[]) => {
        const { tabPlans, orderSaving } = get()
        if (orderSaving || ids.length !== tabPlans.length || new Set(ids).size !== ids.length || ids.some(id => !tabPlans.some(plan => plan.id === id)))
          return false
        if (ids.every((id, index) => tabPlans[index].id === id))
          return true
        const previousIds = tabPlans.map(plan => plan.id)
        set({
          tabPlans: orderPlansByIds(tabPlans, ids),
          morePlans: orderPlansByIds(get().morePlans, ids),
          orderSaving: true,
          orderRevision: get().orderRevision + 1,
        })
        try {
          const res = await apiReorderMaterialGroups({ ids })
          if (res?.code !== 0)
            throw new Error('Failed to save draft-box order')
          return true
        }
        catch {
          set({
            tabPlans: orderPlansByIds(get().tabPlans, previousIds),
            morePlans: orderPlansByIds(get().morePlans, previousIds),
            orderRevision: get().orderRevision + 1,
          })
          return false
        }
        finally {
          set({ orderSaving: false })
        }
      },

      /**
       * 初始化 Tab 列表
       * 加载第一页草稿箱，恢复或默认选中
       */
      initTabs: async (preferredPlanId?: string | null) => {
        const { initialized, tabPlansLoading } = get()
        if (initialized || tabPlansLoading) {
          return
        }

        await syncTabs(preferredPlanId)
      },

      /**
       * 强制刷新 Tab 列表
       * 用于跨页面新增计划后重新拉取
       */
      refreshTabs: async (preferredPlanId?: string | null) => {
        await syncTabs(preferredPlanId)
      },

      /**
       * 切换选中计划
       */
      selectPlan: (planId: string) => {
        const { morePanelOpen, selectedPlanId } = get()
        if (selectedPlanId === planId && !morePanelOpen) {
          return
        }

        set({ selectedPlanId: planId, morePanelOpen: false })
      },

      /**
       * 加载「更多」面板数据（指定页）
       */
      fetchMorePlans: async (page: number = 1) => {
        const requestedOrderRevision = get().orderRevision
        set({ morePlansLoading: true })
        try {
          const res = await apiGetMaterialGroupList(page, PAGE_SIZE)
          const rawList = res?.data?.list || []
          const list = requestedOrderRevision === get().orderRevision
            ? rawList
            : orderPlansByIds(rawList, get().tabPlans.map(plan => plan.id))
          const total = res?.data?.total || 0

          if (page === 1) {
            set({ morePlans: list })
          }
          else {
            const { morePlans } = get()
            set({ morePlans: [...morePlans, ...list] })
          }

          set({
            morePlansPagination: {
              current: page,
              pageSize: PAGE_SIZE,
              total,
              hasMore: page * PAGE_SIZE < total,
            },
          })
        }
        catch {
          // 静默失败
        }
        finally {
          set({ morePlansLoading: false })
        }
      },

      /**
       * 面板内加载下一页
       */
      loadMoreInPanel: async () => {
        const { morePlansLoading, morePlansPagination } = get()
        if (morePlansLoading || !morePlansPagination.hasMore)
          return
        await methods.fetchMorePlans(morePlansPagination.current + 1)
      },

      /**
       * 创建计划后同步
       * 刷新 tabPlans + 自动选中新计划
       */
      onPlanCreated: async (newPlanId?: string, optimisticPlan?: PromotionPlan) => {
        if (newPlanId && optimisticPlan) {
          const { tabPlans, morePlans, morePlansPagination } = get()
          const nextTabPlans = mergePlanToTop(tabPlans, optimisticPlan)
          const nextMorePlans = mergePlanToTop(morePlans, optimisticPlan)
          const total = Math.max(morePlansPagination.total + 1, nextTabPlans.length)

          set({
            tabPlans: nextTabPlans,
            morePlans: nextMorePlans,
            selectedPlanId: newPlanId,
            initialized: true,
            morePlansPagination: {
              ...morePlansPagination,
              current: 1,
              total,
              hasMore: nextTabPlans.length < total,
            },
          })
        }

        try {
          await syncTabs(newPlanId)
        }
        catch {
          // 静默失败
        }
      },

      /**
       * 删除计划后同步
       * 从列表移除 + 自动切换到第一个
       */
      onPlanDeleted: (deletedPlanId: string) => {
        const { tabPlans, selectedPlanId, morePlans } = get()
        const newTabPlans = tabPlans.filter(p => p.id !== deletedPlanId)
        const newMorePlans = morePlans.filter(p => p.id !== deletedPlanId)

        const updates: Partial<IPlanTabStoreState> = {
          tabPlans: newTabPlans,
          morePlans: newMorePlans,
        }

        // 如果删除的是当前选中计划，切换到第一个
        if (selectedPlanId === deletedPlanId) {
          updates.selectedPlanId = newTabPlans.length > 0 ? newTabPlans[0].id : null
        }

        set(updates as IPlanTabStoreState)
      },

      /**
       * 更新计划后同步
       * 就地更新 tabPlans/morePlans 中的名称
       */
      onPlanUpdated: (planId: string, data: { name?: string, desc?: string }) => {
        const { tabPlans, morePlans } = get()

        const updateList = (list: PromotionPlan[]) =>
          list.map(p => (p.id === planId ? { ...p, ...data } : p))

        set({
          tabPlans: updateList(tabPlans),
          morePlans: updateList(morePlans),
        } as Partial<IPlanTabStoreState> as IPlanTabStoreState)
      },

      /**
       * 打开更多面板
       */
      openMorePanel: () => {
        set({ morePanelOpen: true })
        // 打开时加载第一页
        methods.fetchMorePlans(1)
      },

      /**
       * 关闭更多面板
       */
      closeMorePanel: () => {
        set({ morePanelOpen: false })
      },

      /**
       * 重置 Store
       */
      reset: () => {
        set({
          ...initialState,
          selectedPlanId: null,
        } as IPlanTabStoreState)
      },
    }

    return methods
  },
  {
    name: 'plan-tab-store',
    partialize: (state) => {
      return { selectedPlanId: state.selectedPlanId } as typeof state
    },
  },
)
