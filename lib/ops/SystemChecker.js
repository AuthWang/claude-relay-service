/**
 * 系统检查和工具类
 * 负责端口检查、进程检查、环境检查等
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

class SystemChecker {
  constructor() {
    this.isWindows = process.platform === 'win32';
  }

  /**
   * 检查端口是否可用
   */
  isPortAvailable(port) {
    try {
      if (this.isWindows) {
        const result = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf8', stdio: 'pipe' });
        return !result.trim();
      } else {
        execSync(`lsof -ti:${port}`, { stdio: 'pipe' });
        return false;
      }
    } catch {
      return true;
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
   * 环境检查
   */
  checkEnv(rootDir) {
    console.log('🔍 检查环境...');

    const webDir = path.join(rootDir, 'web', 'admin-spa');
    const checks = {
      '.env文件': fs.existsSync(path.join(rootDir, '.env')),
      'config.js': fs.existsSync(path.join(rootDir, 'config', 'config.js')),
      '后端依赖': fs.existsSync(path.join(rootDir, 'node_modules')),
      '前端依赖': fs.existsSync(path.join(webDir, 'node_modules')),
      '端口3000可用': this.isPortAvailable(3000),
      '端口5173可用': this.isPortAvailable(5173)
    };

    let allPassed = true;

    Object.entries(checks).forEach(([key, passed]) => {
      const icon = passed ? '✅' : '❌';
      console.log(`  ${icon} ${key}`);
      if (!passed) allPassed = false;
    });

    if (allPassed) {
      console.log('🎉 环境检查通过');
    } else {
      console.log('⚠️  环境检查发现问题，启动时会自动修复');
    }

    return checks;
  }

  /**
   * 检查服务运行状态
   */
  async status(rootDir) {
    console.log('📊 服务状态检查...');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    // 基本信息
    console.log('\n💻 系统信息:');
    console.log(`  操作系统: ${os.platform()} ${os.release()}`);
    console.log(`  Node.js版本: ${process.version}`);
    console.log(`  工作目录: ${rootDir}`);

    // 文件状态
    console.log('\n📁 配置文件:');
    const configFiles = {
      '.env': path.join(rootDir, '.env'),
      'config.js': path.join(rootDir, 'config', 'config.js'),
      'package.json': path.join(rootDir, 'package.json'),
    };

    Object.entries(configFiles).forEach(([name, filepath]) => {
      const exists = fs.existsSync(filepath);
      const icon = exists ? '✅' : '❌';
      console.log(`  ${icon} ${name}`);
    });

    // 端口状态
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
   * 检查服务是否运行
   */
  async isServiceRunning() {
    // 简单检查：后端端口3000是否被我们的服务占用
    return !this.isPortAvailable(3000) && this.isOurService(3000);
  }
}

module.exports = { SystemChecker };