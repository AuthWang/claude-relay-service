/**
 * Redis管理器
 * 负责Redis服务的智能检测、启动和数据管理
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const Redis = require('ioredis');

class RedisManager {
  constructor(rootDir) {
    this.rootDir = rootDir;
    this.isWindows = process.platform === 'win32';
    this.redisDataDir = path.join(rootDir, 'redis_data');
    this.dockerComposeFile = path.join(rootDir, 'docker-compose.yml');
  }

  /**
   * 智能检测Redis环境并提供最佳方案
   */
  async checkRedisAvailability() {
    console.log('🔍 智能检测Redis环境...');

    // 1. 检查本地Redis连接
    const localStatus = await this.getLocalRedisStatus();
    if (localStatus.available) {
      const seedInfo = await this.initializeRedisDefaults(localStatus);
      localStatus.seeded = seedInfo.seeded;
      this.showRedisStatus('本地Redis', localStatus.config);
      return localStatus;
    }

    // 2. 检查现有数据和容器
    const redisEnvironment = this.analyzeRedisEnvironment();

    if (redisEnvironment.runningContainer) {
      const runningStatus = await this.getLocalRedisStatus();
      if (runningStatus.available) {
        const seedInfo = await this.initializeRedisDefaults(runningStatus);
        runningStatus.seeded = seedInfo.seeded;
        this.showRedisStatus('Docker Redis', runningStatus.config);
        return runningStatus;
      }
    }

    // 3. 检查Docker环境
    const dockerAvailable = this.checkDockerEnvironment();
    if (!dockerAvailable) {
      this.showRedisUnavailableOptions();
      return { available: false, type: 'none', needsInstall: true };
    }

    // 4. 优先尝试复用现有数据或容器
    if (redisEnvironment.hasStoppedContainer) {
      try {
        const restarted = await this.restartStoppedContainer();
        if (restarted?.available) {
          restarted.config = await this.fetchRedisConfig();
          const seedInfo = await this.initializeRedisDefaults(restarted);
          restarted.seeded = seedInfo.seeded;
          return restarted;
        }
      } catch (error) {
        console.log(`⚠️  重启已存在的Redis容器失败: ${error.message}`);
      }
    }

    if (redisEnvironment.hasHistoryData) {
      try {
        const reused = await this.startPersistentRedis(true);
        if (reused?.available) {
          const seedInfo = await this.initializeRedisDefaults(reused);
          reused.seeded = seedInfo.seeded;
          return reused;
        }
      } catch (error) {
        console.log(`⚠️  复用历史Redis数据失败: ${error.message}`);
      }
    }

    // 5. 启动新的持久化Redis容器（挂载项目数据目录）
    try {
      const fresh = await this.startPersistentRedis(false);
      if (fresh?.available) {
        const seedInfo = await this.initializeRedisDefaults(fresh);
        fresh.seeded = seedInfo.seeded;
        fresh.bootstrap = true;
        return fresh;
      }
    } catch (error) {
      console.log(`⚠️  启动新的Redis容器失败: ${error.message}`);
    }

    // 6. 回退到交互式选项
    if (!process.stdin.isTTY) {
      console.log('⚠️  当前终端不支持交互操作，请先安装 Docker 或本地 Redis 后重试');
      return { available: false, type: 'none', needsInstall: true };
    }

    return await this.provideRedisOptions(redisEnvironment);
  }

  /**
   * 检查本地Redis连接
   */
  async checkLocalRedis(options = {}) {
    const { host = '127.0.0.1', port = 6379, silent = false } = options;

    try {
      const { createConnection } = require('net');
      await new Promise((resolve, reject) => {
        const connection = createConnection({ host, port });

        connection.on('connect', () => {
          connection.end();
          resolve();
        });

        connection.on('error', (err) => {
          connection.destroy();
          reject(err);
        });

        setTimeout(() => {
          connection.destroy();
          reject(new Error('Connection timeout'));
        }, 2000);
      });

      if (!silent) {
        console.log(`✅ 检测到本地Redis服务 (${host}:${port})`);
      }
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * 获取本地Redis状态及配置
   */
  async getLocalRedisStatus(options = {}) {
    const { host = '127.0.0.1', port = 6379, password = undefined } = options;

    const available = await this.checkLocalRedis({ host, port });
    if (!available) {
      return { available: false };
    }

    const config = await this.fetchRedisConfig({ host, port, password });
    return {
      available: true,
      type: 'local',
      host,
      port,
      password,
      config
    };
  }

  /**
   * 获取Redis配置（适用于本地或Docker）
   */
  async fetchRedisConfig(options = {}) {
    const { host = '127.0.0.1', port = 6379, password = undefined } = options;

    let client;
    try {
      client = new Redis({
        host,
        port,
        password,
        lazyConnect: true
      });

      await client.connect();

      const save = await client.config('GET', 'save');
      const appendonly = await client.config('GET', 'appendonly');
      const dir = await client.config('GET', 'dir');
      const dbfilename = await client.config('GET', 'dbfilename');

      const saveValue = Array.isArray(save) ? save[1] || '' : '';
      const appendValue = Array.isArray(appendonly) ? appendonly[1] || '' : '';
      const dirValue = Array.isArray(dir) ? dir[1] || null : null;
      const fileValue = Array.isArray(dbfilename) ? dbfilename[1] || null : null;

      const rdbEnabled = typeof saveValue === 'string' && saveValue.trim() !== '' && saveValue.trim() !== '""';
      const aofEnabled = typeof appendValue === 'string' && appendValue.trim().toLowerCase() === 'yes';

      return {
        rdbEnabled,
        aofEnabled,
        persistent: rdbEnabled || aofEnabled,
        dir: dirValue,
        dbFilename: fileValue
      };
    } catch (error) {
      return {
        rdbEnabled: false,
        aofEnabled: false,
        persistent: false,
        error: error.message
      };
    } finally {
      if (client) {
        try {
          await client.quit();
        } catch (quitError) {
          // 忽略关闭异常
        }
      }
    }
  }

  /**
   * 使用项目默认数据初始化Redis
   */
  async initializeRedisDefaults(connection = {}) {
    const initFilePath = path.join(this.rootDir, 'data', 'init.json');
    if (!fs.existsSync(initFilePath)) {
      return { seeded: false };
    }

    const { host = '127.0.0.1', port = 6379, password = undefined } = connection;
    const initData = JSON.parse(fs.readFileSync(initFilePath, 'utf8'));

    let client;
    try {
      client = new Redis({ host, port, password, lazyConnect: true });
      await client.connect();

      const adminKey = 'session:admin_credentials';
      const exists = await client.exists(adminKey);

      if (!exists) {
        const createdAt = initData.initializedAt || new Date().toISOString();
        await client.hset(adminKey, {
          username: initData.adminUsername,
          password: initData.adminPassword,
          createdAt,
          updatedAt: createdAt,
          lastLogin: ''
        });

        console.log('✅ 已根据 data/init.json 初始化管理员凭据');
        console.log('⚠️  首次登录后请尽快修改管理员密码');
        return { seeded: true };
      }

      return { seeded: false };
    } catch (error) {
      console.log(`⚠️  无法初始化默认Redis数据: ${error.message}`);
      return { seeded: false, error: error.message };
    } finally {
      if (client) {
        try {
          await client.quit();
        } catch (quitError) {
          // 忽略关闭异常
        }
      }
    }
  }

  /**
   * 分析Redis环境状况
   */
  analyzeRedisEnvironment() {
    const environment = {
      hasHistoryData: false,
      hasDockerCompose: false,
      hasStoppedContainer: false,
      runningContainer: null,
      dataSize: 0
    };

    // 检查数据目录
    if (fs.existsSync(this.redisDataDir)) {
      environment.hasHistoryData = true;
      try {
        const stats = this.getDirectorySize(this.redisDataDir);
        environment.dataSize = stats.size;
        environment.fileCount = stats.fileCount;
        console.log(`📊 发现Redis历史数据: ${this.formatFileSize(environment.dataSize)} (${environment.fileCount} 文件)`);
      } catch (error) {
        console.log('📊 发现Redis数据目录（大小未知）');
      }
    }

    // 检查docker-compose文件
    if (fs.existsSync(this.dockerComposeFile)) {
      environment.hasDockerCompose = true;
      console.log('📋 发现docker-compose.yml配置');
    }

    // 检查Docker容器
    try {
      // 检查运行中的Redis容器
      const runningResult = execSync('docker ps --filter "ancestor=redis" --format "{{.Names}}"', { encoding: 'utf8' });
      if (runningResult.trim()) {
        environment.runningContainer = runningResult.trim().split('\n')[0];
        console.log(`🟢 发现运行中的Redis容器: ${environment.runningContainer}`);
      }

      // 检查已停止的Redis容器
      const allResult = execSync('docker ps -a --filter "ancestor=redis" --format "{{.Names}}\\t{{.Status}}"', { encoding: 'utf8' });
      const containers = allResult.trim().split('\n').filter(line => line && !line.includes('Up'));
      if (containers.length > 0) {
        environment.hasStoppedContainer = true;
        console.log(`⏸️  发现已停止的Redis容器: ${containers.length}个`);
      }
    } catch (error) {
      // Docker命令失败，忽略
    }

    return environment;
  }

  /**
   * 处理现有Redis环境
   */
  async handleExistingRedisEnvironment(environment) {
    console.log('\n🎯 发现现有Redis环境，建议复用以保留数据');

    const options = [];

    if (environment.hasHistoryData) {
      options.push({
        key: 'h',
        title: '复用历史数据',
        description: `启动持久化Redis容器，挂载现有数据目录 (${this.formatFileSize(environment.dataSize)})`
      });
    }

    if (environment.hasStoppedContainer) {
      options.push({
        key: 'r',
        title: '重启已停止容器',
        description: '重新启动之前创建的Redis容器（可能包含数据）'
      });
    }

    if (environment.hasDockerCompose) {
      options.push({
        key: 'c',
        title: '使用Docker Compose',
        description: '启动完整的Redis环境（生产级配置）'
      });
    }

    options.push({
      key: 'n',
      title: '创建新的临时Redis',
      description: '启动全新的临时容器（数据不持久化）'
    });

    options.push({
      key: 's',
      title: '跳过Redis启动',
      description: '继续启动但可能遇到连接错误'
    });

    return await this.showOptionsAndGetChoice(options);
  }

  /**
   * 提供Redis启动选项
   */
  async provideRedisOptions(environment) {
    console.log('\n🐳 检测到Docker环境，选择Redis启动方式：');

    const options = [
      {
        key: 'p',
        title: '持久化Redis（推荐）',
        description: '启动带数据持久化的Redis容器，开发数据不丢失'
      }
    ];

    if (environment.hasDockerCompose) {
      options.push({
        key: 'c',
        title: 'Docker Compose环境',
        description: '使用docker-compose.yml启动完整Redis环境'
      });
    }

    options.push(
      {
        key: 't',
        title: '临时Redis',
        description: '快速启动临时容器，适合快速测试'
      },
      {
        key: 's',
        title: '跳过启动',
        description: '不启动Redis，可能遇到连接错误'
      }
    );

    return await this.showOptionsAndGetChoice(options);
  }

  /**
   * 显示选项并获取用户选择
   */
  async showOptionsAndGetChoice(options) {
    console.log();
    options.forEach((option, index) => {
      console.log(`  ${option.key}) ${option.title}`);
      console.log(`     ${option.description}`);
    });

    const validKeys = options.map(opt => opt.key);
    const choice = await this.askUser(`\n请选择 (${validKeys.join('/')}) [默认: ${validKeys[0]}]: `);

    const selectedKey = choice || validKeys[0];
    const selectedOption = options.find(opt => opt.key === selectedKey);

    if (!selectedOption) {
      console.log(`无效选择，使用默认选项: ${options[0].title}`);
      return await this.executeRedisOption(options[0].key);
    }

    return await this.executeRedisOption(selectedKey);
  }

  /**
   * 执行Redis选项
   */
  async executeRedisOption(optionKey) {
    switch (optionKey) {
      case 'h':
        return await this.startPersistentRedis(true);
      case 'r':
        return await this.restartStoppedContainer();
      case 'c':
        return await this.startDockerCompose();
      case 'p':
        return await this.startPersistentRedis(false);
      case 't':
        return await this.startTemporaryRedis();
      case 's':
        return this.skipRedisStartup();
      default:
        return await this.startPersistentRedis(false);
    }
  }

  /**
   * 启动持久化Redis
   */
  async startPersistentRedis(reuseData = false) {
    console.log('🚀 启动持久化Redis容器...');

    if (!reuseData) {
      this.ensureDataDirectory();
    }

    const containerName = 'redis-persistent';

    try {
      // 清理可能存在的同名容器
      try {
        execSync(`docker rm -f ${containerName}`, { stdio: 'ignore' });
      } catch (error) {
        // 忽略容器不存在的错误
      }

      // 启动持久化Redis容器
      const command = [
        'docker run -d',
        `--name ${containerName}`,
        '-p 6379:6379',
        `-v "${this.redisDataDir}:/data"`,
        'redis:7-alpine',
        'redis-server',
        '--save 60 1',
        '--appendonly yes',
        '--appendfsync everysec'
      ].join(' ');

      console.log('🔧 启动命令:', command);
      execSync(command, { stdio: 'inherit' });

      console.log('✅ Redis持久化容器启动成功');
      console.log(`💾 数据目录: ${this.redisDataDir}`);

      // 等待Redis就绪
      console.log('⏳ 等待Redis就绪...');
      await this.waitForRedis();

      // 验证持久化配置
      const config = await this.fetchRedisConfig();
      this.showRedisStatus('持久化Redis容器', config);

      const seedInfo = await this.initializeRedisDefaults({ host: '127.0.0.1', port: 6379 });

      return {
        available: true,
        type: 'persistent',
        containerName,
        host: '127.0.0.1',
        port: 6379,
        config,
        seeded: seedInfo.seeded
      };
    } catch (error) {
      console.log('❌ 持久化Redis启动失败:', error.message);
      throw error;
    }
  }

  /**
   * 启动临时Redis
   */
  async startTemporaryRedis() {
    console.log('🚀 启动临时Redis容器...');

    const containerName = 'redis-temp';

    try {
      // 清理可能存在的同名容器
      try {
        execSync(`docker rm -f ${containerName}`, { stdio: 'ignore' });
      } catch (error) {
        // 忽略容器不存在的错误
      }

      execSync(`docker run -d --name ${containerName} -p 6379:6379 redis:7-alpine`, { stdio: 'inherit' });

      console.log('✅ 临时Redis容器启动成功');
      console.log('⚠️  注意: 容器删除后数据将丢失');

      // 等待Redis就绪
      await this.waitForRedis();

      const config = await this.fetchRedisConfig();
      this.showRedisStatus('临时Redis容器', config);
      const seedInfo = await this.initializeRedisDefaults({ host: '127.0.0.1', port: 6379 });

      return {
        available: true,
        type: 'temporary',
        containerName,
        host: '127.0.0.1',
        port: 6379,
        config,
        seeded: seedInfo.seeded
      };
    } catch (error) {
      console.log('❌ 临时Redis启动失败:', error.message);
      throw error;
    }
  }

  /**
   * 使用Docker Compose启动
   */
  async startDockerCompose() {
    console.log('🐳 使用Docker Compose启动Redis...');

    try {
      execSync('docker-compose up -d redis', {
        stdio: 'inherit',
        cwd: this.rootDir
      });

      console.log('✅ Docker Compose Redis启动成功');
      console.log(`💾 数据目录: ${this.redisDataDir}`);

      // 等待Redis就绪
      await this.waitForRedis();

      const config = await this.fetchRedisConfig();
      this.showRedisStatus('Docker Compose Redis', config);
      const seedInfo = await this.initializeRedisDefaults({ host: '127.0.0.1', port: 6379 });

      return {
        available: true,
        type: 'compose',
        host: '127.0.0.1',
        port: 6379,
        config,
        seeded: seedInfo.seeded
      };
    } catch (error) {
      console.log('❌ Docker Compose启动失败:', error.message);
      throw error;
    }
  }

  /**
   * 重启已停止的容器
   */
  async restartStoppedContainer() {
    console.log('🔄 重启已停止的Redis容器...');

    try {
      // 查找Redis容器
      const result = execSync('docker ps -a --filter "ancestor=redis" --format "{{.Names}}"', { encoding: 'utf8' });
      const containerName = result.trim().split('\n')[0];

      if (!containerName) {
        throw new Error('未找到Redis容器');
      }

      execSync(`docker start ${containerName}`, { stdio: 'inherit' });

      console.log(`✅ Redis容器 ${containerName} 重启成功`);

      // 等待Redis就绪
      await this.waitForRedis();

      const config = await this.fetchRedisConfig();
      this.showRedisStatus(`容器 ${containerName}`, config);
      const seedInfo = await this.initializeRedisDefaults({ host: '127.0.0.1', port: 6379 });

      return {
        available: true,
        type: 'restarted',
        containerName,
        host: '127.0.0.1',
        port: 6379,
        config,
        seeded: seedInfo.seeded
      };
    } catch (error) {
      console.log('❌ 容器重启失败:', error.message);
      throw error;
    }
  }

  /**
   * 跳过Redis启动
   */
  skipRedisStartup() {
    console.log('⚠️  跳过Redis启动');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('⚠️  Redis服务不可用，应用可能无法正常工作');
    console.log('');
    console.log('💡 可用解决方案：');
    console.log('  1. 安装本地Redis服务');
    console.log('  2. 使用Docker启动Redis');
    console.log('  3. 使用云Redis服务');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    return { available: false, type: 'skipped' };
  }

  /**
   * 等待Redis就绪
   */
  async waitForRedis(options = {}, maxAttempts = 10) {
    const { host = '127.0.0.1', port = 6379 } = options;

    for (let i = 0; i < maxAttempts; i++) {
      try {
        const available = await this.checkLocalRedis({ host, port, silent: true });
        if (available) {
          console.log('✅ Redis已就绪');
          return true;
        }
      } catch (error) {
        // 继续等待
      }

      if (i < maxAttempts - 1) {
        await this.delay(1000);
      }
    }

    throw new Error('Redis启动超时');
  }

  /**
   * 检查Redis配置
   */
  async checkRedisConfig(host, port) {
    return await this.fetchRedisConfig({ host, port });
  }

  /**
   * 显示Redis状态
   */
  showRedisStatus(type, config) {
    if (!config) {
      console.log(`\n⚠️  ${type} 配置信息不可用`);
      return;
    }

    if (config.error) {
      console.log(`\n⚠️  ${type} 配置信息读取失败: ${config.error}`);
      return;
    }

    console.log(`\n📊 ${type} 配置状态:`);
    console.log(`   RDB快照: ${config.rdbEnabled ? '✅ 启用' : '❌ 未启用'}`);
    console.log(`   AOF日志: ${config.aofEnabled ? '✅ 启用' : '❌ 未启用'}`);
    console.log(`   数据持久化: ${config.persistent ? '✅ 完整保护' : '⚠️  部分保护'}`);

    if (!config.persistent) {
      console.log('   ⚠️  建议启用完整持久化以避免数据丢失');
    }
  }

  /**
   * 确保数据目录存在
   */
  ensureDataDirectory() {
    if (!fs.existsSync(this.redisDataDir)) {
      fs.mkdirSync(this.redisDataDir, { recursive: true });
      console.log(`📁 创建Redis数据目录: ${this.redisDataDir}`);
    }
  }

  /**
   * 检查Docker环境
   */
  checkDockerEnvironment() {
    try {
      execSync('docker --version', { stdio: 'ignore' });
      console.log('🐳 检测到Docker环境');
      return true;
    } catch (error) {
      console.log('⚠️  Docker不可用');
      return false;
    }
  }

  /**
   * 显示Redis不可用时的选项
   */
  showRedisUnavailableOptions() {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('⚠️  Redis和Docker均不可用');
    console.log('');
    console.log('💡 推荐解决方案：');
    console.log('  1. 安装Docker Desktop: https://docker.com/get-started');
    console.log('  2. 安装本地Redis服务');
    console.log('  3. 使用云Redis服务（阿里云、AWS等）');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  }

  /**
   * 为缺失环境提供交互式指导
   */
  async promptEnvironmentSetup() {
    console.log('\n🛠️  尚未检测到可用的Redis环境');

    if (!process.stdin.isTTY) {
      console.log('ℹ️  请参考上方建议手动安装 Docker 或 Redis，或配置外部连接后重试。');
      return;
    }

    const answer = await this.askUser('是否需要打开 Redis/Docker 安装指引？(y/n): ');

    if (answer === 'y') {
      this.openDocumentation('https://www.docker.com/get-started');
      this.openDocumentation('https://redis.io/docs/latest/operate/oss_and_stack/install/install-redis/');
    }

    const skipAnswer = await this.askUser('若暂时不安装，是否继续保持当前流程？(y/n): ');

    if (skipAnswer !== 'y') {
      throw new Error('用户取消启动以处理Redis环境依赖');
    }
  }

  /**
   * 打开外部文档链接
   */
  openDocumentation(url) {
    try {
      const command = this.isWindows
        ? `start "" "${url}"`
        : process.platform === 'darwin'
        ? `open "${url}"`
        : `xdg-open "${url}"`;

      execSync(command, { stdio: 'ignore', shell: true });
      console.log(`📖 已在浏览器中打开: ${url}`);
    } catch (error) {
      console.log(`⚠️  无法自动打开链接，请手动访问: ${url}`);
    }
  }

  /**
   * 获取目录大小
   */
  getDirectorySize(dirPath) {
    let totalSize = 0;
    let fileCount = 0;

    const files = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const file of files) {
      const fullPath = path.join(dirPath, file.name);
      if (file.isDirectory()) {
        const subDir = this.getDirectorySize(fullPath);
        totalSize += subDir.size;
        fileCount += subDir.fileCount;
      } else {
        const stats = fs.statSync(fullPath);
        totalSize += stats.size;
        fileCount++;
      }
    }

    return { size: totalSize, fileCount };
  }

  /**
   * 格式化文件大小
   */
  formatFileSize(bytes) {
    if (bytes === 0) return '0 B';

    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  /**
   * 询问用户输入
   */
  async askUser(question) {
    if (process.stdin.isTTY && typeof process.stdin.setRawMode === 'function') {
      try {
        process.stdin.setRawMode(false);
      } catch (error) {
        // 某些终端不支持setRawMode，忽略错误
      }
    }

    const rl = require('readline').createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
      crlfDelay: Infinity
    });

    return new Promise((resolve) => {
      rl.question(question, (answer) => {
        rl.close();
        resolve(answer.toLowerCase().trim());
      });
    });
  }

  /**
   * 启动Docker Redis（简化版本，用于自动启动）
   */
  async startDockerRedis() {
    console.log('🚀 正在启动Docker Redis容器...');

    // 检查Docker环境
    if (!this.checkDockerEnvironment()) {
      throw new Error('Docker环境不可用，无法启动Redis容器');
    }

    try {
      // 优先使用持久化Redis
      const result = await this.startPersistentRedis(false);
      console.log('✅ Docker Redis启动成功');
      return result;
    } catch (error) {
      console.log('⚠️  持久化Redis启动失败，尝试临时Redis...');

      try {
        const result = await this.startTemporaryRedis();
        console.log('✅ 临时Docker Redis启动成功');
        return result;
      } catch (tempError) {
        console.error('❌ 所有Redis启动方式均失败');
        throw new Error(`Redis启动失败: ${error.message}, 临时Redis: ${tempError.message}`);
      }
    }
  }

  /**
   * 自动配置Redis持久化
   */
  async configureRedisPersistence() {
    console.log('🔧 正在配置Redis持久化...');

    try {
      // 方式1: 尝试使用redis-cli命令（如果系统有安装）
      try {
        execSync('redis-cli ping', { stdio: 'ignore' });

        console.log('📡 使用redis-cli配置持久化...');

        // 启用AOF持久化
        execSync('redis-cli CONFIG SET appendonly yes', { stdio: 'inherit' });
        console.log('✅ 已启用AOF持久化');

        // 配置RDB快照策略
        execSync('redis-cli CONFIG SET save "900 1 300 10 60 10000"', { stdio: 'inherit' });
        console.log('✅ 已配置RDB快照策略');

        // 立即保存配置到磁盘
        try {
          execSync('redis-cli CONFIG REWRITE', { stdio: 'inherit' });
          console.log('✅ 已保存配置到redis.conf');
        } catch (error) {
          console.log('⚠️  无法写入redis.conf（可能权限不足），配置仅在内存中生效');
        }

        // 触发后台保存
        execSync('redis-cli BGSAVE', { stdio: 'inherit' });
        console.log('✅ 已触发后台数据保存');

        return true;
      } catch (cliError) {
        console.log('⚠️  redis-cli不可用，尝试使用Node.js Redis客户端...');

        // 方式2: 使用Node.js Redis客户端（如果项目中有）
        try {
          // 动态导入redis模块（项目中可能已有）
          const redis = require('redis');
          const client = redis.createClient({
            socket: { host: 'localhost', port: 6379 },
            // 设置较短的连接超时
            connectTimeout: 5000,
            commandTimeout: 5000
          });

          await client.connect();
          console.log('📡 使用Redis客户端配置持久化...');

          // 配置AOF持久化
          await client.configSet('appendonly', 'yes');
          console.log('✅ 已启用AOF持久化');

          // 配置RDB快照
          await client.configSet('save', '900 1 300 10 60 10000');
          console.log('✅ 已配置RDB快照策略');

          // 尝试保存配置
          try {
            await client.configRewrite();
            console.log('✅ 已保存配置到redis.conf');
          } catch (rewriteError) {
            console.log('⚠️  无法写入redis.conf（可能权限不足），配置仅在内存中生效');
          }

          // 触发后台保存
          await client.bgSave();
          console.log('✅ 已触发后台数据保存');

          await client.disconnect();
          return true;
        } catch (nodeError) {
          throw new Error(`Redis客户端配置失败: ${nodeError.message}`);
        }
      }
    } catch (error) {
      console.error('❌ 自动配置持久化失败:', error.message);
      console.log('');
      console.log('💡 请手动执行以下命令配置持久化：');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('   redis-cli CONFIG SET appendonly yes');
      console.log('   redis-cli CONFIG SET save "900 1 300 10 60 10000"');
      console.log('   redis-cli CONFIG REWRITE  # 保存到配置文件');
      console.log('   redis-cli BGSAVE         # 立即备份数据');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      return false;
    }
  }

  /**
   * 启动生产环境专用的持久化Docker Redis
   */
  async startPersistentDockerRedisForProduction() {
    console.log('🏭 启动生产环境持久化Redis容器...');

    try {
      // 确保数据目录存在
      const redisDataDir = path.join(this.rootDir, 'redis_data');
      if (!fs.existsSync(redisDataDir)) {
        fs.mkdirSync(redisDataDir, { recursive: true });
        console.log(`📁 创建Redis数据目录: ${redisDataDir}`);
      }

      const containerName = 'redis-production';

      // 清理可能存在的同名容器
      try {
        execSync(`docker rm -f ${containerName}`, { stdio: 'ignore' });
      } catch (error) {
        // 忽略容器不存在的错误
      }

      // 启动带完整持久化配置的Redis容器
      const dockerCmd = this.isWindows
        ? `docker run -d --name ${containerName} -p 6379:6379 -v "${redisDataDir}:/data" redis:7-alpine redis-server --appendonly yes --save "60 1" --dir /data`
        : `docker run -d --name ${containerName} -p 6379:6379 -v ${redisDataDir}:/data redis:7-alpine redis-server --appendonly yes --save "60 1" --dir /data`;

      execSync(dockerCmd, { stdio: 'inherit' });

      console.log('✅ 生产环境Redis容器启动成功');
      console.log(`💾 数据目录: ${redisDataDir}`);
      console.log('🔒 持久化策略: AOF + RDB (60秒内1次修改)');

      // 等待Redis就绪
      console.log('⏳ 等待Redis就绪...');
      await this.waitForRedis();

      // 验证持久化配置
      const config = await this.fetchRedisConfig();
      this.showRedisStatus('生产环境Redis', config);
      const seedInfo = await this.initializeRedisDefaults({ host: '127.0.0.1', port: 6379 });

      return {
        available: true,
        type: 'production',
        containerName,
        host: '127.0.0.1',
        port: 6379,
        config,
        seeded: seedInfo.seeded
      };
    } catch (error) {
      console.log('❌ 生产环境Redis启动失败:', error.message);
      throw error;
    }
  }

  /**
   * 延迟函数
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = { RedisManager };
