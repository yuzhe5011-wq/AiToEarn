/** 草稿成功发布统计：总次数下方以平台图标和数字展示平台次数。 */
'use client'

import type { PromotionMaterial } from '@/api/materials/material.types'
import { Clock } from 'lucide-react'
import { useEffect, useState } from 'react'
import { apiGetDraftInfo } from '@/api/materials/material.api'
import { useTransClient } from '@/app/i18n/client'
import { OssImage } from '@/components/common/OssImage'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { getPlatformInfoSync } from '@/store/platformMetadata'
import { cn } from '@/utils/className'
import { formatDate } from '@/utils/format'
import { getMaterialPlatformPublishCounts } from '../../utils/materialUseCount'

export function DraftPublishStats({ material, className, heading }: { material: PromotionMaterial, className?: string, heading?: string }) {
  const { t } = useTransClient('brandPromotion')
  const [refreshed, setRefreshed] = useState<{ source: PromotionMaterial, value: PromotionMaterial }>()
  const currentMaterial = refreshed?.source === material ? refreshed.value : material
  const platforms = getMaterialPlatformPublishCounts(currentMaterial, t)
  const shouldRefresh = currentMaterial.scheduledPublications?.some(record => record.linkStatus !== 'failed')

  useEffect(() => {
    if (!shouldRefresh)
      return
    let disposed = false
    let fetching = false
    const timer = setInterval(async () => {
      if (fetching || document.visibilityState === 'hidden')
        return
      fetching = true
      try {
        const result = await apiGetDraftInfo(material.id)
        if (!disposed && result?.code === 0 && result.data)
          setRefreshed({ source: material, value: result.data })
      }
      catch {
        // Keep the last confirmed state while the API is unavailable.
      }
      finally {
        fetching = false
      }
    }, 20_000)
    return () => {
      disposed = true
      clearInterval(timer)
    }
  }, [material, shouldRefresh])

  return (
    <div className={cn('space-y-1.5', className)}>
      <div className="flex flex-wrap items-center gap-2">
        {heading && <h4 className="text-xs font-medium text-muted-foreground">{heading}</h4>}
        <Badge variant="secondary">{t('material.useCount', { count: currentMaterial.useCount ?? 0 })}</Badge>
      </div>
      {currentMaterial.scheduledPublications?.map((record) => {
        const platform = getPlatformInfoSync(record.accountType)
        const overdue = new Date(record.publishTime).getTime() <= Date.now()
        const statusKey = record.linkStatus === 'failed'
          ? 'material.publicationCheckFailed'
          : overdue ? 'material.publicationChecking' : 'material.scheduledPublication'
        return (
          <div key={record.id} className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            {platform && <OssImage src={platform.icon} alt={platform.name} width={16} height={16} className="h-4 w-4 shrink-0" unoptimized />}
            <Badge variant="outline" className="gap-1 font-normal text-muted-foreground">
              <Clock className="h-3 w-3" />
              {t(statusKey)}
            </Badge>
            <span className="tabular-nums">{formatDate(record.publishTime, 'MM-DD HH:mm')}</span>
          </div>
        )
      })}
      {platforms.length > 0 && (
        <TooltipProvider>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            {platforms.map(({ platform, icon, name, count, label }) => (
              <Tooltip key={platform}>
                <TooltipTrigger asChild>
                  <span tabIndex={0} aria-label={label} className="inline-flex items-center gap-1.5 rounded-sm text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    {icon
                      ? <OssImage src={icon} alt={name} width={16} height={16} className="h-4 w-4 shrink-0" unoptimized />
                      : <span>{name}</span>}
                    <span className="tabular-nums">{count}</span>
                  </span>
                </TooltipTrigger>
                <TooltipContent>{label}</TooltipContent>
              </Tooltip>
            ))}
          </div>
        </TooltipProvider>
      )}
    </div>
  )
}
