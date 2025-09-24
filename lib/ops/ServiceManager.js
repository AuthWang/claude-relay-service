/**
 * 服务管理核心类
 * 负责启动、停止、重启服务
 */

const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { SystemChecker } = require('./SystemChecker');

class ServiceManager extends SystemChecker {
  constructor(rootDir) {
    super();
    this.rootDir = rootDir;
    this.webDir = path.join(rootDir, 'web', 'admin-spa');
    this.isProd = false;
    this.shouldOpen = false;
    this.processes = [];
  }

  /**
   * 启动服务
   */
  async start(isProd = false, shouldOpen = false) {
    this.isProd = isProd;
    this.shouldOpen = shouldOpen;

    try {
      console.log(`🚀 启动${isProd ? '生产' : '开发'}环境...`);

      await this.ensureDependencies();
      await this.ensureConfig();

      if (this.isProd) {
        await this.startProductionServices();
      } else {
        await this.startDevelopmentServices();
      }

    } catch (error) {
      console.error('❌ 启动失败:', error.message);
      throw error;
    }
  }

  /**
   * 确保依赖已安装
   */
  async ensureDependencies() {
    // 后端依赖
    if (!fs.existsSync(path.join(this.rootDir, 'node_modules'))) {
      console.log('📦 安装后端依赖...');
      execSync('npm install', { stdio: 'inherit', cwd: this.rootDir, shell: true });
    }

    // 前端依赖
    if (!fs.existsSync(path.join(this.webDir, 'node_modules'))) {
      console.log('📦 安装前端依赖...');
      execSync('npm run install:web', { stdio: 'inherit', cwd: this.rootDir, shell: true });
    }
  }

  /**
   * 确保配置文件存在
   */
  async ensureConfig() {
    const envPath = path.join(this.rootDir, '.env');
    const configPath = path.join(this.rootDir, 'config', 'config.js');

    if (!fs.existsSync(envPath) || !fs.existsSync(configPath)) {
      console.log('⚙️ 初始化配置...');

      if (!fs.existsSync(envPath)) {
        fs.copyFileSync(
          path.join(this.rootDir, '.env.example'),
          envPath
        );
        console.log('✅ 已创建 .env 文件');
      }

      if (!fs.existsSync(configPath)) {
        fs.copyFileSync(
          path.join(this.rootDir, 'config', 'config.example.js'),
          configPath
        );
        console.log('✅ 已创建 config.js 文件');
      }

      console.log('\n⚠️ 配置文件已创建，但还需要完成初始化：');
      console.log('📋 下一步操作：');
      console.log('   1. 运行 npm run setup 生成密钥和管理员账户');
      console.log('   2. 根据需要修改 .env 和 config/config.js');
      console.log('   3. 确保 Redis 服务正常运行');

      // 询问是否立即运行 setup
      const rl = require('readline').createInterface({
        input: process.stdin,
        output: process.stdout
      });

      const answer = await new Promise((resolve) => {
        rl.question('\n是否立即运行 npm run setup？(y/n): ', (answer) => {
          rl.close();
          resolve(answer.toLowerCase().trim());
        });
      });

      if (answer === 'y') {
        console.log('🔧 正在运行 npm run setup...');
        try {
          execSync('npm run setup', { stdio: 'inherit', cwd: this.rootDir, shell: true });
          console.log('✅ 初始化完成！');
        } catch (error) {
          console.log('❌ setup 运行失败:', error.message);
          console.log('💡 请手动运行: npm run setup');
        }
      } else {
        console.log('⏸️ 已跳过自动初始化，请稍后手动运行 npm run setup');
      }
    }
  }

  /**
   * 启动开发环境服务
   */
  async startDevelopmentServices() {
    console.log('🔧 启动开发环境...');

    // 启动后端服务
    console.log('📡 启动后端服务 (端口 3000)...');
    const backendProcess = spawn('npm', ['run', 'dev'], {
      cwd: this.rootDir,
      stdio: 'inherit',
      shell: true
    });
    this.processes.push(backendProcess);

    // 等待后端启动
    await this.delay(3000);

    // 启动前端开发服务
    console.log('🌐 启动前端开发服务 (端口 3001)...');
    const frontendProcess = spawn('npm', ['run', 'dev'], {
      cwd: this.webDir,
      stdio: 'inherit',
      shell: true
    });
    this.processes.push(frontendProcess);

    await this.delay(2000);

    if (this.shouldOpen) {
      this.openBrowser('http://localhost:3001');
    }

    console.log('✅ 开发环境启动完成');
    this.showServiceInfo('development');
  }

  /**
   * 启动生产环境服务
   */
  async startProductionServices() {
    console.log('🏭 启动生产环境...');

    // 构建前端
    console.log('🔨 构建前端...');
    execSync('npm run build:web', { stdio: 'inherit', cwd: this.rootDir, shell: true });

    // 启动后端服务
    console.log('📡 启动后端服务...');
    execSync('npm run service:start:daemon', { stdio: 'inherit', cwd: this.rootDir, shell: true });

    console.log('✅ 生产环境启动完成');
    this.showServiceInfo('production');
  }

  /**
   * 停止服务
   */
  async stop() {
    console.log('🛑 停止服务...');

    try {
      // 停止我们启动的进程
      if (this.processes.length > 0) {
        this.processes.forEach(process => {
          if (process && !process.killed) {
            process.kill('SIGTERM');
          }
        });
        this.processes = [];
      }

      // 使用系统方式停止服务
      if (this.isWindows) {
        await this.stopWindowsServices();
      } else {
        await this.stopUnixServices();
      }

      console.log('✅ 服务已停止');
    } catch (error) {
      console.log('⚠️  部分停止操作失败:', error.message);
    }
  }

  /**
   * 重启服务
   */
  async restart() {
    console.log('🔄 重启服务...');
    await this.stop();
    await this.delay(2000);
    await this.start(this.isProd, this.shouldOpen);
  }

  /**
   * Windows服务停止
   */
  async stopWindowsServices() {
    const ports = [3000, 3001];

    for (const port of ports) {
      try {
        const result = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf8' });
        const lines = result.split('\n').filter(line => line.trim());

        const pids = new Set();
        for (const line of lines) {
          const parts = line.trim().split(/\s+/);
          const pid = parts[parts.length - 1];
          if (pid && /^\d+$/.test(pid)) {
            pids.add(pid);
          }
        }

        for (const pid of pids) {
          console.log(`🔫 终止进程 ${pid} (端口 ${port})`);
          execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' });
        }
      } catch (error) {
        // 端口未被占用，忽略
      }
    }
  }

  /**
   * Unix服务停止
   */
  async stopUnixServices() {
    const ports = [3000, 3001];

    for (const port of ports) {
      try {
        const result = execSync(`lsof -ti:${port}`, { encoding: 'utf8' });
        const pids = result.split('\n').filter(pid => pid.trim());

        for (const pid of pids) {
          console.log(`🔫 终止进程 ${pid} (端口 ${port})`);
          execSync(`kill -TERM ${pid}`, { stdio: 'ignore' });
        }
      } catch (error) {
        // 端口未被占用，忽略
      }
    }
  }

  /**
   * 显示服务信息
   */
  showServiceInfo(env) {
    console.log('\n📋 服务信息:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    if (env === 'development') {
      console.log('🔧 开发环境');
      console.log('  后端API: http://localhost:3000');
      console.log('  前端开发服务: http://localhost:3001');
      console.log('  管理界面: http://localhost:3001/admin/');
      console.log('  API代理: /webapi/* -> http://localhost:3000/*');
    } else {
      console.log('🏭 生产环境');
      console.log('  统一服务: http://localhost:3000');
      console.log('  管理界面: http://localhost:3000/admin-next/');
      console.log('  旧版界面: http://localhost:3000/web');
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  }

  /**
   * 打开浏览器
   */
  openBrowser(url) {
    try {
      const command = this.isWindows ? 'start' : (process.platform === 'darwin' ? 'open' : 'xdg-open');
      execSync(`${command} ${url}`, { stdio: 'ignore', shell: true });
      console.log(`🌐 浏览器已打开: ${url}`);
    } catch (error) {
      console.log('⚠️  无法自动打开浏览器，请手动访问:', url);
    }
  }

  /**
   * 延迟函数
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = { ServiceManager };