# 本地素材回环代理

`local-media-loopback.cjs` 供本地容器内的媒体探测服务访问公开 `/oss/` 地址，监听 `127.0.0.1:8080`，转发 GET / HEAD 到 `rustfs.local:9000/aitoearn/`，保留 Range 请求和响应头。它不包含存储凭据。

客户端取消读取或断开连接时，同时销毁上游请求和响应流，避免短读视频元信息后遗留传输，长期占用 RustFS 的磁盘读取名额。上游传输中断时终止下游响应，不保留悬挂连接。

本地现有服务通过 `.local/docker/media-loopback.cjs` 挂载运行。修改本脚本后需将内容复制到该文件，再重启使用它的 `media-loopback` 进程；`.local` 配置和备份不提交仓库。

验证：`node --test scripts/local-media-loopback.test.cjs`。测试覆盖收到首段后取消、收到响应头前取消、正常 GET / HEAD / Range 和上游中断。
