import type { PromotionPlan } from '@/api/materials/material.types'

/** 只调整指定计划，保留其余计划的相对顺序，不修改原数组或计划对象。 */
export function orderPlansByIds(plans: PromotionPlan[], ids: string[]) {
  const byId = new Map(plans.map(plan => [plan.id, plan]))
  const ordered = [...new Set(ids)].flatMap((id) => {
    const plan = byId.get(id)
    return plan ? [plan] : []
  })
  const moved = new Set(ids)
  return [...ordered, ...plans.filter(plan => !moved.has(plan.id))]
}
