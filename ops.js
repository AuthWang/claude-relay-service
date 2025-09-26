#!/usr/bin/env node

/**
 * Claude Relay Service 运维管理脚本
 * 重构版 - 模块化架构，更好的可维护性
 */

const path = require('path');
const { ServiceManager } = require('./lib/ops/ServiceManager');
const { LogManager } = require('./lib/ops/LogManager');
const { InteractiveManager } = require('./lib/ops/InteractiveManager');
const { RedisManager } = require('./lib/ops/RedisManager');

class OpsController {
  constructor() {
    this.rootDir = __dirname;
    this.serviceManager = new ServiceManager(this.rootDir);
    this.logManager = new LogManager(this.rootDir);
    this.redisManager = new RedisManager(this.rootDir);
    this.interactiveManager = new InteractiveManager(this.serviceManager, this.logManager);
  }

  /**
   * 解析命令行参数
   */
  parseArgs() {
    const args = process.argv.slice(2);
    const flags = {
      isProd: args.includes('--prod'),
      shouldOpen: args.includes('--open'),
      isFollow: args.includes('-f') || args.includes('--follow'),
      autoPersist: args.includes('--auto-persist'),
      redisDocker: args.includes('--redis-docker'),
      redisLocal: args.includes('--redis-local'),
      redisExternal: args.includes('--redis-external')
    };

    const command = args.find(arg => !arg.startsWith('-')) || '';

    // 解析Redis策略参数
    let redisStrategy = 'auto';
    if (flags.redisDocker) redisStrategy = 'docker';
    else if (flags.redisLocal) redisStrategy = 'local';
    else if (flags.redisExternal) redisStrategy = 'external';

    return { command, flags, args, redisStrategy };
  }

  /**
   * 主入口函数
   */
  async run() {
    const { command, flags, args, redisStrategy } = this.parseArgs();

    try {
      switch (command) {
        case 'start':
          await this.serviceManager.start(flags.isProd, flags.shouldOpen, flags.autoPersist, redisStrategy);
          break;

        case 'stop':
          await this.serviceManager.stop();
          break;

        case 'restart':
          this.serviceManager.isProd = flags.isProd;
          this.serviceManager.shouldOpen = flags.shouldOpen;
          await this.serviceManager.restart();
          break;

        case 'status':
          await this.serviceManager.status(this.rootDir);
          break;

        case 'logs':
          await this.logManager.logs(flags.isFollow);
          break;

        case 'clean':
          await this.logManager.clean();
          break;

        case 'check':
        case 'env':
          this.serviceManager.checkEnv(this.rootDir);
          break;

        case 'redis':
          await this.handleRedisCommands(args);
          break;

        case 'help':
        case '--help':
        case '-h':
          this.interactiveManager.showHelp();
          break;

        case '':
        default:
          // 如果没有参数，进入交互模式
          if (args.length === 0) {
            await this.interactiveManager.interactive();
          } else {
            console.log('❌ 未知命令:', command);
            this.interactiveManager.showHelp();
            process.exit(1);
          }
      }
    } catch (error) {
      console.error('❌ 操作失败:', error.message);
      process.exit(1);
    }
  }

  /**
   * 处理Redis相关命令
   */
  async handleRedisCommands(args) {
    const subCommand = args[1] || 'status';

    switch (subCommand) {
      case 'status':
        await this.showRedisStatus();
        break;

      case 'check':
        await this.redisManager.checkRedisAvailability();
        break;

      case 'start':
        await this.startRedisService(args);
        break;

      case 'stop':
        await this.stopRedisService();
        break;

      case 'restart':
        await this.restartRedisService();
        break;

      case 'config':
        await this.showRedisConfig();
        break;

      case 'backup':
        await this.backupRedisData();
        break;

      case 'restore':
        await this.restoreRedisData(args);
        break;

      case 'clean':
        await this.cleanRedisData();
        break;

      case 'help':
      default:
        this.showRedisHelp();
        break;
    }
  }

  /**
   * 显示Redis状态
   */
  async showRedisStatus() {
    console.log('🔍 检查Redis服务状态...\n');

    const environment = this.redisManager.analyzeRedisEnvironment();
    const localAvailable = await this.redisManager.checkLocalRedis();

    console.log('📊 Redis环境分析:');
    console.log(`  本地连接: ${localAvailable ? '✅ 可用' : '❌ 不可用'}`);
    console.log(`  历史数据: ${environment.hasHistoryData ? '✅ 存在' : '❌ 无'}`);
    console.log(`  Docker环境: ${this.redisManager.checkDockerEnvironment() ? '✅ 可用' : '❌ 不可用'}`);
    console.log(`  Compose配置: ${environment.hasDockerCompose ? '✅ 存在' : '❌ 无'}`);

    if (environment.runningContainer) {
      console.log(`  运行容器: ✅ ${environment.runningContainer}`);
    }

    if (environment.hasStoppedContainer) {
      console.log(`  已停止容器: ⏸️  存在`);
    }

    if (environment.hasHistoryData) {
      console.log(`  数据大小: 📊 ${this.redisManager.formatFileSize(environment.dataSize)}`);
    }

    if (localAvailable) {
      console.log('\n🔧 Redis配置检查:');
      const config = await this.redisManager.checkRedisConfig('localhost', 6379);
      this.redisManager.showRedisStatus('当前Redis', config);
    }
  }

  /**
   * 启动Redis服务
   */
  async startRedisService(args) {
    const type = args[2] || 'persistent';

    console.log(`🚀 启动Redis服务 (类型: ${type})`);

    try {
      switch (type) {
        case 'persistent':
        case 'p':
          await this.redisManager.startPersistentRedis();
          break;
        case 'temporary':
        case 'temp':
        case 't':
          await this.redisManager.startTemporaryRedis();
          break;
        case 'compose':
        case 'c':
          await this.redisManager.startDockerCompose();
          break;
        default:
          console.log('⚠️  未知类型，使用持久化Redis');
          await this.redisManager.startPersistentRedis();
      }
    } catch (error) {
      console.error('❌ Redis启动失败:', error.message);
    }
  }

  /**
   * 停止Redis服务
   */
  async stopRedisService() {
    console.log('🛑 停止Redis服务...');

    try {
      const { execSync } = require('child_process');

      // 停止所有Redis容器
      const containers = ['redis-persistent', 'redis-temp', 'redis-dev'];

      for (const container of containers) {
        try {
          execSync(`docker stop ${container} && docker rm ${container}`, { stdio: 'ignore' });
          console.log(`✅ 已停止容器: ${container}`);
        } catch (error) {
          // 容器不存在，忽略
        }
      }

      // 尝试停止docker-compose中的redis
      try {
        execSync('docker-compose stop redis', { stdio: 'ignore', cwd: this.rootDir });
        console.log('✅ 已停止Docker Compose Redis');
      } catch (error) {
        // docker-compose不存在或redis服务未运行，忽略
      }

      console.log('✅ Redis服务已停止');
    } catch (error) {
      console.error('❌ 停止Redis失败:', error.message);
    }
  }

  /**
   * 重启Redis服务
   */
  async restartRedisService() {
    console.log('🔄 重启Redis服务...');
    await this.stopRedisService();
    await new Promise(resolve => setTimeout(resolve, 2000));
    await this.startRedisService(['redis', 'start', 'persistent']);
  }

  /**
   * 显示Redis配置
   */
  async showRedisConfig() {
    console.log('🔧 Redis配置详情:\n');

    const localAvailable = await this.redisManager.checkLocalRedis();

    if (!localAvailable) {
      console.log('❌ Redis服务不可用，无法获取配置');
      return;
    }

    try {
      const { execSync } = require('child_process');

      console.log('📋 当前Redis配置:');

      // 获取常用配置
      const configs = {
        'save': 'RDB保存策略',
        'appendonly': 'AOF持久化',
        'appendfsync': 'AOF同步策略',
        'maxmemory': '最大内存',
        'maxmemory-policy': '内存淘汰策略',
        'dir': '数据目录'
      };

      for (const [key, description] of Object.entries(configs)) {
        try {
          const result = execSync(`docker exec redis-persistent redis-cli CONFIG GET ${key} 2>/dev/null || echo "local ${key}"`, { encoding: 'utf8' });
          const lines = result.trim().split('\n');
          const value = lines.length > 1 ? lines[1] : 'N/A';
          console.log(`  ${description}: ${value}`);
        } catch (error) {
          console.log(`  ${description}: 获取失败`);
        }
      }

    } catch (error) {
      console.error('❌ 获取配置失败:', error.message);
    }
  }

  /**
   * 备份Redis数据
   */
  async backupRedisData() {
    console.log('💾 备份Redis数据...');

    try {
      const { execSync } = require('child_process');
      const fs = require('fs');
      const path = require('path');

      const backupDir = path.join(this.rootDir, 'backup', 'redis');
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = path.join(backupDir, `redis-backup-${timestamp}`);

      // 创建备份目录
      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
      }

      // 检查数据源
      const redisDataDir = path.join(this.rootDir, 'redis_data');

      if (fs.existsSync(redisDataDir)) {
        // 备份本地数据目录
        execSync(`cp -r "${redisDataDir}" "${backupPath}"`, { shell: true });
        console.log(`✅ 数据目录已备份到: ${backupPath}`);
      }

      // 如果Redis正在运行，执行BGSAVE
      const localAvailable = await this.redisManager.checkLocalRedis();
      if (localAvailable) {
        try {
          execSync('docker exec redis-persistent redis-cli BGSAVE', { stdio: 'inherit' });
          console.log('✅ 已执行Redis后台保存');
        } catch (error) {
          console.log('⚠️  后台保存失败，可能Redis不在容器中运行');
        }
      }

      console.log(`✅ 备份完成: ${backupPath}`);

    } catch (error) {
      console.error('❌ 备份失败:', error.message);
    }
  }

  /**
   * 恢复Redis数据
   */
  async restoreRedisData(args) {
    const backupPath = args[2];

    if (!backupPath) {
      console.log('❌ 请指定备份路径: ops redis restore <backup-path>');
      return;
    }

    console.log(`📥 从备份恢复Redis数据: ${backupPath}`);

    try {
      const fs = require('fs');
      const { execSync } = require('child_process');

      if (!fs.existsSync(backupPath)) {
        console.log('❌ 备份文件不存在:', backupPath);
        return;
      }

      // 停止Redis服务
      await this.stopRedisService();

      // 恢复数据
      const redisDataDir = path.join(this.rootDir, 'redis_data');
      execSync(`rm -rf "${redisDataDir}" && cp -r "${backupPath}" "${redisDataDir}"`, { shell: true });

      console.log('✅ 数据恢复完成');
      console.log('🔄 请重新启动Redis服务以生效');

    } catch (error) {
      console.error('❌ 恢复失败:', error.message);
    }
  }

  /**
   * 清理Redis数据
   */
  async cleanRedisData() {
    console.log('🧹 清理Redis数据...');

    const answer = await this.redisManager.askUser('⚠️  这将删除所有Redis数据，确认继续？(y/n): ');

    if (answer !== 'y') {
      console.log('❌ 操作已取消');
      return;
    }

    try {
      const fs = require('fs');
      const path = require('path');

      // 停止Redis服务
      await this.stopRedisService();

      // 删除数据目录
      const redisDataDir = path.join(this.rootDir, 'redis_data');
      if (fs.existsSync(redisDataDir)) {
        fs.rmSync(redisDataDir, { recursive: true, force: true });
        console.log('✅ Redis数据目录已删除');
      }

      console.log('✅ 清理完成');

    } catch (error) {
      console.error('❌ 清理失败:', error.message);
    }
  }

  /**
   * 显示Redis帮助
   */
  showRedisHelp() {
    console.log(`
🔧 Redis管理命令帮助

用法: node ops.js redis <command> [options]

命令:
  status              显示Redis服务状态和环境信息
  check               智能检测Redis环境并提供建议
  start [type]        启动Redis服务
                      type: persistent(默认) | temporary | compose
  stop                停止所有Redis服务和容器
  restart             重启Redis服务（使用持久化模式）
  config              显示当前Redis配置信息
  backup              备份Redis数据到backup目录
  restore <path>      从指定路径恢复Redis数据
  clean               清理所有Redis数据（危险操作）
  help                显示此帮助信息

示例:
  node ops.js redis status           # 查看Redis状态
  node ops.js redis start            # 启动持久化Redis
  node ops.js redis start temporary  # 启动临时Redis
  node ops.js redis backup           # 备份数据
  node ops.js redis restore ./backup/redis-backup-2024-01-01

Redis类型说明:
  persistent  - 数据持久化到./redis_data目录（推荐）
  temporary   - 临时容器，删除后数据丢失
  compose     - 使用docker-compose.yml配置启动
`);
  }
}

// 只有直接运行此脚本时才执行
if (require.main === module) {
  const controller = new OpsController();
  controller.run();
}

module.exports = OpsController;