/* Local, bounded publication diagnostics. No network requests or credentials. */
(() => {
  'use strict'
  const storageKey = 'LocalWxSphPublishAuditV1'
  const active = new WeakMap()
  const maxRecords = 100
  const maxAgeMs = 30 * 24 * 60 * 60 * 1000
  let writes = Promise.resolve()
  let warned = false

  function text(value, limit = 256) {
    return typeof value === 'string' ? value.slice(0, limit) : undefined
  }

  function eventFields(event, truncate = true) {
    const fields = {
      eventTopicId: text(event?.eventTopicId, truncate ? 512 : Infinity),
      eventName: text(event?.eventName, truncate ? 256 : Infinity),
      questFlag: typeof event?.questFlag === 'number' ? event.questFlag : undefined,
    }
    if (event?.questInfo) {
      fields.questInfo = {
        componentType: typeof event.questInfo.componentType === 'number' ? event.questInfo.componentType : undefined,
        componentName: text(event.questInfo.componentName, truncate ? 256 : Infinity),
        componentId: text(event.questInfo.componentId, truncate ? 128 : Infinity),
      }
    }
    return fields
  }

  function retained(records) {
    return (Array.isArray(records) ? records : [])
      .filter(record => record?.schemaVersion === 1 && typeof record.auditId === 'string'
        && record.startedAt >= Date.now() - maxAgeMs)
      .sort((left, right) => right.startedAt - left.startedAt)
      .slice(0, maxRecords)
  }

  async function write(change) {
    const operation = writes.catch(() => {}).then(async () => {
      const stored = await chrome.storage.local.get(storageKey)
      const records = retained(stored[storageKey])
      if (change(records) === false) return
      await chrome.storage.local.set({ [storageKey]: retained(records) })
    })
    writes = operation
    try {
      await operation
    }
    catch {
      // Diagnostics must not turn an accepted publication into a failure.
      if (!warned) {
        warned = true
        console.warn('[WxSphAudit] Local diagnostic storage unavailable; publishing is unchanged.')
      }
    }
  }

  async function save(record) {
    record.updatedAt = Date.now()
    const snapshot = JSON.parse(JSON.stringify(record))
    await write(records => {
      const index = records.findIndex(item => item.auditId === snapshot.auditId)
      if (index >= 0) records[index] = snapshot
      else records.unshift(snapshot)
    })
  }

  function failure(error) {
    const result = {
      name: ['Error', 'TypeError', 'PublishError', 'AbortError'].includes(error?.name) ? error.name : 'Error',
    }
    const code = error?.code || error?.type
    if (typeof code === 'number' || ['NETWORK_ERROR', 'PARAM_ERROR', 'VALIDATION_ERROR', 'UPLOAD_ERROR',
      'PUBLISH_ERROR', 'SIGNATURE_ERROR', 'TIMEOUT_ERROR', 'UNKNOWN_ERROR', 'PLATFORM_ERROR',
      'WX_SPH_LOGIN_EXPIRED'].includes(code)) result.code = code
    // Do not persist exception messages/stacks: they can contain signed URLs.
    return result
  }

  async function createVideo(publisher, input) {
    const startedAt = Date.now()
    let pluginVersion = 'unknown'
    try { pluginVersion = chrome.runtime.getManifest().version }
    catch { /* The runtime can disappear while an extension is being reloaded. */ }
    const record = {
      schemaVersion: 1,
      auditId: `${startedAt}-${Math.random().toString(36).slice(2, 12)}`,
      requestId: text(input.options?.requestId, 128),
      accountId: text(input.options?.accountId, 128),
      pluginVersion,
      startedAt,
      updatedAt: startedAt,
      status: 'preparing',
      requestedScheduledTime: typeof input.options?.scheduledTime === 'number' ? input.options.scheduledTime : undefined,
      event: eventFields(input.options?.event),
    }
    active.set(publisher, {record, inputSignature:JSON.stringify(eventFields(input.options?.event, false))})
    try {
      return await publisher.createVideoUnlogged(input)
    }
    catch (error) {
      if (record.status !== 'rejected') record.status = record.submission ? 'request_failed' : 'validation_failed'
      record.error = failure(error)
      record.durationMs = Date.now() - startedAt
      await save(record)
      throw error
    }
    finally {
      active.delete(publisher)
    }
  }

  async function beforeRequest(publisher, endpoint, body) {
    const context = active.get(publisher)
    const record = context?.record
    if (!record || !String(endpoint).split(/[?#]/)[0].endsWith('/post/post_create')) return
    const desc = body.objectDesc || {}
    const submittedEvent = eventFields(desc.event)
    const component = desc.component
    const reading = desc.extReading || {}
    const matches = context.inputSignature === JSON.stringify(eventFields(desc.event, false))
    record.inputActivityFieldsMatch = matches
    if (!matches) record.receivedEvent = record.event
    record.event = submittedEvent
    record.submission = {
      endpoint: '/post/post_create',
      shortTitle: text(desc.shortTitle?.[0]?.shortTitle, 32),
      effectiveTime: typeof body.effectiveTime === 'number' ? body.effectiveTime : undefined,
      postFlag: typeof body.postFlag === 'number' ? body.postFlag : undefined,
      component: component ? {
        id: text(component.id, 128), type: typeof component.type === 'number' ? component.type : undefined, title: text(component.title),
        appearedSeconds: typeof component.appearedSeconds === 'number' ? component.appearedSeconds : undefined,
        appearedMode: typeof component.appearedMode === 'number' ? component.appearedMode : undefined,
      } : undefined,
      extReading: {
        urlType: typeof reading.urlType === 'number' ? reading.urlType : undefined,
        linkEmpty: reading.link === '',
        titleEmpty: reading.title === '',
        externalUrlPresent: Boolean(reading.link || reading.url),
      },
    }
    const quest = desc.event?.questInfo
    if (desc.event?.questFlag === 1 && quest?.componentType === 2) {
      record.attachmentMatchesActivity = component?.id === quest.componentId && component.type === quest.componentType
        && component.title === quest.componentName && component.appearedSeconds === 0 && component.appearedMode === 0
        && reading.urlType === 9 && reading.link === '' && reading.title === '' && !reading.url
    }
    record.mediaMd5sum = text(desc.media?.[0]?.md5sum, 128)
    record.status = 'submitted'
    await save(record)
  }

  async function captureResponse(publisher, response) {
    const record = active.get(publisher)?.record
    if (!record?.submission) return
    const outer = response?.errCode
    const inner = response?.data?.baseResp?.errcode
    record.response = {
      errCode: typeof outer === 'number' ? outer : null,
      baseErrcode: typeof inner === 'number' ? inner : null,
    }
    record.status = outer === 0 && inner === 0 ? 'accepted'
      : (typeof outer === 'number' && outer !== 0) || (typeof inner === 'number' && inner !== 0) ? 'rejected' : 'unconfirmed'
    record.durationMs = Date.now() - record.startedAt
    await save(record)
  }

  async function associate(job) {
    if (!job?.recordId || !job.mediaMd5sum) return
    await write(records => {
      const record = records.find(item => item.mediaMd5sum === job.mediaMd5sum && item.status === 'accepted')
      if (!record || record.projectRecordId === job.recordId) return false
      record.projectRecordId = text(job.recordId, 128)
      record.updatedAt = Date.now()
    })
  }

  async function read() {
    await writes.catch(() => {})
    const stored = await chrome.storage.local.get(storageKey)
    const records = retained(stored[storageKey])
    if (Array.isArray(stored[storageKey]) && records.length !== stored[storageKey].length) await write(() => {})
    return records
  }

  // Return only one exactly matched attempt to the already authorized website.
  async function lookup(params) {
    if (!params || typeof params.requestId !== 'string' || typeof params.accountId !== 'string')
      return { success: false }
    const record = (await read()).find(item => item.requestId === params.requestId
      && item.accountId === params.accountId && item.requestedScheduledTime === params.scheduledTime)
    if (!record) return { success: true, result: { status: 'missing' } }
    return { success: true, result: {
      status: record.status,
      mediaMd5sum: record.mediaMd5sum,
      scheduledTime: record.requestedScheduledTime,
    } }
  }

  async function exportRecords() {
    return JSON.stringify({ schemaVersion: 1, records: await read() }, null, 2)
  }

  Object.defineProperty(globalThis, '__aitoearnLocalWxAudit', {
    value: Object.freeze({ createVideo, beforeRequest, captureResponse, associate, read, lookup, exportRecords }),
    configurable: false,
    writable: false,
  })
})()
