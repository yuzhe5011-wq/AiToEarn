import { createZodDto } from '@yikart/common'
import { z } from 'zod'

export class TopicSearchDto extends createZodDto(z.object({
  topic: z.string().trim().min(1).max(100).describe('话题搜索关键词'),
  language: z.enum(['zh-CN', 'CN', 'zh-Hans', 'en']).default('en').describe('话题搜索语言'),
}), 'TopicSearchDto') {}
