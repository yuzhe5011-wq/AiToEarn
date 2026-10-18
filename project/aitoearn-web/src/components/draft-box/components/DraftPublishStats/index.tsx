/** 草稿成功发布统计：总次数下方以平台图标和数字展示平台次数。 */
'use client'

import type { PromotionMaterial } from '@/api/materials/material.types'
import { useTransClient } from '@/app/i18n/client'
import { OssImage } from '@/components/common/OssImage'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/utils/className'
import { getMaterialPlatformPublishCounts } from '../../utils/materialUseCount'

export function DraftPublishStats({ material, className, heading }: { material: PromotionMaterial, className?: string, heading?: string }) {
  const { t } = useTransClient('brandPromotion')
  const platforms = getMaterialPlatformPublishCounts(material, t)

  return (
    <div className={cn('space-y-1.5', className)}>
      <div className="flex flex-wrap items-center gap-2">
        {heading && <h4 className="text-xs font-medium text-muted-foreground">{heading}</h4>}
        <Badge variant="secondary">{t('material.useCount', { count: material.useCount ?? 0 })}</Badge>
      </div>
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
