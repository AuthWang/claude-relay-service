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
    this.interactive = false;
    this.processes = [];
    this.redisManager = new RedisManager(rootDir);
  }

  /**
   * 启动服务
   */
  async start(
    isProd = false,
    shouldOpen = false,
    autoPersist = null,
    redisStrategy = 'auto',
    interactive = false
  ) {
    this.isProd = isProd;
    this.shouldOpen = shouldOpen;
    // 生产环境默认启用自动持久化，除非明确设置为false
    this.autoPersist = autoPersist !== null ? autoPersist : isProd;
    this.redisStrategy = redisStrategy;
    this.interactive = Boolean(interactive);

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
    const cacheFilePath = path.join(dir, '.dependency-cache.json');

    // 如果node_modules不存在，需要安装
    if (!fs.existsSync(nodeModulesPath)) {
      console.log('  📦 node_modules不存在，需要安装依赖');
      return true;
    }

    try {
      // 读取当前package.json和package-lock.json内容
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      const dependencyFingerprint = this.calculateDependencyFingerprint(dir);

      if (!dependencyFingerprint) {
        console.log('  ⚠️  依赖指纹计算失败，保守安装依赖');
        return true;
      }

      // 读取缓存的依赖指纹
      let cachedFingerprint = null;
      if (fs.existsSync(cacheFilePath)) {
        try {
          const cache = JSON.parse(fs.readFileSync(cacheFilePath, 'utf8'));
          cachedFingerprint = cache.dependencyFingerprint;
        } catch (error) {
          // 缓存文件损坏，忽略
        }
      }

      // 比较指纹
      if (dependencyFingerprint !== cachedFingerprint) {
        console.log('  📦 检测到依赖变化，需要重新安装');
        return true;
      }

      // 检查关键依赖是否实际存在
      const criticalDeps = Object.keys(packageJson.dependencies || {}).slice(0, 3);
      for (const dep of criticalDeps) {
        if (!fs.existsSync(path.join(nodeModulesPath, dep))) {
          console.log(`  📦 关键依赖 ${dep} 缺失，需要重新安装`);
          return true;
        }
      }

      console.log('  ✅ 依赖检查通过，跳过安装');
      return false;

    } catch (error) {
      console.log('  ⚠️  依赖检查出错，保守安装依赖');
      return true;
    }
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
      this.saveDependencyCache(this.rootDir);
    }

    // 前端依赖检查
    if (fs.existsSync(this.webDir)) {
      const frontendNeedsInstall = this.forceInstall || this.checkDependencyUpdate(this.webDir);
      if (frontendNeedsInstall) {
        console.log('📦 检测到前端依赖更新，正在安装...');
        execSync('npm install', { stdio: 'inherit', cwd: this.webDir, shell: true });
        this.saveDependencyCache(this.webDir);
      }
    }
  }

  /**
   * 保存依赖指纹缓存
   * @param {string} dir - 目录路径
   */
  saveDependencyCache(dir) {
    try {
      const cacheFilePath = path.join(dir, '.dependency-cache.json');

      const dependencyFingerprint = this.calculateDependencyFingerprint(dir);

      if (!dependencyFingerprint) {
        console.log('⚠️  保存依赖缓存失败：指纹计算异常');
        return;
      }

      const cache = {
        dependencyFingerprint,
        timestamp: Date.now(),
        nodeVersion: process.version
      };

      fs.writeFileSync(cacheFilePath, JSON.stringify(cache, null, 2));
      console.log('  ✅ 依赖缓存已更新');
    } catch (error) {
      console.log('  ⚠️  保存依赖缓存失败:', error.message);
    }
  }

  /**
   * 计算依赖指纹（基于 package.json 与 package-lock.json 内容）
   */
  calculateDependencyFingerprint(dir) {
    try {
      const packageJsonPath = path.join(dir, 'package.json');
      const packageLockPath = path.join(dir, 'package-lock.json');

      if (!fs.existsSync(packageJsonPath)) {
        return null;
      }

      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      const packageLockRaw = fs.existsSync(packageLockPath)
        ? fs.readFileSync(packageLockPath, 'utf8')
        : '';

      const crypto = require('crypto');
      return crypto
        .createHash('md5')
        .update(JSON.stringify(packageJson.dependencies || {}))
        .update(JSON.stringify(packageJson.devDependencies || {}))
        .update(packageLockRaw)
        .digest('hex');
    } catch (error) {
      console.log(`  ⚠️  依赖指纹计算失败: ${error.message}`);
      return null;
    }
  }

  /**
   * 检查前端是否需要重新构建
   * @returns {boolean} 是否需要构建
   */
  checkFrontendBuildUpdate() {
    if (!fs.existsSync(this.webDir)) {
      return false;
    }

    const distPath = path.join(this.webDir, 'dist');
    const srcPath = path.join(this.webDir, 'src');
    const buildCachePath = path.join(this.webDir, '.build-cache.json');

    // 如果dist目录不存在，需要构建
    if (!fs.existsSync(distPath)) {
      console.log('  🔨 dist目录不存在，需要构建前端');
      return true;
    }

    try {
      // 生成源文件指纹
      const crypto = require('crypto');
      const sourceFingerprint = this.generateSourceFingerprint(srcPath);

      // 读取缓存的构建指纹
      let cachedFingerprint = null;
      if (fs.existsSync(buildCachePath)) {
        try {
          const cache = JSON.parse(fs.readFileSync(buildCachePath, 'utf8'));
          cachedFingerprint = cache.sourceFingerprint;
        } catch (error) {
          // 缓存文件损坏，忽略
        }
      }

      // 比较指纹
      if (sourceFingerprint !== cachedFingerprint) {
        console.log('  🔨 检测到前端源文件变化，需要重新构建');
        return true;
      }

      console.log('  ✅ 前端构建检查通过，跳过构建');
      return false;

    } catch (error) {
      console.log('  ⚠️  前端构建检查出错，保守构建');
      return true;
    }
  }

  /**
   * 生成源文件指纹
   * @param {string} srcPath - 源文件目录
   * @returns {string} 源文件指纹
   */
  generateSourceFingerprint(srcPath) {
    const crypto = require('crypto');
    const hash = crypto.createHash('md5');

    // 递归计算源文件哈希
    const calculateDirHash = (dirPath) => {
      if (!fs.existsSync(dirPath)) return;

      const items = fs.readdirSync(dirPath);
      for (const item of items.sort()) {
        const itemPath = path.join(dirPath, item);
        const stat = fs.statSync(itemPath);

        if (stat.isDirectory()) {
          // 跳过node_modules等目录
          if (item === 'node_modules' || item === '.git' || item === 'dist') {
            continue;
          }
          hash.update(item);
          calculateDirHash(itemPath);
        } else if (stat.isFile()) {
          // 只处理相关文件类型
          const ext = path.extname(item).toLowerCase();
          if (['.vue', '.js', '.ts', '.css', '.scss', '.html', '.json'].includes(ext)) {
            hash.update(item);
            hash.update(stat.mtime.toISOString());
            hash.update(stat.size.toString());
          }
        }
      }
    };

    calculateDirHash(srcPath);

    // 同时包含配置文件的变化
    const configFiles = ['vite.config.js', 'package.json', 'tailwind.config.js', 'postcss.config.js'];
    for (const configFile of configFiles) {
      const configPath = path.join(path.dirname(srcPath), configFile);
      if (fs.existsSync(configPath)) {
        const stat = fs.statSync(configPath);
        hash.update(configFile);
        hash.update(stat.mtime.toISOString());
      }
    }

    return hash.digest('hex');
  }

  /**
   * 保存前端构建缓存
   */
  saveFrontendBuildCache() {
    try {
      const srcPath = path.join(this.webDir, 'src');
      const buildCachePath = path.join(this.webDir, '.build-cache.json');

      const sourceFingerprint = this.generateSourceFingerprint(srcPath);

      const cache = {
        sourceFingerprint,
        timestamp: Date.now(),
        nodeVersion: process.version
      };

      fs.writeFileSync(buildCachePath, JSON.stringify(cache, null, 2));
      console.log('  ✅ 前端构建缓存已更新');
    } catch (error) {
      console.log('  ⚠️  保存前端构建缓存失败:', error.message);
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
    const initJsonPath = path.join(this.rootDir, 'data', 'init.json');

    if (!fs.existsSync(envPath) || !fs.existsSync(configPath) || !fs.existsSync(initJsonPath)) {
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
      if (this.interactive && redisResult.type === 'none' && redisResult.needsInstall) {
        await this.redisManager.promptEnvironmentSetup();
      }

      let choice = '1';
      const validChoices = new Set(['1', '2', '3']);

      if (this.interactive) {
        console.log('\n🧭 请选择 Redis 启动策略：');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('  1) 启动Docker Redis（推荐，默认）');
        console.log('  2) 跳过Redis启动（继续运行，可能报错）');
        console.log('  3) 取消操作（中止整个启动流程）');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

        if (process.stdin.isTTY) {
          const answer = await this.redisManager.askUser('\n请选择 (1/2/3) [默认: 1]: ');
          const normalized = answer || '1';

          if (validChoices.has(normalized)) {
            choice = normalized;
          } else if (normalized) {
            console.log('⚠️  无效选择，继续使用默认方案 (1)。');
          }
        } else {
          console.log('⚠️  当前终端不支持交互输入，使用默认方案 (1)。');
        }
      } else {
        console.log('\n⚠️  Redis不可用，开发环境需要Redis支持');
        console.log('🔧 自动启动Docker Redis（默认选择）...');
        console.log('💡 提示：使用 --interactive 参数可手动选择其他方案');
      }

      switch (choice) {
        case '1':
          console.log('🐳 正在启动Docker Redis...');
          try {
            await this.redisManager.startDockerRedis();
            console.log('✅ Redis已启动，继续启动服务...');
          } catch (error) {
            console.error('❌ Redis启动失败:', error.message);
            console.log('⚠️  Redis启动失败，但继续启动应用（自动选择）');
            console.log('💡 提示：应用可能遇到Redis连接错误');
          }
          break;
        case '2':
          console.log('⚠️  跳过Redis启动，后续请求可能出现连接错误');
          break;
        case '3':
        default:
          throw new Error('用户取消启动');
      }
    }

    if (redisResult.available) {
      if (redisResult.seeded) {
        console.log('✅ 已根据 data/init.json 初始化 Redis 管理员凭据');
      }

      if (redisResult.config && redisResult.config.persistent === false) {
        console.log('⚠️  当前Redis未启用持久化，开发数据在重启后可能丢失');
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

    // 智能前端构建检查
    const needsBuild = this.forceInstall || this.checkFrontendBuildUpdate();
    if (needsBuild) {
      console.log('🔨 构建前端...');
      execSync('npm run build:web', { stdio: 'inherit', cwd: this.rootDir, shell: true });
      this.saveFrontendBuildCache();
    } else {
      console.log('✅ 前端构建已是最新，跳过构建');
    }

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
      if (redisResult.seeded) {
        console.log('✅ 已根据 data/init.json 初始化 Redis 管理员凭据');
      }

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
          // 智能默认选择：自动配置持久化
          console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
          console.log('⚠️  检测到Redis未配置持久化（生产环境风险）');
          console.log('🔧 自动配置Redis持久化（默认选择）...');
          console.log('💡 提示：使用 --interactive 参数可手动选择');
          console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

          const configSuccess = await this.redisManager.configureRedisPersistence();
          if (configSuccess) {
            console.log('✅ Redis持久化配置完成，继续启动服务...');
          } else {
            console.log('⚠️  自动配置失败，但继续启动服务...');
            console.log('💡 建议：稍后手动配置Redis持久化或使用外部Redis服务');
          }
        }
      } else {
        console.log('✅ Redis持久化配置正常');
      }
      return;
    }

    // Redis不可用，根据命令行参数或提供完整的解决方案
    let choice;

    if (this.interactive && redisResult.type === 'none' && redisResult.needsInstall) {
      await this.redisManager.promptEnvironmentSetup();
    }

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
    } else if (this.interactive) {
      console.log('\n🧭 请选择生产环境 Redis 策略：');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('  1) 启动持久化Docker Redis（推荐，默认）');
      console.log('  2) 启动docker-compose环境');
      console.log('  3) 启动临时Docker Redis（不持久化）');
      console.log('  4) 跳过Redis启动（使用外部服务）');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

      const validChoices = new Set(['1', '2', '3', '4']);
      choice = '1';

      if (process.stdin.isTTY) {
        const answer = await this.redisManager.askUser('\n请选择 (1/2/3/4) [默认: 1]: ');
        const normalized = answer || '1';

        if (validChoices.has(normalized)) {
          choice = normalized;
        } else if (normalized) {
          console.log('⚠️  无效选择，继续使用默认方案 (1)。');
        }
      } else {
        console.log('⚠️  当前终端不支持交互输入，使用默认方案 (1)。');
      }
    } else {
      // 智能默认选择：自动启动持久化Docker Redis
      console.log('\n⚠️  生产环境Redis不可用');
      console.log('🔧 自动启动生产环境持久化Docker Redis（默认选择）...');
      console.log('💡 提示：使用 --interactive 参数可手动选择其他方案');
      choice = '1';
    }

    switch (choice) {
      case '1':
        console.log('🏭 启动生产环境持久化Redis...');
        try {
          await this.redisManager.startPersistentDockerRedisForProduction();
          console.log('✅ 生产环境Redis启动成功，继续启动服务...');
        } catch (error) {
          console.error('❌ 生产环境Redis启动失败:', error.message);
          console.log('⚠️  自动回退：尝试启动临时Redis容器');
          try {
            await this.redisManager.startTemporaryRedis();
            console.log('✅ 临时Redis启动成功（数据不持久化）');
          } catch (tempError) {
            console.log('❌ 所有Redis启动方案均失败，继续启动应用');
            console.log('💡 提示：请确保外部Redis服务可用或手动启动Redis');
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
            console.log('⚠️  自动回退：尝试启动生产环境持久化Redis');
            try {
              await this.redisManager.startPersistentDockerRedisForProduction();
              console.log('✅ 生产环境Redis启动成功');
            } catch (fallbackError) {
              console.log('❌ 所有Redis启动方案均失败，继续启动应用');
              console.log('💡 提示：请确保外部Redis服务可用');
            }
          }
        } else {
          console.log('❌ 未找到docker-compose.yml文件');
          console.log('⚠️  自动回退：尝试启动生产环境持久化Redis');
          try {
            await this.redisManager.startPersistentDockerRedisForProduction();
            console.log('✅ 生产环境Redis启动成功');
          } catch (fallbackError) {
            console.log('❌ 所有Redis启动方案均失败，继续启动应用');
            console.log('💡 提示：请确保外部Redis服务可用');
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
          console.log('❌ Redis启动失败，继续启动应用');
          console.log('💡 提示：应用可能遇到Redis连接错误，请确保外部Redis服务可用');
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

        console.log('⚠️  自动跳过Redis检查，继续启动应用（默认选择）');
        console.log('💡 提示：请确保外部Redis服务可用或配置正确的Redis连接参数');
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
   * 清理优化缓存
   */
  cleanOptimizationCache() {
    console.log('🧹 清理优化缓存...');

    const cacheFiles = [
      path.join(this.rootDir, '.dependency-cache.json'),
      path.join(this.webDir, '.dependency-cache.json'),
      path.join(this.webDir, '.build-cache.json')
    ];

    let cleanedCount = 0;
    for (const cacheFile of cacheFiles) {
      try {
        if (fs.existsSync(cacheFile)) {
          fs.unlinkSync(cacheFile);
          cleanedCount++;
          console.log(`  ✅ 已删除: ${path.relative(this.rootDir, cacheFile)}`);
        }
      } catch (error) {
        console.log(`  ⚠️  删除失败: ${path.relative(this.rootDir, cacheFile)} - ${error.message}`);
      }
    }

    if (cleanedCount > 0) {
      console.log(`✅ 已清理 ${cleanedCount} 个缓存文件`);
      console.log('💡 下次启动将重新检查所有依赖和构建');
    } else {
      console.log('✅ 没有找到缓存文件');
    }
  }

  /**
   * 显示优化统计信息
   */
  showOptimizationStats() {
    console.log('\n📊 优化状态统计:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    const cacheFiles = [
      { name: '后端依赖缓存', path: path.join(this.rootDir, '.dependency-cache.json') },
      { name: '前端依赖缓存', path: path.join(this.webDir, '.dependency-cache.json') },
      { name: '前端构建缓存', path: path.join(this.webDir, '.build-cache.json') }
    ];

    for (const cache of cacheFiles) {
      if (fs.existsSync(cache.path)) {
        try {
          const stat = fs.statSync(cache.path);
          const content = JSON.parse(fs.readFileSync(cache.path, 'utf8'));
          const age = Math.floor((Date.now() - stat.mtime.getTime()) / 1000 / 60);
          console.log(`✅ ${cache.name}: 已缓存 (${age}分钟前)`);
          if (content.timestamp) {
            const cacheAge = Math.floor((Date.now() - content.timestamp) / 1000 / 60);
            console.log(`   📅 缓存时间: ${new Date(content.timestamp).toLocaleString()}`);
          }
        } catch (error) {
          console.log(`⚠️  ${cache.name}: 缓存文件损坏`);
        }
      } else {
        console.log(`❌ ${cache.name}: 未缓存`);
      }
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  }

  /**
   * 延迟函数
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = { ServiceManager };
