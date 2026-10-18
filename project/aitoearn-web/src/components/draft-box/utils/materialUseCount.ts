import type { PromotionMaterial } from '@/api/materials/material.types'
import type { PlatType } from '@/app/config/platConfig'
import { getPlatformInfoSync } from '@/store/platformMetadata'

type TranslateFn = (key: string, options?: Record<string, unknown>) => string

export const UNLIMITED_PLATFORM_MAX_USE_COUNT = 999999

export function getMaterialPlatformPublishCounts(material: PromotionMaterial, t: TranslateFn) {
  return Object.entries(material.useCountByAccountType ?? {})
    .filter(([, count]) => count != null && count > 0)
    .map(([platform, count]) => {
      const info = getPlatformInfoSync(platform as PlatType)
      const name = info?.name ?? platform
      return {
        platform,
        icon: info?.icon,
        name,
        count,
        label: t('material.platformUseCount', { platform: name, count }),
      }
    })
}
