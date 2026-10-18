/** 草稿详情信息区：固定标题、可滚动正文与集中展示的发布信息。 */
'use client'

import type { PromotionMaterial } from '@/api/materials/material.types'
import type { PlatType } from '@/app/config/platConfig'
import { ImageIcon, Video } from 'lucide-react'
import { useTransClient } from '@/app/i18n/client'
import { OssImage } from '@/components/common/OssImage'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { getPlatformInfoSync } from '@/store/platformMetadata'
import { formatDate } from '@/utils/format'
import { DraftPublishStats } from '../../../DraftPublishStats'
import { GenerationParamsCard } from '../../../GenerationParamsCard'
import { getDraftDetailText } from '../../utils/draftDetailText'

export function DraftDetailInfo({ material, onApplied }: { material: PromotionMaterial, onApplied: () => void }) {
  const { t } = useTransClient('brandPromotion')
  const text = getDraftDetailText(material.desc ?? '', material.topics)
  const hasVideo = material.mediaList?.some(media => media.type === 'video')

  return (
    <>
      <header className="shrink-0 border-b border-border px-5 py-5 pr-12 md:px-6 md:py-6 md:pr-12">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="min-w-0 break-words text-lg font-semibold leading-snug">{material.title || t('material.untitled')}</h3>
          {!!material.mediaList?.length && (
            <Badge variant="outline" className="shrink-0 font-normal text-muted-foreground">
              {hasVideo ? <Video className="mr-1 h-3 w-3" /> : <ImageIcon className="mr-1 h-3 w-3" />}
              {hasVideo ? t('planType.video') : t('planType.article')}
              {!hasVideo && material.mediaList.length > 1 && (
                <span className="ml-1">
                  (
                  {material.mediaList.length}
                  )
                </span>
              )}
            </Badge>
          )}
        </div>
      </header>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-6 px-5 py-5 md:px-6 md:py-6">
          <section className="space-y-3">
            <p className="whitespace-pre-wrap break-words text-sm leading-7 text-foreground">
              {text.body || t('publishRecord.noDescription')}
            </p>
            {text.topics.length > 0 && (
              <div className="flex flex-wrap gap-x-3 gap-y-1.5">
                {text.topics.map(topic => (
                  <span key={topic} className="break-all text-xs leading-5 text-primary">
                    #
                    {topic}
                  </span>
                ))}
              </div>
            )}
          </section>

          <section className="space-y-4 border-t border-border pt-5">
            <DraftPublishStats material={material} heading={t('draft.publication')} />
            {!!material.accountTypes?.length && (
              <div className="flex flex-wrap items-center gap-2 border-t border-dashed border-border pt-3">
                <span className="mr-1 text-xs text-muted-foreground">{t('material.targetPlatforms')}</span>
                {material.accountTypes.map((type) => {
                  const info = getPlatformInfoSync(type as PlatType)
                  return info
                    ? <OssImage key={type} src={info.icon} alt={info.name} title={info.name} width={16} height={16} className="h-4 w-4" unoptimized />
                    : null
                })}
              </div>
            )}
          </section>

          {material.generationParams && (
            <section className="border-t border-border pt-5">
              <GenerationParamsCard params={material.generationParams} t={t} showPlatforms={false} applyTargetGroupId={material.groupId} onApplied={onApplied} />
            </section>
          )}
        </div>
      </ScrollArea>
      {material.createdAt && (
        <p className="shrink-0 px-5 pb-4 pt-3 text-xs leading-5 text-muted-foreground md:px-6">
          {t('draft.createdAt')}
          {' · '}
          {formatDate(material.createdAt)}
        </p>
      )}
    </>
  )
}
