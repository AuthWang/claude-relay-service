# Python 一键启动脚本使用指南

## 🚀 概述

Python启动脚本 `start.py` 提供了智能化的一键启动体验，自动处理环境检测、依赖安装、配置生成等繁琐步骤。

## 📋 功能特性

### 🔍 智能环境检测
- **自动检测**: Node.js版本、npm可用性、Docker状态
- **依赖检查**: 自动检测并安装npm依赖
- **前端构建**: 自动构建前端资源
- **端口检测**: 自动检测端口冲突并提示解决方案

### 🛠️ 多种启动模式
- **开发模式**: 热重载开发服务器
- **生产模式**: 优化的生产环境部署
- **Docker模式**: 容器化部署
- **服务管理**: 后台服务控制

### 💡 用户友好
- **彩色输出**: 清晰的状态提示和错误信息
- **跨平台**: Windows/Linux/macOS兼容
- **配置管理**: 自动生成和管理配置文件

## 🎯 使用方法

### 基础命令

```bash
# 查看帮助
python start.py --help

# 系统状态检查
python start.py status
```

### 开发模式

```bash
# 标准开发模式
python start.py dev

# 指定端口
python start.py dev --port 3001
```

**特性**:
- 自动安装依赖
- 自动构建前端
- 启用热重载
- 实时代码检查

### 生产模式

```bash
# 前台运行
python start.py prod

# 后台运行
python start.py prod --daemon

# 指定端口
python start.py prod --port 8080
```

**特性**:
- 代码检查和优化
- 生产环境配置
- 可选后台运行
- 性能监控

### Docker模式

```bash
# 标准Docker启动
python start.py docker

# 重新构建镜像
python start.py docker --rebuild

# 后台运行
python start.py docker --daemon
```

**特性**:
- 自动Docker环境检测
- 可选镜像重建
- 容器状态监控

### 服务管理

```bash
# 启动服务
python start.py service start

# 停止服务
python start.py service stop

# 重启服务
python start.py service restart

# 查看状态
python start.py service status

# 查看日志
python start.py service logs
```

## 🔧 配置管理

### 自动配置生成

脚本会自动检查并生成必要的配置文件：
- `.env` (从 `.env.example` 复制)
- `config/config.js` (从 `config/config.example.js` 复制)
- `config/start_config.json` (Python脚本配置)

### 自定义配置

编辑 `config/start_config.json` 来自定义启动行为：

```json
{
  "default_mode": "dev",
  "ports": {
    "dev": 3000,
    "prod": 3000,
    "redis": 6379
  },
  "docker": {
    "image_name": "claude-relay-service",
    "container_name": "claude-relay"
  },
  "redis": {
    "host": "localhost",
    "port": 6379
  },
  "auto_install": true,
  "auto_build_frontend": true,
  "check_redis": true
}
```

## 🚨 故障排除

### 常见问题

1. **Redis连接失败**
   ```bash
   # 启动Redis服务器
   redis-server

   # 或使用Docker
   docker run -d -p 6379:6379 redis:alpine
   ```

2. **端口被占用**
   ```bash
   # 查看端口占用
   netstat -ano | findstr :3000  # Windows
   lsof -i :3000                 # Linux/macOS

   # 使用其他端口
   python start.py dev --port 3001
   ```

3. **Node.js版本不兼容**
   ```bash
   # 安装Node.js >= 18.0.0
   # 从 https://nodejs.org 下载最新版本
   ```

4. **依赖安装失败**
   ```bash
   # 清理缓存后重试
   npm cache clean --force
   python start.py dev
   ```

### 调试模式

设置环境变量启用详细日志：

```bash
# Windows
set DEBUG=1
python start.py dev

# Linux/macOS
DEBUG=1 python start.py dev
```

## 🔗 NPM 集成

脚本已集成到 `package.json`，可以通过npm命令调用：

```bash
# 等价于 python start.py dev
npm run py:dev

# 等价于 python start.py prod
npm run py:prod

# 等价于 python start.py docker
npm run py:docker

# 等价于 python start.py status
npm run py:status
```

## 📈 性能建议

1. **开发环境**: 使用 `python start.py dev` 获得最佳开发体验
2. **生产环境**: 使用 `python start.py prod --daemon` 后台运行
3. **Docker部署**: 使用 `python start.py docker --daemon` 容器化部署
4. **定期检查**: 使用 `python start.py status` 监控系统状态

## 🤝 贡献

如果您在使用过程中遇到问题或有改进建议，请：

1. 查看此文档的故障排除部分
2. 检查GitHub Issues是否有相关问题
3. 提交新的Issue描述问题详情

---

**注意**: 此脚本需要Python 3.6+版本才能正常运行。