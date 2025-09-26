/**
 * 服务管理核心类
 * 负责启动、停止、重启服务
 */

const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { SystemChecker } = require('./SystemChecker');
const { RedisManager } = require('./RedisManager');

class ServiceManager extends SystemChecker {
  constructor(rootDir) {
    super();
    this.rootDir = rootDir;
    this.webDir = path.join(rootDir, 'web', 'admin-spa');
    this.isProd = false;
    this.shouldOpen = false;
    this.processes = [];
    this.redisManager = new RedisManager(rootDir);
  }

  /**
   * 启动服务
   */
  async start(isProd = false, shouldOpen = false, autoPersist = false, redisStrategy = 'auto') {
    this.isProd = isProd;
    this.shouldOpen = shouldOpen;
    this.autoPersist = autoPersist;
    this.redisStrategy = redisStrategy;

    try {
      console.log(`🚀 启动${isProd ? '生产' : '开发'}环境...`);

      await this.ensureDependencies();

      // 验证关键依赖
      const depsValid = await this.validateDependencies();
      if (!depsValid) {
        console.log('\n💡 建议操作：');
        console.log('   - 运行 node ops.js start --force-install 强制重新安装依赖');
        console.log('   - 或者手动运行 npm install 和 npm run install:web');
        console.log('   - 如果问题持续，删除 node_modules 目录后重新安装\n');
      }

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
   * 检查依赖是否需要更新
   * @param {string} dir - 目录路径
   * @returns {boolean} 是否需要安装依赖
   */
  checkDependencyUpdate(dir) {
    const nodeModulesPath = path.join(dir, 'node_modules');
    const packageJsonPath = path.join(dir, 'package.json');
    const packageLockPath = path.join(dir, 'package-lock.json');

    // 如果node_modules不存在，需要安装
    if (!fs.existsSync(nodeModulesPath)) {
      return true;
    }

    // 检查package.json或package-lock.json是否比node_modules更新
    try {
      const nodeModulesStat = fs.statSync(nodeModulesPath);
      const packageJsonStat = fs.statSync(packageJsonPath);

      // 如果package.json更新了，需要重新安装
      if (packageJsonStat.mtime > nodeModulesStat.mtime) {
        return true;
      }

      // 如果存在package-lock.json且更新了，需要重新安装
      if (fs.existsSync(packageLockPath)) {
        const packageLockStat = fs.statSync(packageLockPath);
        if (packageLockStat.mtime > nodeModulesStat.mtime) {
          return true;
        }
      }
    } catch (error) {
      // 出错时保守处理，执行安装
      return true;
    }

    return false;
  }

  /**
   * 确保依赖已安装
   */
  async ensureDependencies() {
    // 后端依赖检查
    const backendNeedsInstall = this.forceInstall || this.checkDependencyUpdate(this.rootDir);
    if (backendNeedsInstall) {
      console.log('📦 检测到后端依赖更新，正在安装...');
      execSync('npm install', { stdio: 'inherit', cwd: this.rootDir, shell: true });
    }

    // 前端依赖检查
    const frontendNeedsInstall = this.forceInstall || this.checkDependencyUpdate(this.webDir);
    if (frontendNeedsInstall) {
      console.log('📦 检测到前端依赖更新，正在安装...');
      execSync('npm install', { stdio: 'inherit', cwd: this.webDir, shell: true });
    }
  }

  /**
   * 验证关键依赖是否存在
   * @returns {boolean} 验证是否通过
   */
  async validateDependencies() {
    const criticalDeps = ['express', 'ioredis', 'axios', 'winston', 'helmet', 'cors'];
    let allValid = true;

    console.log('🔍 验证关键依赖...');

    for (const dep of criticalDeps) {
      const depPath = path.join(this.rootDir, 'node_modules', dep);
      if (!fs.existsSync(depPath)) {
        console.log(`❌ 缺少关键依赖: ${dep}`);
        allValid = false;
      }
    }

    // 验证前端依赖
    if (fs.existsSync(this.webDir)) {
      const frontendDeps = ['vue', 'vite', '@vitejs/plugin-vue'];
      for (const dep of frontendDeps) {
        const depPath = path.join(this.webDir, 'node_modules', dep);
        if (!fs.existsSync(depPath)) {
          console.log(`❌ 缺少前端依赖: ${dep}`);
          allValid = false;
        }
      }
    }

    if (allValid) {
      console.log('✅ 关键依赖验证通过');
    } else {
      console.log('⚠️ 检测到缺少关键依赖，建议重新安装');
    }

    return allValid;
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
        output: process.stdout,
        terminal: true,
        crlfDelay: Infinity
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

    // 智能检查Redis可用性
    const redisResult = await this.redisManager.checkRedisAvailability();

    if (!redisResult.available) {
      console.log('\n⚠️  Redis不可用，但开发环境需要Redis支持');
      console.log('📝 选择处理方案：');
      console.log('  1. 自动启动Docker Redis（推荐）');
      console.log('  2. 跳过Redis启动（可能出现错误）');
      console.log('  3. 退出启动');

      const choice = await this.redisManager.askUser('请选择 (1/2/3): ');

      switch(choice) {
        case '1':
          console.log('🐳 正在启动Docker Redis...');
          try {
            await this.redisManager.startDockerRedis();
            console.log('✅ Redis已启动，继续启动服务...');
          } catch (error) {
            console.error('❌ Redis启动失败:', error.message);
            const fallback = await this.redisManager.askUser('是否仍要继续启动应用？(y/n): ');
            if (fallback !== 'y') {
              throw new Error('用户取消启动');
            }
          }
          break;
        case '2':
          console.log('⚠️  跳过Redis启动，可能出现连接错误');
          break;
        case '3':
        default:
          throw new Error('用户取消启动');
      }
    }

    // 启动后端服务
    console.log('📡 启动后端服务 (端口 3000)...');
    const backendProcess = spawn('npm', ['run', 'dev'], {
      cwd: this.rootDir,
      stdio: ['ignore', 'inherit', 'inherit'], // 不继承 stdin，保持交互式菜单可用
      shell: true
    });
    this.processes.push(backendProcess);

    // 等待后端启动
    await this.delay(3000);

    // 启动前端开发服务
    console.log('🌐 启动前端开发服务 (端口 3001)...');
    const frontendProcess = spawn('npm', ['run', 'dev'], {
      cwd: this.webDir,
      stdio: ['ignore', 'inherit', 'inherit'], // 不继承 stdin，保持交互式菜单可用
      shell: true
    });
    this.processes.push(frontendProcess);

    await this.delay(2000);

    if (this.shouldOpen) {
      this.openBrowser('http://localhost:3001');
    }

    console.log('✅ 开发环境启动完成');
    console.log('💡 提示: 开发服务器在后台运行，您可以继续使用交互菜单');
    console.log('💡 选择 "0" 或按 Ctrl+C 可以退出并停止所有服务');
    this.showServiceInfo('development');
  }

  /**
   * 启动生产环境服务
   */
  async startProductionServices() {
    console.log('🏭 启动生产环境...');

    // 检查生产环境Redis
    await this.checkProductionRedis();

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
   * 检查生产环境Redis配置
   */
  async checkProductionRedis() {
    console.log('🔍 检查生产环境Redis配置...');

    // 使用与开发环境相同的智能检测
    const redisResult = await this.redisManager.checkRedisAvailability();

    if (redisResult.available) {
      // Redis可用，检查持久化配置
      if (!redisResult.config.persistent) {
        if (this.autoPersist) {
          // 命令行指定自动配置持久化
          console.log('🔧 检测到--auto-persist参数，自动配置Redis持久化...');
          const configSuccess = await this.redisManager.configureRedisPersistence();
          if (configSuccess) {
            console.log('✅ Redis持久化配置完成，继续启动服务...');
          } else {
            console.log('⚠️  自动配置失败，但继续启动服务...');
          }
        } else {
          // 交互式选择
          console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
          console.log('⚠️  检测到Redis未配置持久化（生产环境风险）');
          console.log('');
          console.log('📝 选择处理方案：');
          console.log('  1. 自动配置持久化（推荐）');
          console.log('  2. 继续使用无持久化配置（数据可能丢失）');
          console.log('  3. 退出启动');
          console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

          const choice = await this.redisManager.askUser('请选择 (1/2/3): ');

          switch (choice) {
            case '1':
              console.log('🔧 正在自动配置Redis持久化...');
              const configSuccess = await this.redisManager.configureRedisPersistence();
              if (configSuccess) {
                console.log('✅ Redis持久化配置完成，继续启动服务...');
              } else {
                const continueAnyway = await this.redisManager.askUser('配置失败，是否仍要继续启动？(y/n): ');
                if (continueAnyway !== 'y') {
                  throw new Error('用户取消启动');
                }
              }
              break;
            case '2':
              console.log('⚠️  继续使用无持久化配置，数据重启后将丢失');
              break;
            case '3':
            default:
              throw new Error('用户取消启动');
          }
        }
      } else {
        console.log('✅ Redis持久化配置正常');
      }
      return;
    }

    // Redis不可用，根据命令行参数或提供完整的解决方案
    let choice;

    // 根据命令行指定的Redis策略自动选择
    if (this.redisStrategy === 'docker') {
      console.log('🐳 检测到--redis-docker参数，自动启动持久化Docker Redis...');
      choice = '1';
    } else if (this.redisStrategy === 'local') {
      console.log('📍 检测到--redis-local参数，跳过Redis启动（假设外部Redis可用）...');
      choice = '4';
    } else if (this.redisStrategy === 'external') {
      console.log('☁️  检测到--redis-external参数，跳过Redis启动（使用外部Redis服务）...');
      choice = '4';
    } else {
      // 自动策略或交互式选择
      console.log('\n⚠️  生产环境Redis不可用');
      console.log('📝 选择处理方案：');
      console.log('  1. 启动生产环境持久化Docker Redis（推荐）');
      console.log('  2. 使用Docker Compose（如果存在）');
      console.log('  3. 启动临时Docker Redis（数据不持久）');
      console.log('  4. 跳过（需手动配置外部Redis）');
      console.log('  5. 退出启动');

      choice = await this.redisManager.askUser('请选择 (1/2/3/4/5): ');
    }

    switch (choice) {
      case '1':
        console.log('🏭 启动生产环境持久化Redis...');
        try {
          await this.redisManager.startPersistentDockerRedisForProduction();
          console.log('✅ 生产环境Redis启动成功，继续启动服务...');
        } catch (error) {
          console.error('❌ 生产环境Redis启动失败:', error.message);
          const fallback = await this.redisManager.askUser('是否尝试其他方案？(y/n): ');
          if (fallback === 'y') {
            return await this.checkProductionRedis(); // 重新选择
          } else {
            throw new Error('用户取消启动');
          }
        }
        break;

      case '2':
        if (fs.existsSync(path.join(this.rootDir, 'docker-compose.yml'))) {
          console.log('🐳 使用Docker Compose启动完整环境...');
          try {
            execSync('docker-compose up -d', { stdio: 'inherit', cwd: this.rootDir });
            console.log('✅ Docker Compose环境已启动');
            await this.redisManager.waitForRedis();
          } catch (error) {
            console.error('❌ Docker Compose启动失败:', error.message);
            const fallback = await this.redisManager.askUser('是否尝试其他方案？(y/n): ');
            if (fallback === 'y') {
              return await this.checkProductionRedis(); // 重新选择
            } else {
              throw new Error('用户取消启动');
            }
          }
        } else {
          console.log('❌ 未找到docker-compose.yml文件');
          const retry = await this.redisManager.askUser('是否选择其他方案？(y/n): ');
          if (retry === 'y') {
            return await this.checkProductionRedis(); // 重新选择
          } else {
            throw new Error('用户取消启动');
          }
        }
        break;

      case '3':
        console.log('⚠️  启动临时Docker Redis（数据不持久）...');
        try {
          await this.redisManager.startTemporaryRedis();
          console.log('✅ 临时Redis启动成功');
          console.log('⚠️  注意：容器删除后数据将丢失！');
        } catch (error) {
          console.error('❌ 临时Redis启动失败:', error.message);
          const fallback = await this.redisManager.askUser('是否尝试其他方案？(y/n): ');
          if (fallback === 'y') {
            return await this.checkProductionRedis(); // 重新选择
          } else {
            throw new Error('用户取消启动');
          }
        }
        break;

      case '4':
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('⚠️  跳过Redis启动');
        console.log('');
        console.log('💡 请确保以下之一：');
        console.log('  1. 外部Redis服务已运行（如云Redis）');
        console.log('  2. 修改.env中的REDIS_HOST/REDIS_PORT配置');
        console.log('  3. 手动启动本地Redis服务');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

        const proceed = await this.redisManager.askUser('确定要跳过Redis检查继续启动？(y/n): ');
        if (proceed !== 'y') {
          throw new Error('用户取消启动');
        }
        break;

      case '5':
      default:
        throw new Error('用户取消启动');
    }
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