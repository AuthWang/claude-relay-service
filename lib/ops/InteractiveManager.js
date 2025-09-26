/**
 * 交互式管理类
 * 负责用户交互、预检查、错误处理等
 */

const readline = require('readline');

class InteractiveManager {
  constructor(serviceManager, logManager) {
    this.serviceManager = serviceManager;
    this.logManager = logManager;
  }

  /**
   * 交互式模式
   */
  async interactive() {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const askQuestion = (question) => {
      return new Promise((resolve) => {
        rl.question(question, resolve);
      });
    };

    // 处理退出信号
    const handleExit = async () => {
      console.log('\n\n👋 正在退出...');
      try {
        await this.serviceManager.stop();
        console.log('✅ 服务已停止');
      } catch (error) {
        console.log('⚠️  停止服务时出现错误:', error.message);
      }
      rl.close();
      process.exit(0);
    };

    process.on('SIGINT', handleExit);
    process.on('SIGTERM', handleExit);

    console.log('\n🚀 Claude Relay Service 交互式管理');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    while (true) {
      console.log('\n📋 请选择操作:');
      console.log('  1) 启动服务 (开发环境)');
      console.log('  2) 启动服务 (生产环境)');
      console.log('  3) 停止服务');
      console.log('  4) 重启服务');
      console.log('  5) 查看状态');
      console.log('  6) 查看日志');
      console.log('  7) 实时日志');
      console.log('  8) 清理日志');
      console.log('  9) 显示帮助');
      console.log('  0) 退出');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

      const choice = await askQuestion('请输入选择 (0-9): ');

      try {
        const canProceed = await this.preCheck(choice.trim());
        if (!canProceed) {
          continue;
        }

        switch (choice.trim()) {
          case '1':
            console.log('\n🔧 启动开发环境...');
            await this.executeWithRetry(() => this.serviceManager.start(false, false), '启动开发环境');
            break;

          case '2':
            console.log('\n🏭 启动生产环境...');
            await this.executeWithRetry(() => this.serviceManager.start(true, false), '启动生产环境');
            break;

          case '3':
            console.log('\n🛑 停止服务...');
            await this.executeWithRetry(() => this.serviceManager.stop(), '停止服务');
            break;

          case '4':
            console.log('\n🔄 重启服务...');
            await this.executeWithRetry(() => this.serviceManager.restart(), '重启服务');
            break;

          case '5':
            console.log('\n📊 查看服务状态...');
            await this.executeWithRetry(() => this.serviceManager.status(this.serviceManager.rootDir), '查看状态');
            break;

          case '6':
            console.log('\n📝 查看日志...');
            await this.executeWithRetry(() => this.logManager.logs(false), '查看日志');
            break;

          case '7':
            console.log('\n📝 实时日志 (Ctrl+C 退出)...');
            await this.executeWithRetry(() => this.logManager.logs(true), '实时日志');
            break;

          case '8':
            console.log('\n🧹 清理日志...');
            await this.executeWithRetry(() => this.logManager.clean(), '清理日志');
            break;

          case '9':
            this.showHelp();
            break;

          case '0':
            console.log('\n👋 正在退出...');
            try {
              // 停止所有服务
              await this.serviceManager.stop();
              console.log('✅ 服务已停止');
            } catch (error) {
              console.log('⚠️  停止服务时出现错误:', error.message);
            }
            console.log('👋 再见!');
            rl.close();
            process.exit(0);

          default:
            console.log('\n❌ 无效选择，请输入 0-9');
        }
      } catch (error) {
        console.error('\n💥 意外错误:', error.message);
        console.log('📋 错误详情:', error.stack?.split('\n')[0] || '无详细信息');
      }

      // 操作完成后暂停一下
      if (choice.trim() !== '0') {
        await askQuestion('\n按回车键继续...');
      }
    }
  }

  /**
   * 操作预检查
   */
  async preCheck(operation) {
    // 跳过不需要检查的操作
    if (['9', '0', ''].includes(operation)) {
      return true;
    }

    const serviceRunning = await this.serviceManager.isServiceRunning();
    const needsService = ['3', '4', '6', '7']; // 停止、重启、查看日志、实时日志

    if (needsService.includes(operation) && !serviceRunning) {
      console.log('\n⚠️ 检测到服务可能未运行');
      console.log('💡 该操作通常需要服务运行中才有效果');

      const answer = await this.prompt('是否继续执行？(y/n): ');
      if (answer !== 'y') {
        console.log('⏹️ 操作已取消');
        return false;
      }
    }

    // 启动前检查端口占用
    if (['1', '2'].includes(operation)) {
      const port3000InUse = !this.serviceManager.isPortAvailable(3000);
      const port3001InUse = !this.serviceManager.isPortAvailable(3001);

      if (port3000InUse || port3001InUse) {
        console.log('\n⚠️ 检测到端口占用：');
        if (port3000InUse) console.log('  - 端口 3000 (后端服务)');
        if (port3001InUse) console.log('  - 端口 3001 (前端开发服务)');

        const answer = await this.prompt('是否继续启动？可能会失败 (y/n): ');
        if (answer !== 'y') {
          console.log('⏹️ 启动已取消');
          return false;
        }
      }
    }

    return true;
  }

  /**
   * 带重试机制的执行器
   */
  async executeWithRetry(operation, operationName, maxRetries = 1) {
    let lastError = null;

    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
      try {
        await operation();
        return true; // 成功执行
      } catch (error) {
        lastError = error;

        // 分析错误类型并提供建议
        const errorInfo = this.analyzeError(error);

        if (attempt === 1) {
          console.error(`\n❌ ${operationName}失败:`, error.message);

          if (errorInfo.suggestions.length > 0) {
            console.log('\n💡 建议解决方案：');
            errorInfo.suggestions.forEach((suggestion, index) => {
              console.log(`  ${index + 1}. ${suggestion}`);
            });
          }

          if (maxRetries > 0 && errorInfo.canRetry) {
            const answer = await this.prompt('\n是否重试？(y/n): ');
            if (answer !== 'y') {
              break;
            }
          }
        } else {
          console.error(`\n❌ 重试 ${attempt - 1} 失败:`, error.message);
        }
      }
    }

    // 所有重试都失败了
    console.error(`\n💥 ${operationName}最终失败`);
    if (lastError && lastError.code) {
      console.log(`📋 错误代码: ${lastError.code}`);
    }

    return false;
  }

  /**
   * 分析错误并提供建议
   */
  analyzeError(error) {
    const suggestions = [];
    let canRetry = false;

    if (error.code === 'ENOENT') {
      suggestions.push('检查 npm 是否已安装并在 PATH 中');
      suggestions.push('确认项目依赖已完整安装 (npm install)');
      suggestions.push('检查相关脚本文件是否存在');
    } else if (error.code === 'EADDRINUSE') {
      suggestions.push('端口被占用，请停止占用进程或更换端口');
      suggestions.push('使用 "停止服务" 选项清理现有进程');
    } else if (error.message?.includes('Redis')) {
      suggestions.push('检查 Redis 服务是否正常运行');
      suggestions.push('验证 Redis 连接配置是否正确');
    } else if (error.message?.includes('permission') || error.message?.includes('EPERM')) {
      suggestions.push('尝试以管理员身份运行');
      suggestions.push('检查文件/目录权限设置');
    } else if (error.code === 'ECONNREFUSED') {
      suggestions.push('检查相关服务是否启动');
      suggestions.push('验证网络连接和防火墙设置');
    } else {
      suggestions.push('查看完整错误信息');
      suggestions.push('检查系统资源使用情况');
      canRetry = true;
    }

    return { suggestions, canRetry };
  }

  /**
   * 等待用户输入
   */
  async prompt(question) {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    return new Promise(resolve => {
      rl.question(question, answer => {
        rl.close();
        resolve(answer.toLowerCase().trim());
      });
    });
  }

  /**
   * 显示帮助信息
   */
  showHelp() {
    console.log(`
Claude Relay Service 运维工具

使用方法:
  node ops.js start          # 启动开发环境（默认）
  node ops.js start --prod   # 启动生产环境
  node ops.js start --open   # 启动并自动打开浏览器
  node ops.js stop           # 停止所有服务
  node ops.js restart        # 重启服务
  node ops.js status         # 查看服务状态
  node ops.js logs           # 查看日志
  node ops.js logs -f        # 实时查看日志
  node ops.js clean          # 清理日志和缓存

Redis管理参数:
  --auto-persist             # 自动配置Redis持久化（无需交互）
  --redis-docker             # 强制使用Docker Redis
  --redis-local              # 使用本地Redis（跳过启动）
  --redis-external           # 使用外部Redis服务

组合使用示例:
  node ops.js start --prod --auto-persist --redis-docker
  node ops.js start --prod --redis-external

环境说明:
  开发环境:
    - 后端热重载 (nodemon + lint)
    - 前端热重载 (vite)
    - 端口: 后端3000, 前端3001
    - 访问: http://localhost:3001/admin/

  生产环境:
    - 后端守护进程运行
    - 前端构建为静态文件
    - 统一端口: 3000
    - 访问: http://localhost:3000/admin-next/

快捷启动:
  npm run ops:start          # 等同于 node ops.js start
  npm run ops:stop           # 等同于 node ops.js stop
  npm run ops:logs           # 等同于 node ops.js logs
`);
  }
}

module.exports = { InteractiveManager };