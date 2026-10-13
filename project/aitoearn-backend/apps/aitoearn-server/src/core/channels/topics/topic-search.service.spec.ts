import { BadGatewayException } from '@nestjs/common'
import { AppException } from '@yikart/common'
import axios from 'axios'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TopicSearchDto } from './topic-search.dto'
import { TopicSearchService } from './topic-search.service'

vi.mock('axios', () => ({ default: { post: vi.fn() } }))

describe('topic search', () => {
  const service = new TopicSearchService()

  beforeEach(() => vi.resetAllMocks())

  it.each(['zh-CN', 'CN', 'zh-Hans', 'en'] as const)('routes %s to the matching public service without credentials', async (language) => {
    const input = { topic: 'travel', language }
    vi.mocked(axios.post).mockResolvedValue({ data: { code: 0, data: ['travel vlog'] } })

    await expect(service.searchTopics(input)).resolves.toEqual(['travel vlog'])
    expect(axios.post).toHaveBeenCalledWith(
      `https://${language === 'en' ? 'aitoearn.ai' : 'aitoearn.cn'}/api/statistics/channels/douyin/searchTopic`,
      input,
      { timeout: 15000 },
    )
  })

  it('preserves a successful empty search result', async () => {
    vi.mocked(axios.post).mockResolvedValue({ data: { code: 0, data: [] } })
    await expect(service.searchTopics({ topic: 'unknown', language: 'en' })).resolves.toEqual([])
  })

  it('propagates upstream business errors instead of returning fake suggestions', async () => {
    vi.mocked(axios.post).mockResolvedValue({ data: { code: 10002, message: 'Invalid keyword', data: {} } })
    await expect(service.searchTopics({ topic: 'travel', language: 'en' })).rejects.toBeInstanceOf(AppException)
  })

  it('rejects malformed suggestions before they reach the editor', async () => {
    vi.mocked(axios.post).mockResolvedValue({ data: { code: 0, data: { topics: [] } } })
    await expect(service.searchTopics({ topic: 'travel', language: 'en' })).rejects.toBeInstanceOf(BadGatewayException)
  })

  it('validates and trims search input', () => {
    expect(TopicSearchDto.schema.parse({ topic: ' travel ' })).toEqual({ topic: 'travel', language: 'en' })
    expect(TopicSearchDto.schema.safeParse({ topic: ' ' }).success).toBe(false)
    expect(TopicSearchDto.schema.safeParse({ topic: 'travel', language: 'other' }).success).toBe(false)
  })
})
