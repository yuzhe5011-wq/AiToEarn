import type { PromotionPlan } from '@/api/materials/material.types'
import { useEffect, useRef, useState } from 'react'
import { useTransClient } from '@/app/i18n/client'
import { usePlanTabStore } from '@/store/draft-box/planTabStore'
import { toast } from '@/utils/ui/toast'

export function usePlanTabSorting(tabPlans: PromotionPlan[]) {
  const { t } = useTransClient('brandPromotion')
  const [plans, setPlans] = useState(() => tabPlans.map(plan => ({ ...plan })))
  const [dragging, setDragging] = useState(false)
  const originalIds = useRef<string[]>([])
  const suppressClickUntil = useRef(0)
  const orderSaving = usePlanTabStore(state => state.orderSaving)

  useEffect(() => {
    if (!dragging)
      setPlans(tabPlans.map(plan => ({ ...plan })))
  }, [tabPlans, dragging])

  const saveOrder = async (ids: string[]) => {
    const success = await usePlanTabStore.getState().reorderPlans(ids)
    if (!success)
      toast.error(t('planTab.orderFailed'))
  }

  return {
    plans,
    setPlans,
    dragging,
    orderSaving,
    suppressClick: () => Date.now() < suppressClickUntil.current,
    startSort: () => {
      originalIds.current = usePlanTabStore.getState().tabPlans.map(plan => plan.id)
      suppressClickUntil.current = Number.POSITIVE_INFINITY
      setDragging(true)
    },
    endSort: (oldIndex?: number, newIndex?: number) => {
      suppressClickUntil.current = Date.now() + 250
      setDragging(false)
      if (oldIndex == null || newIndex == null || oldIndex === newIndex)
        return
      const ids = [...originalIds.current]
      const [id] = ids.splice(oldIndex, 1)
      ids.splice(newIndex, 0, id)
      void saveOrder(ids)
    },
    moveByKeyboard: (id: string, direction: -1 | 1) => {
      if (orderSaving)
        return
      const ids = usePlanTabStore.getState().tabPlans.map(plan => plan.id)
      const index = ids.indexOf(id)
      const target = index + direction
      if (index < 0 || target < 0 || target >= ids.length)
        return
      ids.splice(index, 1)
      ids.splice(target, 0, id)
      void saveOrder(ids)
    },
  }
}
