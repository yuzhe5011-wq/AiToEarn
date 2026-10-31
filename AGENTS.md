# AGENTS.md

本文件定义 Codex 在 `AiToEarn` 仓库内的默认工作规则。

## Communication

- 默认使用简体中文回复。

## Project Layout

- `project/aitoearn-backend` 是 Nx + pnpm 后端工作区。
- `project/aitoearn-web` 是 Next.js + pnpm 前端项目。
- 根目录主要维护 README、Docker 部署文档、`docker-compose.yml` 和展示资源。

## Package & Command Rules

- backend/web 使用 `pnpm`。
- 根目录没有统一 package，不要在根目录随手执行 install/build。
- backend 改动优先在 `project/aitoearn-backend` 用 `pnpm nx ...` 验证，并遵循 `project/aitoearn-backend/CLAUDE.md`。
- web 改动在 `project/aitoearn-web` 验证，优先使用 `pnpm run type-check` 和 `pnpm build`。
- 纯文档改动至少运行 `git diff --check`。

## Git Workflow

### Remotes and branches

- `origin` 是用户的 GitHub Fork；`upstream` 是官方仓库。默认只向 `origin` 推送，不向 `upstream` 推送。
- 本地 `main` 跟踪 `origin/main`。Fork 的 `main` 是集成分支，默认只集成 Fork 自身的 main 与已交付二开代码；仅在用户明确要求同步上游时，才获取和合入 `upstream/main`。
- `codex/custom-development` 跟踪 `origin/codex/custom-development`，作为日常二开分支。
- 不使用强制推送覆盖远程历史。

### 二开交付流程

当二开任务进入发布阶段时，按以下顺序完成。用户要求分步操作时，按用户指定的步骤推进，不跳过后续检查；记录当前进度，后续继续时从未完成的步骤接着做。

1. 检查工作区、差异和提交内容。只暂存本次确认要交付的文件；不要使用 `git add .`。本地密钥、环境配置、Docker 覆盖文件和生成产物默认不上传，除非用户明确要求。
2. 在 `codex/custom-development` 提交二开改动。
3. 默认只获取 `origin` 的最新引用，检查远程 main 和开发分支的新提交；只有用户明确要求同步上游时，才获取 `upstream` 并检查其更新。
4. 将 `origin/main` 合入本地 `main`；仅在用户明确要求同步上游时，再合入最新 `upstream/main`。将 `origin/codex/custom-development` 的远程新提交合入本地开发分支，再将本地 `main` 合入 `codex/custom-development`。
5. 完成项目规定的验证后，将开发分支推送到 `origin/codex/custom-development`。
6. 将开发分支合入本地 `main`。推送前确认已交付开发分支的提交包含在本地 `main` 中；本次明确要求同步上游时，还需确认最新 `upstream/main` 已包含在内，并检查工作区没有未解决的冲突。
7. 推送到 `origin/main`。推送后重新获取 `origin` 状态，确认远程 main 包含开发分支提交。仅在本次明确要求同步上游时，再获取和核验 `upstream/main`；若上游在同步期间又前进，继续同步和核验。
8. 完成后切回 `codex/custom-development`，并汇报同步、验证、提交和推送结果。

### 推送完成后的汇报格式

- 推送、合并完成后的最终汇报必须使用 Markdown 表格，以“项目｜结果”两列展示，不使用项目符号列表替代表格。
- 表格应包含：代码审查、验证结果、提交短 SHA、远程开发分支、远程 main、上游同步、当前本地分支和工作区状态。
- 本次涉及本地服务更新或重启时，增加“本地服务”行，说明重启与健康检查结果。
- 按实际执行结果填写；未执行、未完成、失败或不适用的项目应明确标注，不得默认写成通过或已完成。存在阻塞时，在表格后简要说明原因与下一步。

### Merge conflicts

- 任何合并出现冲突时，立即暂停集成；不自行选择 ours/theirs、不编辑冲突内容、不提交冲突结果，也不推送 `origin/main`。
- 向用户列出冲突文件、相关分支及需要决定的内容，等待用户指示后再继续。不要擅自中止合并或重置工作区。

## Documentation Rules

- 根 README 对外文档包含 `README.md`、`README_EN.md`、`README_JA.md`；涉及用户可见能力、安装、OpenClaw、MCP、Relay、API Key 或环境地址时默认三语同步。
- Docker 部署说明涉及生产部署、环境变量或 `docker compose` 时，同步检查 `DOCKER_DEPLOYMENT_CN.md` 和 `DOCKER_DEPLOYMENT_EN.md`。
- README 类改动保持最小可用改写，不要把参考文档整段复制进来。
- 用户可见 README、skill、capability reference 只写当前能力与环境规则，不写 `dev`、测试环境、验证日期等来源说明。

## Environment Rules

- OpenClaw、MCP、Relay 都必须明确区分中国版和国际版环境：`*.aitoearn.cn` 属于中国版，`*.aitoearn.ai` 属于国际版。
- 中国版 API Key 只能搭配 `aitoearn.cn` 相关 URL；国际版 API Key 只能搭配 `aitoearn.ai` 相关 URL。环境和 Key 不匹配会导致 401。
- MCP 示例需要按环境区分 `https://aitoearn.cn/api/unified/mcp` / `https://aitoearn.ai/api/unified/mcp`，SSE 示例同理区分 `/api/unified/sse`。
- Relay 示例需要按 `RELAY_API_KEY` 来源选择 `RELAY_SERVER_URL`：中国版使用 `https://aitoearn.cn/api`，国际版使用 `https://aitoearn.ai/api`。
