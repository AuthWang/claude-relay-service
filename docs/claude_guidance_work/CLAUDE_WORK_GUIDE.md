# Claude 工作指导（管理员账号与邀请制改造）

## 目标概述
- 允许在管理后台创建/维护多个管理员账号，不再依赖 data/init.json 明文凭证。
- 支持多管理员同时登录，并保留会话控制、审计能力。
- 新增邀请制注册流程：只有持有效邀请的人员才能创建管理员账号。
- Claude 完成改造后需执行接口测试与前端自动化测试（Playwright）。

## 架构改动 TODOs

### 1. 身份与邀请数据模型
- [ ] 设计 dmin_users 表（PostgreSQL）及缓存结构（Redis）：id, mail, password_hash, ole, status, 
eed_password_reset, created_at, last_login_at, invited_by 等。
- [ ] 设计 dmin_invites 表/Redis 键：id, 	oken, mail, xpires_at, created_by, edeemed_at, status。
- [ ] 在 src/models/database.js 或新建 src/models/adminUserRepository.js，封装管理员与邀请的 CRUD 操作。

### 2. 登录会话与权限
- [ ] 改造 src/routes/web.js 登录流程：从新数据源读取管理员信息，验证密码，写入 session（字段包含 dminId, ole, 
eedPasswordReset）。
- [ ] 更新 src/middleware/auth.js 中 uthenticateAdmin，基于 dminId 校验用户状态、角色与禁用标志。
- [ ] 移除所有读取 data/init.json 的逻辑；启动时若检测旧文件，提示使用迁移脚本。

### 3. 管理后台功能
- [ ] 在 src/routes/admin.js 新增管理员管理 API：列出、创建、禁用、重置密码、重发邀请（仅 super_admin 可用）。
- [ ] 扩展 web/admin-spa 管理页面：展示管理员列表、创建/禁用入口、邀请记录。
- [ ] 视需求通知 webhook (webhookService) 记录管理员新增/禁用事件。

### 4. 邀请制注册流程
- [ ] 新增 API：POST /admin/invites（生成邀请）、GET /admin/invites、POST /auth/invite/verify、POST /auth/register（携 token 注册）。
- [ ] 在 src/routes/web.js 中新增注册路由，校验邀请 token 后创建管理员账号，要求设置密码。
- [ ] 添加邀请有效期配置：新增 ADMIN_INVITE_EXPIRY_HOURS 等环境变量。

### 5. 密码安全 & 自助改密
- [ ] 抽象 src/utils/passwordHelper.js，统一 crypt hash/compare。
- [ ] src/routes/web.js:/auth/change-password 更新为使用新数据层。
- [ ] 补充密码复杂度校验与首次登陆强制改密机制。

### 6. 会话与审计
- [ ] 在 src/routes/admin.js 写入登录日志（成功/失败），存入数据库或日志文件。
- [ ] 支持 config.security.maxAdminSessionsPerUser（可选），限制单账号并发登录数。
- [ ] 后续可接入 webhookService 或 logs/security 记录敏感操作。

### 7. CLI 与迁移
- [ ] 更新 cli/index.js：新增 dmin invite, dmin list, dmin deactivate 等命令；移除 data/init.json 读取。
- [ ] 编写 scripts/migrate-admin-users.js：旧版本迁移到新结构时生成首个 super_admin。
- [ ] 将 data/init.json 加入 .gitignore 并在文档说明废弃。

### 8. 前端改动
- [ ] 登录页调整：提供“受邀注册”入口、错误提示、本地化文案。
- [ ] 新增注册页面（输入邀请 token、邮箱、密码）；完成后跳转登录。
- [ ] 在管理员管理页面集成邀请生成、状态显示与撤销操作。

### 9. 配置与文档
- [ ] 更新 .env.example、README.md 与 docs/CLAUDE_WORK_GUIDE.md，说明新流程。
- [ ] 在 docs/claude_guidance_work/ 中维护迁移手册与操作指南。
- [ ] 删除仓库内任何默认管理员凭证，指导部署时通过 CLI/邀请生成。

## 测试要求

### A. 接口测试（Jest + Supertest）
- [ ] 登录/注销：正确凭证成功、不正确失败、禁用账号拦截。
- [ ] 邀请流程：生成邀请→验证→注册→首登改密。
- [ ] 管理员 CRUD 权限：普通管理员无法创建邀请、super_admin 可操作。
- [ ] 会话并发：超出配置时旧 session 失效（若实现）。

### B. 前端自动化测试（Playwright）
- [ ] 脚本入口：	ests/playwright/admin-invite.spec.ts
- 场景：
  1. 管理员登录后台（使用新 API 初始化的 super_admin）。
  2. 打开管理员管理页，创建邀请，复制 token。
  3. 在新窗口/上下文中访问注册页面，填入邀请 token、设置密码。
  4. 新账号登录后台，验证可见自己信息。
  5. 返回 super_admin 会话，禁用/删除新管理员，界面正确更新。
- [ ] Playwright 配置需在 package.json 增加 	est:e2e 脚本，并确保 
pm run test:e2e 可执行。

### C. 集成校验
- [ ] CI 脚本中增加接口测试 (
pm test) 与前端测试 (
pm run test:e2e) 两个步骤。
- [ ] 改造完成后，在本地按顺序运行：
  1. 
pm run lint
  2. 
pm test
  3. 
pm run test:e2e
  记录输出供 review。

## 完成交付要求
- 代码提交前，确保：
  - 新建/修改数据表的迁移脚本已包含。
  - README 与 docs/claude_guidance_work/ 文档同步更新。
  - 所有测试命令成功执行，并附带报告或截图（Playwright 可输出 HTML 报告）。
- 若部署环境已有旧版管理员账号，提供手动/自动迁移流程说明。

> 执行完上述 TODOs 后，请在 PR 描述附上接口测试与 Playwright 自动化测试的运行结果（命令与关键日志），方便审核。
