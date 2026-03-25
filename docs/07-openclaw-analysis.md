# 07 — OpenClaw 源码分析：我们是怎么逆向学习 iLink 的

## 为什么要读 OpenClaw 的源码？

iLink 协议没有官方文档。我们唯一的参考是 `@tencent-weixin/openclaw-weixin` 这个 npm 包的 TypeScript 源码。

但这个包和 OpenClaw 插件 SDK 深度耦合，不能直接用在独立项目中。所以我们的策略是：**读源码理解协议，然后用最简代码重新实现**。

## 源码获取方式

```bash
# 从 npm 下载并解包
npm pack @tencent-weixin/openclaw-weixin
tar -xzf tencent-weixin-openclaw-weixin-*.tgz

# 包结构
package/
├── index.ts                    # 插件入口
├── openclaw.plugin.json        # 插件元数据
├── package.json
└── src/
    ├── api/
    │   ├── api.ts              # ⭐ 核心：5 个 HTTP API 实现
    │   ├── types.ts            # ⭐ 核心：协议类型定义
    │   ├── config-cache.ts     # typing_ticket 缓存
    │   └── session-guard.ts    # session 过期处理
    ├── auth/
    │   ├── login-qr.ts         # ⭐ 核心：QR 扫码登录
    │   ├── accounts.ts         # 多账号管理
    │   └── pairing.ts          # 用户配对/白名单
    ├── cdn/
    │   ├── aes-ecb.ts          # AES-128-ECB 加解密
    │   ├── cdn-upload.ts       # CDN 文件上传
    │   ├── cdn-url.ts          # CDN URL 构建
    │   ├── pic-decrypt.ts      # 图片解密
    │   └── upload.ts           # 上传流程封装
    ├── messaging/
    │   ├── inbound.ts          # ⭐ 核心：入站消息处理 + context_token
    │   ├── send.ts             # ⭐ 核心：发送消息
    │   ├── send-media.ts       # 发送媒体文件
    │   ├── process-message.ts  # 消息处理完整流程
    │   ├── slash-commands.ts   # 斜杠命令处理
    │   ├── error-notice.ts     # 错误通知
    │   └── debug-mode.ts       # 调试模式
    ├── monitor/
    │   └── monitor.ts          # ⭐ 核心：long-poll 消息循环
    ├── storage/
    │   ├── state-dir.ts        # 状态目录管理
    │   └── sync-buf.ts         # sync_buf 持久化
    ├── config/
    │   └── config-schema.ts    # Zod 配置校验
    ├── runtime.ts              # 运行时注入
    ├── compat.ts               # 版本兼容检查
    └── util/
        ├── logger.ts           # 日志
        ├── random.ts           # 随机 ID 生成
        └── redact.ts           # 敏感信息脱敏
```

## 我们从中提取了什么

### 从 api.ts 学到的

1. **请求头结构** — `AuthorizationType: ilink_bot_token` + `X-WECHAT-UIN`
2. **超时策略** — long-poll 35 秒，普通 API 15 秒，轻量 API 10 秒
3. **错误处理** — long-poll 的 AbortError 是正常的，返回空响应继续循环

### 从 types.ts 学到的

1. **完整的类型定义** — WeixinMessage、MessageItem、各种 Item 类型
2. **枚举值** — MessageType(USER=1, BOT=2)、MessageState(NEW=0, GENERATING=1, FINISH=2)
3. **context_token 的位置** — 在 WeixinMessage 顶层，不在 item_list 里

### 从 send.ts 学到的（关键！）

1. **from_user_id 必须为空** — `from_user_id: ""`
2. **需要 client_id** — 每条消息唯一标识
3. **消息结构** — item_list 是数组，每次只放一个 item

### 从 login-qr.ts 学到的

1. **两步登录** — get_bot_qrcode → poll get_qrcode_status
2. **bot_type=3** — openclaw-weixin 的类型标识
3. **自动刷新** — QR 过期后最多刷新 3 次
4. **返回字段** — bot_token、ilink_bot_id、baseurl、ilink_user_id

### 从 monitor.ts 学到的

1. **long-poll 循环模式** — while(true) { getUpdates → process → save buf }
2. **错误退避** — 连续失败 3 次后等待 30 秒
3. **session 过期处理** — errcode=-14 时暂停 1 小时

### 从 inbound.ts 学到的

1. **context_token 缓存** — 内存 + 磁盘双重存储
2. **消息文本提取** — TEXT item 直接取 text，VOICE item 取 ASR 转写
3. **引用消息处理** — ref_msg 的 title 和 message_item

## OpenClaw 的架构（供参考）

OpenClaw 本身是一个功能完整的多通道 AI Bot 网关：

```
OpenClaw 架构：

Platform (WeChat/Telegram/Discord/LINE/...)
    ↓
Channel Plugin (extensions/<id>/)
    ↓ (webhook/long-poll)
Gateway (src/gateway/) — 控制面
    ↓ (routing, allowlist, pairing)
Session Resolution (src/routing/)
    ↓
Agent Child Process (src/agents/) — 执行 AI
    ↓ (model + tool calls)
Response → Channel Plugin → Platform
```

它有 82 个扩展（channel + provider），支持多账号、多 agent、消息路由、权限控制等企业级功能。

我们的 `weixin-claude-bot` 只实现了其中最核心的一条通路：WeChat → Claude Code → WeChat。这对教学来说足够了，但如果要做生产级产品，应该考虑集成到 OpenClaw 中。

## 代码量对比

| | openclaw-weixin | weixin-claude-bot |
|---|---|---|
| 总代码量 | ~3756 行 TS | ~400 行 TS |
| API 层 | ~240 行 | ~100 行 |
| 认证层 | ~337 行 | ~100 行 |
| 消息处理 | ~500+ 行 | ~100 行 |
| 媒体/CDN | ~800+ 行 | 暂不支持 |
| 存储层 | ~400+ 行 | ~90 行 |
| 插件集成 | ~1000+ 行 | 不需要 |

我们精简了约 90%，只保留了跑通文本消息所需的最小代码。
