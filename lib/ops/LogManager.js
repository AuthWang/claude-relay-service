/**
 * 日志管理类
 * 负责日志查看、实时日志、降级策略等
 */

const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

class LogManager {
  constructor(rootDir) {
    this.rootDir = rootDir;
    this.isWindows = process.platform === 'win32';
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
      const logsDir = path.join(this.rootDir, 'logs');

      if (fs.existsSync(logsDir)) {
        const logFiles = fs.readdirSync(logsDir);

        for (const file of logFiles) {
          const filePath = path.join(logsDir, file);
          try {
            fs.unlinkSync(filePath);
            console.log(`🗑️  删除: ${file}`);
          } catch (error) {
            console.log(`⚠️  无法删除 ${file}: ${error.message}`);
          }
        }
      } else {
        console.log('📁 日志目录不存在');
      }

      // 清理其他缓存文件
      const cacheFiles = [
        path.join(this.rootDir, 'claude-relay-service.pid'),
        path.join(this.rootDir, '.ops-history'),
        path.join(this.rootDir, 'web', 'admin-spa', 'dist'),
        path.join(this.rootDir, 'web', 'admin-spa', '.vite')
      ];

      for (const cachePath of cacheFiles) {
        if (fs.existsSync(cachePath)) {
          try {
            if (fs.statSync(cachePath).isDirectory()) {
              fs.rmSync(cachePath, { recursive: true, force: true });
              console.log(`🗑️  清理目录: ${path.basename(cachePath)}`);
            } else {
              fs.unlinkSync(cachePath);
              console.log(`🗑️  删除文件: ${path.basename(cachePath)}`);
            }
          } catch (error) {
            console.log(`⚠️  清理失败 ${path.basename(cachePath)}: ${error.message}`);
          }
        }
      }

      console.log('✅ 清理完成');

    } catch (error) {
      console.log('⚠️  部分清理操作失败:', error.message);
    }
  }
}

module.exports = { LogManager };