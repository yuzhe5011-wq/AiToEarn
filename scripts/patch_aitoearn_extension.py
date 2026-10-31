#!/usr/bin/env python3
"""Build reproducible short-title and mini-game component patches for 3.3.10.

This maps observed native fields; it does not install an extension or publish.
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import io
import json
from pathlib import Path, PurePosixPath
import struct
import zipfile

SOURCE_SHA256 = 'aa6f51104fa077aa9902b164a4caf9113b0e5451a39ca2b327477694d552f2f5'
SOURCE_VERSION = '3.3.10'
LOCAL_VERSION = '3.3.10.5'
EXTENSION_ID = 'hnmocdhmnfgcjnedmdgfefcobideaeja'
ANCHOR = 'objectDesc:{mpTitle:"",description:t.filter(Boolean).join(" ")'
REPLACEMENT = ('objectDesc:{mpTitle:"",'
               'shortTitle:globalThis.__aitoearnLocalWxFields.buildShortTitle(e.options),'
               'description:t.filter(Boolean).join(" ")')
IMPORT = 'import "./wx-channels-fields.js";\nimport "./wx-channels-audit.js";\n'
EVENT_ANCHOR = ('buildEventInfo(e){const t=e.event;return t?.eventTopicId&&t.eventName?'
                '{eventTopicId:t.eventTopicId,eventName:t.eventName,eventCreatorNickname:t.eventCreatorNickname||"",'
                '..."number"==typeof t.eventAttendCount?{eventAttendCount:t.eventAttendCount}:{}}:{}}')
EVENT_REPLACEMENT = 'buildEventInfo(e){return globalThis.__aitoearnLocalWxFields.buildEventInfo(e)}'
EXT_READING_ANCHOR = 'buildExtReading(e){const t=e.extLink?.trim();return t?{url:t}:{}}'
EXT_READING_REPLACEMENT = 'buildExtReading(e){return globalThis.__aitoearnLocalWxFields.buildExtReading(e)}'
COMPONENT_ANCHOR = 'event:this.buildEventInfo(e.options),mentionedUser:[]'
COMPONENT_REPLACEMENT = ('event:this.buildEventInfo(e.options),'
                         '...globalThis.__aitoearnLocalWxFields.buildComponentFields(e.options),mentionedUser:[]')
CREATE_ANCHOR = 'async createVideo(e){'
CREATE_REPLACEMENT = ('async createVideo(e){return globalThis.__aitoearnLocalWxAudit.createVideo(this,e)}'
                      'async createVideoUnlogged(e){')
CONTEXT_ANCHOR = ('options:{title:e.title,desc:e.desc,topics:e.topics,scheduledTime:e.scheduledTime,'
                  'postFlag:n.postFlag,poiInfo:n.poiInfo,event:n.event,extLink:n.extLink}')
CONTEXT_REPLACEMENT = CONTEXT_ANCHOR[:-1] + ',requestId:e.requestId,accountId:e.accountId}'
API_ANCHOR = 'async requestApi(e,t){const n=await tn.apiRequest(e,{cookie:this.cookie,data:t,timeout:3e4});'
API_REPLACEMENT = ('async requestApi(e,t){await globalThis.__aitoearnLocalWxAudit.beforeRequest(this,e,t);'
                   'const n=await tn.apiRequest(e,{cookie:this.cookie,data:t,timeout:3e4});'
                   'await globalThis.__aitoearnLocalWxAudit.captureResponse(this,n);')
ASSOCIATION_ANCHOR = 'return await this.saveJob(s),await this.updateRecordPending(s),'
ASSOCIATION_REPLACEMENT = ('return await this.saveJob(s),'
                           'await globalThis.__aitoearnLocalWxAudit.associate(s),await this.updateRecordPending(s),')
AUDIT_PATCHES = [(CREATE_ANCHOR, CREATE_REPLACEMENT, 'audit create'),
                 (CONTEXT_ANCHOR, CONTEXT_REPLACEMENT, 'audit context'),
                 (API_ANCHOR, API_REPLACEMENT, 'audit request'),
                 (ASSOCIATION_ANCHOR, ASSOCIATION_REPLACEMENT, 'audit association'),
                 ('D=[p,m,g,f,b,k,S,A,T,I,C,E]',
                  'D=[p,m,g,f,b,k,S,A,T,I,C,E,"HOME_INJECT_LOCAL_WX_PUBLISH_RESULT"]', 'recovery permission'),
                 ('case T:return await this.handleWxSphStartLinkPolling(n);',
                  'case "HOME_INJECT_LOCAL_WX_PUBLISH_RESULT":return await globalThis.__aitoearnLocalWxAudit.lookup(n);case T:return await this.handleWxSphStartLinkPolling(n);', 'recovery dispatch')]


CONTENT_RECOVERY_ANCHOR = 'case E.WX_SPH_START_LINK_POLLING:'
CONTENT_RECOVERY_REPLACEMENT = ('case "LOCAL_WX_SPH_PUBLISH_RESULT":await async function(e,r){'
    'try{const result=await T({action:"HOME_INJECT_LOCAL_WX_PUBLISH_RESULT",payload:e},n.REQUEST);'
    'window.postMessage({source:s,type:"LOCAL_WX_SPH_PUBLISH_RESULT_RESPONSE",requestId:r,result},window.location.origin)'
    '}catch{window.postMessage({source:s,type:"LOCAL_WX_SPH_PUBLISH_RESULT_RESPONSE",requestId:r,result:{success:false}},window.location.origin)}'
    '}(_.payload,r);break;' + CONTENT_RECOVERY_ANCHOR)


def patch_content(source: str) -> str:
    if source.count(CONTENT_RECOVERY_ANCHOR) != 1:
        raise ValueError('Unexpected vendor bundle: exact content recovery anchor required')
    return source.replace(CONTENT_RECOVERY_ANCHOR, CONTENT_RECOVERY_REPLACEMENT, 1)


def patch_background(source: str) -> str:
    if source.count(ANCHOR) != 1:
        raise ValueError('Unexpected vendor bundle: exact video payload anchor required')
    if '__aitoearnLocalWxFields' in source:
        raise ValueError('Bundle is already patched')
    if source.count(EVENT_ANCHOR) != 1:
        raise ValueError('Unexpected vendor bundle: exact activity payload anchor required')
    for anchor, label in [(EXT_READING_ANCHOR, 'reading'), (COMPONENT_ANCHOR, 'component')]:
        if source.count(anchor) != 1:
            raise ValueError(f'Unexpected vendor bundle: exact {label} payload anchor required')
    patched = source.replace(ANCHOR, REPLACEMENT, 1).replace(EVENT_ANCHOR, EVENT_REPLACEMENT, 1)
    patched = patched.replace(EXT_READING_ANCHOR, EXT_READING_REPLACEMENT, 1).replace(COMPONENT_ANCHOR, COMPONENT_REPLACEMENT, 1)
    for anchor, replacement, label in AUDIT_PATCHES:
        if source.count(anchor) != 1:
            raise ValueError(f'Unexpected vendor bundle: exact {label} payload anchor required')
        patched = patched.replace(anchor, replacement, 1)
    return IMPORT + patched


def protobuf_fields(data: bytes):
    def varint(offset):
        result, shift = 0, 0
        while offset < len(data) and shift < 70:
            byte = data[offset]
            offset += 1
            result |= (byte & 127) << shift
            if not byte & 128:
                return result, offset
            shift += 7
        raise ValueError('Invalid CRX protobuf header')

    offset = 0
    while offset < len(data):
        tag, offset = varint(offset)
        wire = tag & 7
        if wire == 2:
            length, offset = varint(offset)
            end = offset + length
            if end > len(data):
                raise ValueError('Truncated CRX header')
            yield tag >> 3, data[offset:end]
            offset = end
        elif wire == 0:
            _, offset = varint(offset)
        elif wire in (1, 5):
            offset += 8 if wire == 1 else 4
        else:
            raise ValueError('Unsupported CRX protobuf wire type')


def public_key(crx: bytes) -> str:
    if crx[:4] != b'Cr24' or len(crx) < 12:
        raise ValueError('Expected CRX3 package')
    version, length = struct.unpack_from('<II', crx, 4)
    if version != 3 or 12 + length > len(crx):
        raise ValueError('Invalid CRX3 header')
    for field, proof in protobuf_fields(crx[12:12 + length]):
        if field not in (2, 3):
            continue
        for key_field, key in protobuf_fields(proof):
            if key_field != 1:
                continue
            digest = hashlib.sha256(key).digest()[:16].hex()
            extension_id = ''.join(chr(ord('a') + int(char, 16)) for char in digest)
            if extension_id == EXTENSION_ID:
                return base64.b64encode(key).decode('ascii')
    raise ValueError('Official extension public key not found')


def build(crx_path: Path, output: Path) -> dict:
    data = crx_path.read_bytes()
    if hashlib.sha256(data).hexdigest() != SOURCE_SHA256:
        raise ValueError('Official CRX SHA-256 differs; review the new package before patching')
    key = public_key(data)
    helper = Path(__file__).parent / 'extension-patches' / 'wx-channels-fields.js'
    audit = helper.with_name('wx-channels-audit.js')
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        manifest = json.loads(archive.read('manifest.json'))
        if manifest['version'] != SOURCE_VERSION:
            raise ValueError('Unexpected extension version')
        patched = patch_background(archive.read('js/background.js').decode('utf-8'))
        content = patch_content(archive.read('js/content_script_home.js').decode('utf-8'))
        # Validate all paths and inputs before creating output.
        for entry in archive.infolist():
            path = PurePosixPath(entry.filename)
            if path.is_absolute() or '..' in path.parts or '\\' in entry.filename:
                raise ValueError('Unsafe ZIP path')
        if output.exists() and any(output.iterdir()):
            raise ValueError('Output must be an empty directory; installed data is never overwritten')
        output.mkdir(parents=True, exist_ok=True)
        for entry in archive.infolist():
            if entry.is_dir() or entry.filename.startswith('_metadata/'):
                continue
            dest = output.joinpath(*PurePosixPath(entry.filename).parts)
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(archive.read(entry))
    manifest['version'] = LOCAL_VERSION
    manifest['version_name'] = SOURCE_VERSION + ' local mini-game recovery patch 5'
    manifest['name'] = 'AiToEarn Extension (Local Short Title Patch)'
    manifest['key'] = key
    manifest.pop('update_url', None)
    (output / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    (output / 'js/background.js').write_text(patched, encoding='utf-8')
    (output / 'js/content_script_home.js').write_text(content, encoding='utf-8')
    (output / 'js/wx-channels-fields.js').write_bytes(helper.read_bytes())
    (output / 'js/wx-channels-audit.js').write_bytes(audit.read_bytes())
    report = {
        'source_version': SOURCE_VERSION, 'source_sha256': SOURCE_SHA256,
        'local_version': LOCAL_VERSION, 'extension_id': EXTENSION_ID,
        'short_title_patch': True, 'mini_game_attachment_implemented': True,
        'activity_quest_metadata_preserved': True,
        'native_update_payload_matched': True, 'platform_publish_verified': False,
        'refresh_result_recovery': True, 'minimal_publish_audit': True, 'audit_retention_count': 100, 'audit_retention_days': 30,
        'installed': False, 'permissions_changed': False,
        'background_sha256': hashlib.sha256(patched.encode()).hexdigest(),
        'audit_helper_sha256': hashlib.sha256(audit.read_bytes()).hexdigest(),
        'note': 'Maps mini-game event, extReading and component fields from a successful native update capture. New publishing and scheduling effects still require verification.',
    }
    (output / 'local-patch-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--crx', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    print(json.dumps(build(args.crx, args.output), ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
