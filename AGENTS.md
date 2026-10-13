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
- 本地 `main` 跟踪 `origin/main`。Fork 的 `main` 是集成分支，发布后必须同时包含最新 `upstream/main` 和已交付的二开代码。
- `codex/custom-development` 跟踪 `origin/codex/custom-development`，作为日常二开分支。
- 不使用强制推送覆盖远程历史。

### 二开交付流程

当二开任务进入发布阶段时，按以下顺序完成。用户要求分步操作时，按用户指定的步骤推进，不跳过后续检查；记录当前进度，后续继续时从未完成的步骤接着做。

1. 检查工作区、差异和提交内容。只暂存本次确认要交付的文件；不要使用 `git add .`。本地密钥、环境配置、Docker 覆盖文件和生成产物默认不上传，除非用户明确要求。
2. 在 `codex/custom-development` 提交二开改动。
3. 获取 `origin` 与 `upstream` 的最新引用，并检查 `upstream/main` 相对 Fork `main` 的更新，以及远程开发分支上的新提交。
4. 将 `origin/main` 和最新 `upstream/main` 合入本地 `main`；将 `origin/codex/custom-development` 的远程新提交合入本地开发分支；再将本地 `main` 合入 `codex/custom-development`，使开发分支建立在最新集成基线上。
5. 完成项目规定的验证后，将开发分支推送到 `origin/codex/custom-development`。
6. 将开发分支合入本地 `main`。推送前确认最新 `upstream/main` 和已交付开发分支的提交都包含在本地 `main` 中，并检查工作区没有未解决的冲突。
7. 推送到 `origin/main`。推送后重新获取远程状态，确认 `origin/main` 同时包含最新 `upstream/main` 与开发分支提交；若上游在同步期间又前进，则继续同步和核验，直到确认完成。
8. 完成后切回 `codex/custom-development`，并汇报同步、验证、提交和推送结果。

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
