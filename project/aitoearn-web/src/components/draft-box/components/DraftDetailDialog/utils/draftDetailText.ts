import { parseTopicString } from '@/utils/common'

/** 仅拆分独立话题，保留 URL 片段和正文内的 #，不修改草稿原始数据。 */
export function getDraftDetailText(description: string, topics: string[] = []) {
  const standaloneTopics = description.match(/(?:^|\s)#[^\s#]+/gu) ?? []
  const extracted = parseTopicString(standaloneTopics.join(' ')).topics
  const body = description.replace(/(^|\s)#[^\s#]+/gu, '$1').replace(/[\t ]+$/gm, '').trim()
  const uniqueTopics = [...new Set([...extracted, ...topics].map(topic => topic.replace(/^#+/, '').trim()).filter(Boolean))]
  return { body, topics: uniqueTopics }
}
