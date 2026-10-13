import type { CommonResponse } from '@yikart/common'
import type { TopicSearchDto } from './topic-search.dto'
import { BadGatewayException, Injectable } from '@nestjs/common'
import { AppException, ResponseCode } from '@yikart/common'
import axios from 'axios'
import { z } from 'zod'

@Injectable()
export class TopicSearchService {
  async searchTopics(data: TopicSearchDto): Promise<string[]> {
    // The public topic search service does not require local credentials or a Relay key.
    const serverUrl = data.language === 'en' ? 'https://aitoearn.ai/api' : 'https://aitoearn.cn/api'
    const response = await axios.post<CommonResponse<string[]>>(
      `${serverUrl}/statistics/channels/douyin/searchTopic`,
      data,
      { timeout: 15000 },
    )
    if (response.data.code !== ResponseCode.Success) {
      throw new AppException(response.data.code, response.data.message)
    }
    const topics = z.array(z.string()).safeParse(response.data.data)
    if (!topics.success) {
      throw new BadGatewayException('Invalid topic search response')
    }
    return topics.data
  }
}
