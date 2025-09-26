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
        const lines = result.split('\n').filter(line => line.trim() && line.includes('LISTENING'));
        return lines.length === 0;
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
        const lines = result.split('\n').filter(line => line.trim() && line.includes('LISTENING'));

        for (const line of lines) {
          const parts = line.trim().split(/\s+/);
          const pid = parts[parts.length - 1];
          if (pid && /^\d+$/.test(pid)) {
            try {
              // 检查进程名称
              const taskResult = execSync(`tasklist /FI "PID eq ${pid}" /FO CSV`, { encoding: 'utf8' });
              if (taskResult.includes('node.exe') || taskResult.includes('npm.cmd')) {
                // 进一步检查进程的工作目录或命令行
                try {
                  const wmiResult = execSync(`wmic process where "ProcessId=${pid}" get CommandLine /value`, { encoding: 'utf8', timeout: 5000 });
                  const currentDir = process.cwd().toLowerCase().replace(/\\/g, '/');
                  const commandLine = wmiResult.toLowerCase();

                  // 检查命令行是否包含当前项目路径或相关脚本
                  if (commandLine.includes(currentDir) ||
                      commandLine.includes('claude-relay-service') ||
                      commandLine.includes('npm run dev') ||
                      commandLine.includes('ops.js')) {
                    return true;
                  }
                } catch {
                  // 如果无法获取命令行信息，只根据进程名判断
                  return true;
                }
              }
            } catch {}
          }
        }
      } else {
        const result = execSync(`lsof -ti:${port}`, { encoding: 'utf8' });
        const pids = result.split('\n').filter(pid => pid.trim());

        for (const pid of pids) {
          try {
            const cmdResult = execSync(`ps -p ${pid} -o args=`, { encoding: 'utf8' });
            const currentDir = process.cwd();
            if ((cmdResult.includes('node') || cmdResult.includes('npm')) &&
                (cmdResult.includes(currentDir) || cmdResult.includes('claude-relay-service'))) {
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
      '端口3001可用': this.isPortAvailable(3001)
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
    const ports = [3000, 3001];

    for (const port of ports) {
      const available = this.isPortAvailable(port);
      const isOurs = available ? false : this.isOurService(port);
      const processInfo = available ? null : this.getPortProcessInfo(port);

      let status;
      if (available) {
        status = '⚪ 未使用';
      } else if (isOurs) {
        status = '🟢 运行中（我们的服务）';
        if (processInfo) {
          status += ` - PID: ${processInfo.pid}`;
        }
      } else {
        status = '🔴 被其他进程占用';
        if (processInfo) {
          status += ` - ${processInfo.name} (PID: ${processInfo.pid})`;
        }
      }

      console.log(`  端口 ${port}: ${status}`);
    }
  }

  /**
   * 获取占用端口的进程信息
   */
  getPortProcessInfo(port) {
    try {
      if (this.isWindows) {
        const result = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf8' });
        const lines = result.split('\n').filter(line => line.trim() && line.includes('LISTENING'));

        if (lines.length > 0) {
          const parts = lines[0].trim().split(/\s+/);
          const pid = parts[parts.length - 1];

          if (pid && /^\d+$/.test(pid)) {
            try {
              const taskResult = execSync(`tasklist /FI "PID eq ${pid}" /FO CSV`, { encoding: 'utf8' });
              const lines = taskResult.split('\n').filter(line => line.includes(pid));

              if (lines.length > 0) {
                const csvLine = lines[0];
                const processName = csvLine.split(',')[0].replace(/"/g, '');
                return { pid, name: processName };
              }
            } catch {}
          }
        }
      } else {
        const result = execSync(`lsof -ti:${port}`, { encoding: 'utf8' });
        const pid = result.trim();

        if (pid) {
          try {
            const nameResult = execSync(`ps -p ${pid} -o comm=`, { encoding: 'utf8' });
            return { pid, name: nameResult.trim() };
          } catch {}
        }
      }
    } catch {}

    return null;
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