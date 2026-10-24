/* Local AiToEarn patch. This file only constructs fields; it never publishes. */
(() => {
  'use strict'

  function buildShortTitle(options) {
    const title = typeof options?.title === 'string' ? options.title.trim() : ''
    const length = Array.from(title).length
    if (length < 6 || length > 16) {
      throw new Error('视频号短标题需要 6–16 个字，请填写标题后重试。')
    }
    return [{ shortTitle: title }]
  }

  function buildEventInfo(options) {
    const event = options?.event
    if (!event?.eventTopicId || !event.eventName) return {}
    const result = {
      eventTopicId: event.eventTopicId,
      eventName: event.eventName,
      eventCreatorNickname: event.eventCreatorNickname || '',
    }
    if (typeof event.eventAttendCount === 'number') result.eventAttendCount = event.eventAttendCount
    if (typeof event.questFlag === 'number') result.questFlag = event.questFlag
    if (event.questInfo != null) {
      const quest = event.questInfo
      if (typeof quest.componentType !== 'number' || !Number.isInteger(quest.componentType)
        || typeof quest.componentId !== 'string' || !quest.componentId.trim()
        || typeof quest.componentName !== 'string' || !quest.componentName.trim()) {
        throw new Error('活动挂载信息不完整，请重新搜索并选择活动后重试。')
      }
      result.questInfo = {
        componentType: quest.componentType,
        componentName: quest.componentName,
        componentId: quest.componentId,
      }
    }
    if (event.questFlag === 1 && !result.questInfo) {
      throw new Error('活动挂载信息不完整，请重新搜索并选择活动后重试。')
    }
    return result
  }

  function buildComponentFields(options) {
    const event = buildEventInfo(options)
    if (event.questFlag !== 1 || event.questInfo?.componentType !== 2) return {}
    const quest = event.questInfo
    // Successful finder_update_post_info capture: the component is a sibling
    // of event; keeping event.questInfo alone does not provide this attachment.
    return {
      component: {
        id: quest.componentId,
        type: quest.componentType,
        title: quest.componentName,
        appearedSeconds: 0,
        appearedMode: 0,
      },
    }
  }

  function buildExtReading(options) {
    if (buildComponentFields(options).component) {
      // The captured native mini-game attachment has no literal URL.
      return { link: '', title: '', urlType: 9 }
    }
    const url = options?.extLink?.trim()
    return url ? { url } : {}
  }

  Object.defineProperty(globalThis, '__aitoearnLocalWxFields', {
    value: Object.freeze({ buildShortTitle, buildEventInfo, buildComponentFields, buildExtReading }),
    configurable: false,
    writable: false,
  })
})()
