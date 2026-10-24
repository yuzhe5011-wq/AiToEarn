const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const source = fs.readFileSync(path.join(__dirname,'wx-channels-audit.js'),'utf8')
const event = JSON.parse(fs.readFileSync(path.join(__dirname,'activity-quest.fixture.json'),'utf8'))
const attachment = JSON.parse(fs.readFileSync(path.join(__dirname,'mini-game-attachment.fixture.json'),'utf8'))
const key = 'LocalWxSphPublishAuditV1'
const clone = value => JSON.parse(JSON.stringify(value))
function environment() {
  const state = {data:{},sets:0,warnings:[],fail:false,now:1792211055000}
  class Clock extends Date { static now() { return state.now } }
  const context = vm.createContext({Date:Clock,console:{warn:message=>state.warnings.push(message)},chrome:{
    runtime:{getManifest:()=>({version:'3.3.10.4'})},
    storage:{local:{
      get:async name=>{if(state.fail)throw Error('secret storage error');return clone({[name]:state.data[name]})},
      set:async data=>{if(state.fail)throw Error('secret storage error');state.sets++;Object.assign(state.data,clone(data))},
    }},
  }})
  vm.runInContext(source,context)
  return {state, audit:context.__aitoearnLocalWxAudit}
}
async function publish(env,settings={}) {
  const input={options:{requestId:settings.id||'request-1',accountId:'account-1',event:clone(event),scheduledTime:1792214655000,token:'SECRET_INPUT'},coverUrl:'https://example.test/cover?token=SECRET_COVER'}
  input.options.event.cookie='SECRET_EVENT'
  const body={objectDesc:{event:clone(event),...clone(attachment),shortTitle:[{shortTitle:'玩法还能怎么变'}],media:[{md5sum:settings.id||'media-1',url:'https://example.test/video?token=SECRET_VIDEO'}]},effectiveTime:1792214655,postFlag:0,rawKeyBuff:'SECRET_RAW_KEY'}
  if(settings.mismatch) body.objectDesc.event.eventName='different activity'
  if(settings.longMismatch) {
    input.options.event.eventName='x'.repeat(256)+'input'
    body.objectDesc.event.eventName='x'.repeat(256)+'output'
  }
  if(settings.url) body.objectDesc.extReading={url:'https://example.test/?token=SECRET_READING',title:'SECRET_READING_TITLE'}
  if(settings.omitReadingKeys) body.objectDesc.extReading={urlType:9}
  const result={publishId:'native-result',wxSphLinkAnchor:{mediaMd5sum:body.objectDesc.media[0].md5sum}}
  const publisher={async createVideoUnlogged(){
    if(settings.invalid)throw Error('SECRET_VALIDATION_MESSAGE')
    await env.audit.beforeRequest(publisher,'https://channels.weixin.qq.com/cgi-bin/mmfinderassistant-bin/post/post_create',body)
    if(settings.inspectPrepared)settings.inspectPrepared(clone(env.state.data[key]))
    if(settings.networkFailure){const error=new TypeError('SECRET_NETWORK_URL');error.code='SECRET?token=x';throw error}
    const outer=settings.outer||0,inner=settings.inner||0
    await env.audit.captureResponse(publisher,{errCode:outer,errMsg:'SECRET_RESPONSE',data:{baseResp:{errcode:inner}},token:'SECRET_RESPONSE_TOKEN'})
    if(outer||inner){const error=Error('SECRET_REJECTION_MESSAGE');error.type='PUBLISH_ERROR';throw error}
    return result
  }}
  return {value:await env.audit.createVideo(publisher,input),result}
}
;(async()=>{
  let checks=0
  const env=environment()
  const success=await publish(env,{inspectPrepared:records=>{
    assert.equal(records.length,1);checks++
    assert.equal(records[0].status,'submitted');checks++
    assert.equal(records[0].response,undefined);checks++
  }})
  assert.equal(success.value,success.result);checks++
  let records=clone(await env.audit.read())
  assert.equal(records.length,1);checks++
  assert.equal(records[0].status,'accepted');checks++
  assert.equal(records[0].pluginVersion,'3.3.10.4');checks++
  assert.equal(records[0].requestId,'request-1');checks++
  assert.equal(records[0].inputActivityFieldsMatch,true);checks++
  assert.equal(records[0].attachmentMatchesActivity,true);checks++
  assert.equal(records[0].receivedEvent,undefined);checks++
  assert.deepEqual(records[0].submission.component,attachment.component);checks++
  assert.deepEqual(records[0].submission.extReading,{urlType:9,linkEmpty:true,titleEmpty:true,externalUrlPresent:false});checks++
  assert.equal(env.state.sets,2);checks++
  await env.audit.associate({mediaMd5sum:'media-1',recordId:'project-record-1',authToken:'SECRET_JOB_TOKEN',apiBaseUrl:'SECRET_API_URL'})
  records=clone(await env.audit.read())
  assert.equal(records.length,1);checks++
  assert.equal(records[0].projectRecordId,'project-record-1');checks++
  const sets=env.state.sets
  await env.audit.associate({mediaMd5sum:'media-1',recordId:'project-record-1'})
  await env.audit.associate({mediaMd5sum:'unknown',recordId:'unknown'})
  assert.equal(env.state.sets,sets);checks++
  assert(!JSON.stringify(env.state.data).includes('SECRET'));checks++
  assert(!JSON.stringify(env.state.data).includes('https://'));checks++
  assert.equal(JSON.parse(await env.audit.exportRecords()).records.length,1);checks++

  for(const settings of [{outer:9},{inner:9}]) {
    const failed=environment()
    await assert.rejects(()=>publish(failed,settings));checks++
    const rows=clone(await failed.audit.read())
    assert.equal(rows.length,1);checks++
    assert.equal(rows[0].status,'rejected');checks++
    assert.equal(rows[0].error.code,'PUBLISH_ERROR');checks++
    assert(!JSON.stringify(rows).includes('SECRET'));checks++
  }
  for(const settings of [{invalid:true},{networkFailure:true}]) {
    const failed=environment()
    await assert.rejects(()=>publish(failed,settings));checks++
    const rows=clone(await failed.audit.read())
    assert.equal(rows.length,1);checks++
    assert.equal(rows[0].status,settings.invalid?'validation_failed':'request_failed');checks++
    assert(!JSON.stringify(rows).includes('SECRET'));checks++
  }
  const mismatch=environment()
  await publish(mismatch,{mismatch:true,url:true})
  const row=clone((await mismatch.audit.read())[0])
  assert.equal(row.inputActivityFieldsMatch,false);checks++
  assert.equal(row.receivedEvent.eventName,event.eventName);checks++
  assert.equal(row.event.eventName,'different activity');checks++
  assert.equal(row.attachmentMatchesActivity,false);checks++
  assert(!JSON.stringify(row).includes('SECRET'));checks++
  const long=environment()
  await publish(long,{longMismatch:true})
  const clipped=clone((await long.audit.read())[0])
  assert.equal(clipped.inputActivityFieldsMatch,false);checks++
  assert.equal(clipped.event.eventName.length,256);checks++
  const missing=environment()
  await publish(missing,{omitReadingKeys:true})
  const incompleteReading=clone((await missing.audit.read())[0])
  assert.equal(incompleteReading.attachmentMatchesActivity,false);checks++
  assert.equal(incompleteReading.submission.extReading.linkEmpty,false);checks++
  assert.equal(incompleteReading.submission.extReading.titleEmpty,false);checks++

  const concurrent=environment()
  await Promise.all(Array.from({length:12},(_,i)=>publish(concurrent,{id:`parallel-${i}`})))
  const parallel=clone(await concurrent.audit.read())
  assert.equal(parallel.length,12);checks++
  assert.equal(new Set(parallel.map(item=>item.requestId)).size,12);checks++
  assert(parallel.every(item=>item.status==='accepted'));checks++

  const bounded=environment()
  bounded.state.data[key]=Array.from({length:105},(_,i)=>({schemaVersion:1,auditId:`prior-${i}`,startedAt:bounded.state.now-i*1000}))
  bounded.state.data[key].push({schemaVersion:1,auditId:'expired',startedAt:bounded.state.now-31*86400000})
  await publish(bounded,{id:'latest'})
  const limited=clone(await bounded.audit.read())
  assert.equal(limited.length,100);checks++
  assert.equal(limited[0].requestId,'latest');checks++
  assert(!limited.some(item=>item.auditId==='expired'));checks++
  bounded.state.now+=31*86400000
  assert.equal((await bounded.audit.read()).length,0);checks++
  assert.equal(bounded.state.data[key].length,0);checks++

  const broken=environment();broken.state.fail=true
  const unchanged=await publish(broken)
  assert.equal(unchanged.value,unchanged.result);checks++
  await publish(broken)
  assert.equal(broken.state.warnings.length,1);checks++
  assert(!broken.state.warnings[0].includes('SECRET'));checks++
  console.log(`${checks} audit privacy, persistence, retention and failure-isolation checks passed.`)
})().catch(error=>{console.error(error.message);process.exitCode=1})
