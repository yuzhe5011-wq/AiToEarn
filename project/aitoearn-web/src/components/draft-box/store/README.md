# 草稿组件域状态

- `publishSubmissionFilterStore.ts`：发布工作台的视频号“未提交”筛选偏好。复用 `createPersistStore`，使用 localStorage，按项目用户 ID 隔离布尔选择；关闭工作台只清理运行时查询，不能清除该偏好。
- `publishSubmissionFilterStore.test.cjs`：通过真实持久化封装验证刷新恢复、主动取消和账号隔离。
