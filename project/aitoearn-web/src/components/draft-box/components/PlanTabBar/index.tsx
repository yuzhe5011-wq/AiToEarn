/**
 * PlanTabBar - 草稿箱 Tab 栏
 * 可滚动 Tab + 更多按钮 + 新建按钮
 * 两页面（线下推广 / 草稿箱）复用
 */

'use client'

import { Ellipsis, Plus } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { ReactSortable } from 'react-sortablejs'
import { useShallow } from 'zustand/react/shallow'
import { useTransClient } from '@/app/i18n/client'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useIsMobile } from '@/hooks/useIsMobile'
import { useBrandPromotionStore } from '@/store/draft-box/brandPromotionStore'
import { usePlanTabStore } from '@/store/draft-box/planTabStore'
import { cn } from '@/utils/className'
import { usePlanTabSorting } from './hooks/usePlanTabSorting'
import MorePanel from './MorePanel'
import styles from './PlanTabBar.module.scss'

interface PlanTabBarProps {
  onPlanChange?: (planId: string) => void
}

function PlanTabBar({ onPlanChange }: PlanTabBarProps) {
  const { t } = useTransClient('brandPromotion')
  const isMobile = useIsMobile()
  const scrollRef = useRef<HTMLDivElement>(null)
  const activeTabRef = useRef<HTMLButtonElement>(null)

  const {
    tabPlans,
    tabPlansLoading,
    selectedPlanId,
  } = usePlanTabStore(
    useShallow(state => ({
      tabPlans: state.tabPlans,
      tabPlansLoading: state.tabPlansLoading,
      selectedPlanId: state.selectedPlanId,
    })),
  )

  const selectPlan = usePlanTabStore(state => state.selectPlan)
  const openCreatePlanModal = useBrandPromotionStore(state => state.openCreatePlanModal)
  const sorting = usePlanTabSorting(tabPlans)

  // PC端鼠标滚轮水平滚动
  useEffect(() => {
    const el = scrollRef.current
    if (!el || isMobile)
      return

    const onWheel = (e: WheelEvent) => {
      if (e.deltaY === 0)
        return
      e.preventDefault()
      el.scrollLeft += e.deltaY
    }

    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [isMobile])

  // 选中 Tab 后自动滚动到容器水平居中位置
  useEffect(() => {
    if (activeTabRef.current && scrollRef.current) {
      const container = scrollRef.current
      const tab = activeTabRef.current
      const scrollLeft = tab.offsetLeft - container.offsetWidth / 2 + tab.offsetWidth / 2
      container.scrollTo({ left: scrollLeft, behavior: 'smooth' })
    }
  }, [selectedPlanId])

  const handleTabClick = (planId: string) => {
    if (sorting.suppressClick())
      return
    if (planId === selectedPlanId) {
      return
    }
    selectPlan(planId)
    onPlanChange?.(planId)
  }

  if (tabPlansLoading) {
    return (
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border">
        <Skeleton className="h-8 w-20" />
        <Skeleton className="h-8 w-20" />
        <Skeleton className="h-8 w-20" />
      </div>
    )
  }

  if (tabPlans.length === 0)
    return null

  return (
    <div className="flex items-center border-b border-border bg-background">
      {/* 可滚动 Tab 区域 */}
      <div
        ref={scrollRef}
        className={cn(
          'flex-1 flex items-center overflow-x-auto min-w-0',
          styles.scrollContainer,
        )}
      >
        <ReactSortable
          list={sorting.plans}
          setList={(plans, sortable) => {
            // ReactSortable 构造时会回调；实例尚未挂载时不要更新父组件状态。
            if (sortable)
              sorting.setPlans(plans)
          }}
          className="flex min-w-max items-center"
          direction="horizontal"
          animation={180}
          delay={350}
          delayOnTouchOnly={false}
          touchStartThreshold={8}
          fallbackTolerance={5}
          forceFallback
          disabled={sorting.orderSaving || tabPlans.length < 2}
          ghostClass={styles.sortGhost}
          chosenClass={styles.sortChosen}
          scrollSensitivity={40}
          scrollSpeed={12}
          onStart={sorting.startSort}
          onEnd={event => sorting.endSort(event.oldIndex, event.newIndex)}
        >
          {sorting.plans.map(plan => (
            <button
              key={plan.id}
              ref={plan.id === selectedPlanId ? activeTabRef : undefined}
              data-id={plan.id}
              aria-pressed={plan.id === selectedPlanId}
              aria-busy={sorting.orderSaving}
              title={t('planTab.reorderHint')}
              className={cn(
                'shrink-0 select-none touch-pan-x px-4 py-2.5 text-sm cursor-pointer transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                'hover:text-foreground',
                'border-b-2 border-transparent',
                plan.id === selectedPlanId
                  ? 'border-b-primary text-foreground font-medium'
                  : 'text-muted-foreground',
              )}
              onClick={() => handleTabClick(plan.id)}
              onContextMenu={event => event.preventDefault()}
              onKeyDown={(event) => {
                if (event.altKey && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
                  event.preventDefault()
                  sorting.moveByKeyboard(plan.id, event.key === 'ArrowLeft' ? -1 : 1)
                }
              }}
            >
              {plan.name || plan.title}
            </button>
          ))}
        </ReactSortable>
      </div>

      {/* 右侧固定按钮区域 */}
      <div className="flex items-center shrink-0 border-l border-border px-1 gap-0.5">
        {/* 更多按钮 */}
        <MorePanel
          trigger={(
            <Button
              variant="ghost"
              size="sm"
              className="cursor-pointer h-8 px-2"
            >
              <Ellipsis className="h-4 w-4" />
              {!isMobile && <span className="ml-1">{t('planTab.more')}</span>}
            </Button>
          )}
          onPlanChange={onPlanChange}
        />

        {/* 新建按钮 */}
        <Button
          variant="ghost"
          size="sm"
          className="cursor-pointer h-8 px-2"
          onClick={openCreatePlanModal}
        >
          <Plus className="h-4 w-4" />
          {!isMobile && <span className="ml-1">{t('planTab.newPlan')}</span>}
        </Button>
      </div>
    </div>
  )
}

export default PlanTabBar
