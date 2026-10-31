# 本地视频号插件修补 / Local extension patch / ローカル拡張パッチ

## 中文

这是对官方 AiToEarn Extension 3.3.10 的本地修补工具，不是官方发行版。本地版本为 **3.3.10.6**。

- 设置 `objectDesc.shortTitle: [{ shortTitle: title }]`，要求标题为 6–16 个 Unicode 码点。
- 保留活动的 `questFlag`、`questInfo`。标记为推广但组件信息不完整时阻止提交，要求重新选择。
- 对 `questFlag=1`、`questInfo.componentType=2` 的小游戏活动，构造同级 `objectDesc.component`，包含 AppID、类型、名称、`appearedSeconds: 0`、`appearedMode: 0`。
- 对上述小游戏构造 `objectDesc.extReading: { link: '', title: '', urlType: 9 }`；无需猜测一个实际链接。普通活动不添加小游戏组件，原有普通 extLink 路径保持原样。

挂载结构与官方页面成功保存请求中的对应字段一致。**新建发布和排期的实际挂载效果仍需验证，不应将离线参数一致视为平台验证成功。**
短标题结构对照：[公开发布实现](https://github.com/liuxuehao/weixinshipinhao_publisher/blob/main/channels_publisher.py)。

构建器只接受已审查的官方 CRX SHA-256，官方包不提交到仓库。输出目录必须不存在或为空。

```sh
python3 scripts/patch_aitoearn_extension.py \
  --crx .local/plugin-version-check/aitoearn-extension-china.crx \
  --output .local/extension-staging/3.3.10.6
node --check .local/extension-staging/3.3.10.6/js/background.js
node scripts/extension-patches/test-payload.cjs .local/extension-staging/3.3.10.6
node scripts/extension-patches/test-web-options.cjs
node scripts/extension-patches/test-audit.cjs
node scripts/extension-patches/test-refresh-recovery.cjs .local/extension-staging/3.3.10.6
python3 -m unittest discover -s scripts/extension-patches -p 'test_*.py' -v
```

安装：Chrome 扩展管理页开启开发者模式，加载构建目录。同一插件 ID 不能同时加载官方版和本地版。已有安装目录的文件更新后，需在扩展管理页重新加载，再刷新 AiToEarn 页面。
构建器保留官方公钥以保持插件 ID，移除本地版自动更新入口，保留原权限列表和许可证。不要删除已有插件数据；替换前保留必要配置。
这是带名称标识的本地修改，不能用官方签名重新打包。恢复官方版本时使用官方安装渠道。
本工具不操作浏览器、不自动安装、不触发上传、发布或排期，也不修复项目后端的本地 URL 校验。

必要日志采用每次发布一条、原地更新的本地诊断记录，位于插件存储 `LocalWxSphPublishAuditV1`：

- 沿用前端 requestId，记录插件版本、提交时间及定时时间。
- 记录最终活动业务字段、小游戏组件、短标题、阅读类型和原创选项；对比插件收到的活动与最终活动，正常只保存一份活动，发生差异才另存输入快照。
- 保存微信内外层响应码和有限的错误类别，不保存原始错误文本或堆栈。`accepted` 仅表示接口接受，不表示已经公开发布或完成展示核验。
- 使用已有 mediaMd5sum 关联项目发布记录 ID，不新增后端接口、不增加平台查询或轮询次数。

只保留最近 100 次、最长 30 天，读写时清理过期数据。没有完整搜索列表、上传进度、媒体 URL、Cookie、Token、鉴权头或签名地址。日志存储失败不会改变原发布结果。
授权网站可通过只读消息接口按 requestId、账号和定时时间精确查询单次结果，用于页面刷新后的恢复；不导出完整诊断列表，不触发平台请求。
插件后台可通过 `__aitoearnLocalWxAudit.read()` 读取，或 `__aitoearnLocalWxAudit.exportRecords()` 导出脱敏 JSON。

`wx-channels-fields.js` 是可读的字段实现；请求构造测试执行完整供应商发布类。脱敏 fixture 不包含 Cookie、登录凭据或真实活动标识。

## English

Local version **3.3.10.6** modifies the official AiToEarn Extension 3.3.10; it is not an official release.
It maps short titles, retains activity questFlag/questInfo and builds the mini-game component plus extReading fields observed in a successful native save request.
For questFlag=1 and componentType=2, extReading uses empty link/title with urlType=9. Component ID, type and title come from the activity; appearance values are zero.
Incomplete promotion metadata blocks submission. Ordinary activities do not receive a mini-game component.
The payload mapping has been checked against native samples. Actual behavior after a local patch update still needs verification; offline tests alone do not establish platform success.

Minimal local diagnostics keep one updated record per publishing attempt, including the received/submitted activity comparison, attachment fields, response codes and project-record association. Retention is capped at 100 attempts and 30 days. No credentials, media URLs, full search lists or upload progress are recorded. Storage errors do not alter publication results; accepted means API acceptance only. Authorized websites can query one attempt by request ID, account and scheduled time to recover after a refresh. This read-only bridge returns no full logs and makes no platform request. Read/export through `__aitoearnLocalWxAudit.read()` / `exportRecords()` in the extension background context.

Use the build/check commands above. Load the unpacked output in Chrome; reload the extension after updating an existing installed directory, then refresh AiToEarn.
The builder pins the original CRX SHA-256, preserves its public key/ID, permissions and licenses, and removes automatic updates for the local build.
Back up settings before replacement. Existing and local builds share an ID and cannot run together.
The tool does not upload, publish, schedule or install automatically. Fixtures contain no session credentials.

## 日本語

ローカル版 **3.3.10.6** は公式 AiToEarn Extension 3.3.10 を基にした修正版であり、公式リリースではありません。
短いタイトルとイベントの questFlag / questInfo を保持し、公式画面で保存に成功した構造に合わせてミニゲームの component と extReading を生成します。
questFlag=1・componentType=2 の場合、extReading は空の link/title と urlType=9 を使用します。component の ID・種類・名前はイベントから取得し、表示設定はゼロです。
不完全なプロモーション情報は送信を停止します。通常のイベントにはゲームコンポーネントを追加しません。
構造は公式サンプルと照合しています。更新後の実際の動作は確認が必要であり、オフライン検証だけで投稿成功とは判断できません。

診断ログは投稿ごとに1件を更新し、活動の受信・送信一致、添付項目、応答コード、プロジェクト記録との関連を保持します。最大100件・30日です。認証情報、メディアURL、検索一覧、アップロード進捗は保存しません。保存失敗は投稿結果を変更せず、accepted はAPI受付のみを示します。許可済みサイトはリクエストID・アカウント・予約時刻が一致する1件のみ読み取り、更新後に復元できます。全ログの公開やプラットフォームへの再送信は行いません。拡張のバックグラウンドで `__aitoearnLocalWxAudit.read()` / `exportRecords()` を利用できます。

上記のビルド・検証後、Chrome で出力ディレクトリーを読み込んでください。既存フォルダーを更新した場合は拡張機能を再読み込みし、AiToEarn を更新してください。
元の公開鍵・ID・権限・ライセンスを保持し、ローカル版の自動更新設定を削除します。切替前に必要な設定をバックアップしてください。
アップロード、投稿、予約、自動インストールは実行しません。fixture に認証情報は含みません。
