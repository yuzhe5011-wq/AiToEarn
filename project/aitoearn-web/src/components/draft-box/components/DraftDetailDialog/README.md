# 草稿详情私有模块

`../DraftDetailDialog.tsx` 负责弹框、媒体预览和编辑、发布、移动、删除操作。

- `components/DraftDetailInfo/`：标题、正文话题、发布统计、适用平台、生成参数的信息排版；创建时间置于底部操作栏上方，发布情况标题与总次数同排，平台图标和次数置于下一行。
- `utils/draftDetailText.ts`：仅在展示时拆分正文中的独立话题并去重，保留原始草稿数据与 URL 片段。

私有模块仅供草稿详情使用；公共发布统计继续复用 `DraftPublishStats`。
