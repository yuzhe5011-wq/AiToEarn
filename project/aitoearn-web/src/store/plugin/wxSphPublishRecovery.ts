/** 查询原发布请求的本地插件结果，不执行上传或发布。 */
export interface WxSphRecoveredPublication {
  status: 'accepted' | 'rejected' | 'validation_failed' | 'submitted' | 'request_failed' | 'unconfirmed' | 'missing'
  mediaMd5sum?: string
  scheduledTime?: number
}

export function getWxSphPublicationResult(params: {
  requestId: string
  accountId: string
  scheduledTime?: number
}): Promise<WxSphRecoveredPublication | undefined> {
  return new Promise((resolve) => {
    const requestId = `recovery-${crypto.randomUUID()}`
    const finish = (result?: WxSphRecoveredPublication) => {
      window.removeEventListener('message', listener)
      clearTimeout(timer)
      resolve(result)
    }
    const listener = (event: MessageEvent) => {
      if (event.source !== window || event.origin !== window.location.origin)
        return
      const data = event.data
      if (data?.source !== 'aitoearn-web' || data.type !== 'LOCAL_WX_SPH_PUBLISH_RESULT_RESPONSE' || data.requestId !== requestId)
        return
      finish(data.result?.success ? data.result.result : undefined)
    }
    const timer = setTimeout(() => finish(), 5000)
    window.addEventListener('message', listener)
    window.postMessage({ source: 'aitoearn-web', type: 'LOCAL_WX_SPH_PUBLISH_RESULT', requestId, payload: params }, window.location.origin)
  })
}
