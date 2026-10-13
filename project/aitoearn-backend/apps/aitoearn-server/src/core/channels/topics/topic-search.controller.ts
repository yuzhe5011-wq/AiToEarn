import { Body, Controller, Post } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { Public } from '@yikart/aitoearn-auth'
import { ApiDoc } from '@yikart/common'
import { TopicSearchDto } from './topic-search.dto'
import { TopicSearchService } from './topic-search.service'

@ApiTags('Channels/Topics')
@Controller('statistics/channels/douyin')
export class TopicSearchController {
  constructor(private readonly topicSearchService: TopicSearchService) {}

  @ApiDoc({
    summary: '搜索抖音 / TikTok 话题',
    description: '按语言查询中国版或国际版公开话题搜索服务，返回话题名称列表。',
    body: TopicSearchDto.schema,
  })
  @Public()
  @Post('searchTopic')
  searchTopics(@Body() data: TopicSearchDto) {
    return this.topicSearchService.searchTopics(data)
  }
}
