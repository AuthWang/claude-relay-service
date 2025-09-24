#!/usr/bin/env node

/**
 * Claude Relay Service 极简运维脚本
 * 一个文件搞定所有运维操作，零额外依赖
 *
 * 使用方法:
 *   node ops.js start          # 启动开发环境
 *   node ops.js start --prod   # 启动生产环境
 *   node ops.js start --open   # 启动并打开浏览器
 *   node ops.js stop           # 停止所有服务
 *   node ops.js restart        # 重启服务
 *   node ops.js status         # 查看状态
 *   node ops.js logs           # 查看日志
 *   node ops.js logs -f        # 实时日志
 *   node ops.js clean          # 清理日志
 */

const { spawn, exec, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const os = require('os');

class OpsManager {
  constructor() {
    this.rootDir = __dirname;
    this.webDir = path.join(this.rootDir, 'web', 'admin-spa');
    this.isProd = process.argv.includes('--prod');
    this.shouldOpen = process.argv.includes('--open');
    this.processes = [];

    // 平台检测
    this.isWindows = process.platform === 'win32';
  }

  /**
   * 环境检查
   */
  checkEnv() {
    console.log('🔍 检查环境...');

    const checks = {
      '.env文件': fs.existsSync(path.join(this.rootDir, '.env')),
      'config.js': fs.existsSync(path.join(this.rootDir, 'config', 'config.js')),
      '后端依赖': fs.existsSync(path.join(this.rootDir, 'node_modules')),
      '前端依赖': fs.existsSync(path.join(this.webDir, 'node_modules')),
      '端口3000可用': this.isPortAvailable(3000),
      '端口5173可用': this.isPortAvailable(5173)
    };

    // 显示检查结果
    let allGood = true;
    Object.entries(checks).forEach(([name, ok]) => {
      console.log(`  ${ok ? '✅' : '❌'} ${name}`);
      if (!ok) allGood = false;
    });

    return { checks, allGood };
  }

  /**
   * 检查端口是否可用
   */
  isPortAvailable(port) {
    try {
      const cmd = this.isWindows
        ? `netstat -an | findstr :${port}`
        : `netstat -an | grep :${port}`;

      execSync(cmd, { stdio: 'pipe' });
      return false; // 端口被占用
    } catch {
      return true; // 端口可用
    }
  }

  /**
   * 检查端口是否被我们的服务占用
   */
  isOurService(port) {
    try {
      if (this.isWindows) {
        const result = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf8' });
        const lines = result.split('\n').filter(line => line.trim());

        for (const line of lines) {
          const parts = line.trim().split(/\s+/);
          const pid = parts[parts.length - 1];
          if (pid && /^\d+$/.test(pid)) {
            try {
              const taskResult = execSync(`tasklist /FI "PID eq ${pid}" /FO CSV`, { encoding: 'utf8' });
              if (taskResult.includes('node.exe') || taskResult.includes('npm.cmd')) {
                return true;
              }
            } catch {}
          }
        }
      } else {
        const result = execSync(`lsof -ti:${port}`, { encoding: 'utf8' });
        const pids = result.split('\n').filter(pid => pid.trim());

        for (const pid of pids) {
          try {
            const cmdResult = execSync(`ps -p ${pid} -o comm=`, { encoding: 'utf8' });
            if (cmdResult.includes('node') || cmdResult.includes('npm')) {
              return true;
            }
          } catch {}
        }
      }
    } catch {}
    return false;
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
   * 安全执行命令
   */
  async execCommand(command, options = {}) {
    return new Promise((resolve, reject) => {
      exec(command, { ...options, cwd: options.cwd || this.rootDir }, (error, stdout, stderr) => {
        if (error && !options.ignoreError) {
          console.error(`❌ 命令执行失败: ${command}`);
          console.error(stderr);
          reject(error);
        } else {
          if (stdout && !options.silent) console.log(stdout);
          resolve({ stdout, stderr });
        }
      });
    });
  }

  /**
   * 启动服务
   */
  async start() {
    console.log(`🚀 启动${this.isProd ? '生产' : '开发'}环境...`);

    // 环境检查
    const { checks, allGood } = this.checkEnv();

    if (!allGood) {
      console.log('\n⚠️  发现环境问题');

      // 端口冲突处理
      if (!checks['端口3000可用'] || !checks['端口5173可用']) {
        const port3000Our = this.isOurService(3000);
        const port5173Our = this.isOurService(5173);

        if (port3000Our && port5173Our) {
          console.log('📌 服务似乎已经在运行中');
          console.log('📌 后端API: http://localhost:3000');
          console.log('📌 管理界面: http://localhost:5173');
          console.log('📌 项目首页: http://localhost:5173/home');
          return;
        }
      }

      // 询问是否继续
      const answer = await this.prompt('是否继续启动？(y/n): ');
      if (answer !== 'y' && answer !== 'yes') {
        console.log('已取消启动');
        return;
      }
    }

    try {
      // 依赖检查和安装
      await this.ensureDependencies();

      // 配置检查
      await this.ensureConfig();

      // 启动服务
      if (this.isProd) {
        await this.startProductionServices();
      } else {
        await this.startDevelopmentServices();
      }

    } catch (error) {
      console.error('❌ 启动失败:', error.message);
      process.exit(1);
    }
  }

  /**
   * 确保依赖已安装
   */
  async ensureDependencies() {
    // 后端依赖
    if (!fs.existsSync(path.join(this.rootDir, 'node_modules'))) {
      console.log('📦 安装后端依赖...');
      execSync('npm install', { stdio: 'inherit', cwd: this.rootDir });
    }

    // 前端依赖
    if (!fs.existsSync(path.join(this.webDir, 'node_modules'))) {
      console.log('📦 安装前端依赖...');
      execSync('npm run install:web', { stdio: 'inherit', cwd: this.rootDir });
    }
  }

  /**
   * 确保配置文件存在
   */
  async ensureConfig() {
    const envPath = path.join(this.rootDir, '.env');
    const configPath = path.join(this.rootDir, 'config', 'config.js');

    if (!fs.existsSync(envPath) || !fs.existsSync(configPath)) {
      console.log('⚙️  初始化配置...');

      // 复制示例文件
      if (!fs.existsSync(envPath)) {
        fs.copyFileSync(
          path.join(this.rootDir, '.env.example'),
          envPath
        );
      }

      if (!fs.existsSync(configPath)) {
        fs.copyFileSync(
          path.join(this.rootDir, 'config', 'config.example.js'),
          configPath
        );
      }

      // 运行setup脚本
      try {
        execSync('npm run setup', { stdio: 'inherit', cwd: this.rootDir });
      } catch (error) {
        console.log('⚠️  setup脚本执行失败，请手动配置');
      }
    }
  }

  /**
   * 启动生产环境服务
   */
  async startProductionServices() {
    console.log('🏭 启动生产环境服务...');

    // 构建前端
    console.log('📦 构建前端...');
    execSync('npm run build:web', { stdio: 'inherit', cwd: this.rootDir });

    // 启动后端（后台运行）
    console.log('🚀 启动后端服务...');
    execSync('npm run service:start:daemon', { stdio: 'inherit', cwd: this.rootDir });

    // 启动前端预览服务
    console.log('🌐 启动前端服务...');
    const frontend = spawn('npm', ['run', 'preview'], {
      cwd: this.webDir,
      detached: true,
      stdio: 'ignore'
    });
    frontend.unref();

    // 等待服务启动
    await this.waitForServices();

    console.log('\n✅ 生产环境启动成功！');
    console.log('📌 后端API: http://localhost:3000');
    console.log('📌 管理界面: http://localhost:4173');
  }

  /**
   * 启动开发环境服务
   */
  async startDevelopmentServices() {
    console.log('🔧 启动开发环境服务...');

    // 启动后端（开发模式）
    console.log('🚀 启动后端服务（开发模式）...');
    const backend = spawn('npm', ['run', 'dev'], {
      cwd: this.rootDir,
      stdio: 'inherit'
    });
    this.processes.push(backend);

    // 延迟启动前端，让后端先启动
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 启动前端（开发模式）
    console.log('🌐 启动前端服务（开发模式）...');
    const frontend = spawn('npm', ['run', 'dev'], {
      cwd: this.webDir,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    // 监听前端输出，显示重要信息
    frontend.stdout.on('data', (data) => {
      const output = data.toString();
      if (output.includes('Local:') || output.includes('ready in')) {
        console.log('  前端:', output.trim());
      }
    });

    this.processes.push(frontend);

    // 优雅退出处理
    process.on('SIGINT', () => this.stop());
    process.on('SIGTERM', () => this.stop());

    // 等待服务启动
    setTimeout(() => {
      console.log('\n✅ 开发环境启动成功！');
      console.log('📌 后端API: http://localhost:3000');
      console.log('📌 管理界面: http://localhost:5173');
      console.log('📌 项目首页: http://localhost:5173/home');

      // 自动打开浏览器
      if (this.shouldOpen) {
        this.openBrowser('http://localhost:5173/home');
      }

      console.log('\n💡 按 Ctrl+C 停止服务');
    }, 3000);
  }

  /**
   * 等待服务启动
   */
  async waitForServices() {
    const maxRetries = 30; // 30秒超时
    let retries = 0;

    while (retries < maxRetries) {
      try {
        // 检查后端
        const response = await this.execCommand('curl -s http://localhost:3000/health', {
          silent: true,
          ignoreError: true
        });

        if (response.stdout.includes('OK') || response.stdout.includes('success')) {
          return;
        }
      } catch {}

      await new Promise(resolve => setTimeout(resolve, 1000));
      retries++;
    }

    console.log('⚠️  服务启动可能需要更多时间，请稍后手动检查');
  }

  /**
   * 打开浏览器
   */
  openBrowser(url) {
    try {
      const command = this.isWindows ? 'start' :
                     process.platform === 'darwin' ? 'open' : 'xdg-open';

      exec(`${command} ${url}`, { stdio: 'ignore' });
      console.log('🌐 已在浏览器中打开');
    } catch (error) {
      console.log(`💡 请手动访问: ${url}`);
    }
  }

  /**
   * 停止服务
   */
  async stop() {
    console.log('🛑 停止服务...');

    try {
      // 停止后端服务
      console.log('  停止后端服务...');
      await this.execCommand('npm run service:stop', { ignoreError: true });
    } catch {}

    // 停止前端服务
    console.log('  停止前端服务...');
    try {
      if (this.isWindows) {
        // Windows: 杀死vite相关进程
        await this.execCommand('taskkill /F /IM node.exe /FI "COMMANDLINE like *vite*"', {
          ignoreError: true,
          silent: true
        });
      } else {
        // Unix: 杀死vite进程
        await this.execCommand('pkill -f vite', { ignoreError: true, silent: true });
      }
    } catch {}

    // 清理子进程
    this.processes.forEach(proc => {
      try {
        proc.kill('SIGTERM');
      } catch {}
    });
    this.processes = [];

    console.log('✅ 服务已停止');

    // 如果是从Ctrl+C调用，退出进程
    if (arguments[0] !== 'no-exit') {
      process.exit(0);
    }
  }

  /**
   * 重启服务
   */
  async restart() {
    console.log('🔄 重启服务...');
    await this.stop('no-exit');

    // 等待进程完全停止
    await new Promise(resolve => setTimeout(resolve, 2000));

    await this.start();
  }

  /**
   * 查看状态
   */
  async status() {
    console.log('📊 服务状态:');

    try {
      execSync('npm run service:status', { stdio: 'inherit', cwd: this.rootDir });
    } catch {
      console.log('❌ 无法获取后端状态');
    }

    // 检查端口状态
    console.log('\n🔌 端口状态:');
    const ports = [3000, 5173, 4173];

    for (const port of ports) {
      const available = this.isPortAvailable(port);
      const isOurs = available ? false : this.isOurService(port);

      let status;
      if (available) {
        status = '⚪ 未使用';
      } else if (isOurs) {
        status = '🟢 运行中（我们的服务）';
      } else {
        status = '🔴 被其他进程占用';
      }

      console.log(`  端口 ${port}: ${status}`);
    }
  }

  /**
   * 查看日志
   */
  async logs(follow = false) {
    console.log(`📝 查看日志${follow ? '（实时）' : ''}...`);

    try {
      if (follow) {
        // 实时日志
        const logProcess = spawn('npm', ['run', 'service:logs:follow'], {
          cwd: this.rootDir,
          stdio: 'inherit',
          shell: true  // Windows兼容性修复
        });

        const cleanup = () => {
          if (logProcess && !logProcess.killed) {
            logProcess.kill();
          }
        };

        process.on('SIGINT', cleanup);
        process.on('SIGTERM', cleanup);

        logProcess.on('error', (error) => {
          console.log('\n❌ 实时日志启动失败，尝试降级方案...');
          this.fallbackLogs(true);
        });

        logProcess.on('exit', () => {
          process.removeListener('SIGINT', cleanup);
          process.removeListener('SIGTERM', cleanup);
        });
      } else {
        // 静态日志
        try {
          execSync('npm run service:logs', {
            stdio: 'inherit',
            cwd: this.rootDir,
            shell: true  // Windows兼容性修复
          });
        } catch (npmError) {
          // npm脚本执行失败，使用降级方案
          console.log('❌ npm日志脚本执行失败，使用降级方案...');
          await this.fallbackLogs(follow);
        }
      }
    } catch (error) {
      console.log('❌ 日志命令执行异常，尝试降级方案...');
      await this.fallbackLogs(follow);
    }
  }

  /**
   * 日志查看降级方案
   */
  async fallbackLogs(follow = false) {
    console.log('🔄 使用降级方案查看日志...');

    const logsDir = path.join(this.rootDir, 'logs');

    // 检查并创建日志目录
    if (!fs.existsSync(logsDir)) {
      console.log('📁 日志目录不存在');
      try {
        fs.mkdirSync(logsDir, { recursive: true });
        console.log('✅ 已创建日志目录');
      } catch (error) {
        console.log('❌ 无法创建日志目录');
        return;
      }
    }

    // 查找日志文件
    let logFiles = [];
    try {
      logFiles = fs.readdirSync(logsDir)
        .filter(f => f.endsWith('.log'))
        .map(f => ({
          name: f,
          path: path.join(logsDir, f),
          stat: fs.statSync(path.join(logsDir, f))
        }))
        .sort((a, b) => b.stat.mtime - a.stat.mtime);
    } catch (error) {
      console.log('❌ 无法读取日志目录');
      return;
    }

    if (logFiles.length === 0) {
      console.log('⚠️ 暂无日志文件');
      console.log('💡 建议：');
      console.log('  1. 先启动服务生成日志文件');
      console.log('  2. 检查服务是否正常运行');
      return;
    }

    const latestLog = logFiles[0];
    console.log(`📄 最新日志文件: ${latestLog.name}`);

    try {
      if (follow) {
        // 实时跟踪模式
        console.log('🔍 实时跟踪模式（Ctrl+C退出）...');

        if (this.isWindows) {
          // Windows使用PowerShell Get-Content -Wait
          const tailProcess = spawn('powershell', ['-Command', `Get-Content "${latestLog.path}" -Wait`], {
            stdio: 'inherit',
            shell: true
          });

          process.on('SIGINT', () => {
            tailProcess.kill();
          });
        } else {
          // Linux/Mac使用tail -f
          const tailProcess = spawn('tail', ['-f', latestLog.path], {
            stdio: 'inherit'
          });

          process.on('SIGINT', () => {
            tailProcess.kill();
          });
        }
      } else {
        // 静态查看模式
        console.log('📖 显示最近50行日志：');
        console.log('─'.repeat(60));

        const content = fs.readFileSync(latestLog.path, 'utf8');
        const lines = content.split('\n');
        const recentLines = lines.slice(-50).filter(line => line.trim());

        if (recentLines.length === 0) {
          console.log('🔍 日志文件为空');
        } else {
          recentLines.forEach(line => console.log(line));
        }
        console.log('─'.repeat(60));
        console.log(`📊 总共 ${lines.length} 行，显示最近 ${recentLines.length} 行`);
      }
    } catch (error) {
      console.log('❌ 读取日志文件失败:', error.message);

      // 最终降级：显示目录信息
      console.log('\n📂 日志目录信息：');
      logFiles.forEach(file => {
        const size = (file.stat.size / 1024).toFixed(1);
        const time = file.stat.mtime.toLocaleString();
        console.log(`  ${file.name} (${size}KB, ${time})`);
      });
    }
  }

  /**
   * 清理日志和缓存
   */
  async clean() {
    console.log('🧹 清理日志和缓存...');

    try {
      // 清理日志文件
      const logsDir = path.join(this.rootDir, 'logs');
      if (fs.existsSync(logsDir)) {
        const logFiles = fs.readdirSync(logsDir).filter(f => f.endsWith('.log'));
        logFiles.forEach(file => {
          fs.unlinkSync(path.join(logsDir, file));
        });
        console.log(`  清理了 ${logFiles.length} 个日志文件`);
      }

      // 清理npm缓存
      console.log('  清理npm缓存...');
      await this.execCommand('npm cache clean --force', { silent: true });

      console.log('✅ 清理完成');

    } catch (error) {
      console.log('⚠️  部分清理操作失败:', error.message);
    }
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
            this.isProd = false;
            await this.executeWithRetry(() => this.start(), '启动开发环境');
            break;

          case '2':
            console.log('\n🏭 启动生产环境...');
            this.isProd = true;
            await this.executeWithRetry(() => this.start(), '启动生产环境');
            break;

          case '3':
            console.log('\n🛑 停止服务...');
            await this.executeWithRetry(() => this.stop(), '停止服务');
            break;

          case '4':
            console.log('\n🔄 重启服务...');
            await this.executeWithRetry(() => this.restart(), '重启服务');
            break;

          case '5':
            console.log('\n📊 查看服务状态...');
            await this.executeWithRetry(() => this.status(), '查看状态');
            break;

          case '6':
            console.log('\n📝 查看日志...');
            await this.executeWithRetry(() => this.logs(false), '查看日志');
            break;

          case '7':
            console.log('\n📝 实时日志 (Ctrl+C 退出)...');
            await this.executeWithRetry(() => this.logs(true), '实时日志');
            break;

          case '8':
            console.log('\n🧹 清理日志...');
            await this.executeWithRetry(() => this.clean(), '清理日志');
            break;

          case '9':
            this.help();
            break;

          case '0':
            console.log('\n👋 再见!');
            rl.close();
            return;

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

    const serviceRunning = await this.isServiceRunning();
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
      const port3000InUse = !this.isPortAvailable(3000);
      const port5173InUse = !this.isPortAvailable(5173);

      if (port3000InUse || port5173InUse) {
        console.log('\n⚠️ 检测到端口占用：');
        if (port3000InUse) console.log('  - 端口 3000 (后端服务)');
        if (port5173InUse) console.log('  - 端口 5173 (前端开发服务)');

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
   * 检查服务是否运行
   */
  async isServiceRunning() {
    // 简单检查：后端端口3000是否被我们的服务占用
    return !this.isPortAvailable(3000) && this.isOurService(3000);
  }

  /**
   * 显示帮助信息
   */
  help() {
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

环境说明:
  开发环境: 热重载，详细日志，端口3000/5173
  生产环境: 后台运行，构建优化，端口3000/4173

快捷启动:
  npm run ops:start          # 等同于 node ops.js start
  npm run ops:stop           # 等同于 node ops.js stop
  npm run ops:logs           # 等同于 node ops.js logs
    `);
  }
}

// 主入口
async function main() {
  const ops = new OpsManager();
  const [,, command, ...args] = process.argv;

  try {
    switch(command) {
      case 'start':
        await ops.start();
        break;

      case 'stop':
        await ops.stop();
        break;

      case 'restart':
        await ops.restart();
        break;

      case 'status':
        await ops.status();
        break;

      case 'logs':
        await ops.logs(args.includes('-f') || args.includes('--follow'));
        break;

      case 'clean':
        await ops.clean();
        break;

      case 'help':
      case '--help':
      case '-h':
        ops.help();
        break;

      default:
        // 如果没有参数，进入交互模式
        if (args.length === 0) {
          await ops.interactive();
        } else {
          ops.help();
        }
    }
  } catch (error) {
    console.error('❌ 操作失败:', error.message);
    process.exit(1);
  }
}

// 只有直接运行此脚本时才执行main
if (require.main === module) {
  main();
}

module.exports = OpsManager;