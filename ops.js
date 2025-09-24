#!/usr/bin/env node

/**
 * Claude Relay Service 运维管理脚本
 * 重构版 - 模块化架构，更好的可维护性
 */

const path = require('path');
const { ServiceManager } = require('./lib/ops/ServiceManager');
const { LogManager } = require('./lib/ops/LogManager');
const { InteractiveManager } = require('./lib/ops/InteractiveManager');

class OpsController {
  constructor() {
    this.rootDir = __dirname;
    this.serviceManager = new ServiceManager(this.rootDir);
    this.logManager = new LogManager(this.rootDir);
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
      isFollow: args.includes('-f') || args.includes('--follow')
    };

    const command = args.find(arg => !arg.startsWith('-')) || '';

    return { command, flags, args };
  }

  /**
   * 主入口函数
   */
  async run() {
    const { command, flags, args } = this.parseArgs();

    try {
      switch (command) {
        case 'start':
          await this.serviceManager.start(flags.isProd, flags.shouldOpen);
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
}

// 只有直接运行此脚本时才执行
if (require.main === module) {
  const controller = new OpsController();
  controller.run();
}

module.exports = OpsController;