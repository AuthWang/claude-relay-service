#!/usr/bin/env node
/**
 * 数据库管理脚本
 *
 * 功能：
 * - 数据库健康检查
 * - 数据同步操作
 * - 存储策略切换
 * - 数据一致性检查
 * - 性能监控
 */

const { program } = require('commander')
const chalk = require('chalk')
const ora = require('ora')

// 确保加载配置
require('dotenv').config()

const databaseInit = require('../src/utils/databaseInit')
const database = require('../src/models/database')
const _logger = require('../src/utils/logger')

// 配置命令行参数
program
  .name('database-manager')
  .description('Claude Relay Service Database Management Tool')
  .version('1.0.0')

// 健康检查命令
program
  .command('health')
  .description('Check database health status')
  .option('-v, --verbose', 'Show detailed information')
  .action(async (options) => {
    const spinner = ora('Checking database health...').start()

    try {
      await databaseInit.initialize()
      const health = await databaseInit.getHealthStatus()

      spinner.succeed('Health check completed')

      console.log(chalk.cyan('\n📊 Database Health Status:'))
      console.log(`Overall Status: ${getStatusIcon(health.status)} ${health.status}`)
      console.log(`Strategy: ${chalk.yellow(health.strategy)}`)
      console.log(`Initialized: ${health.initialized ? '✅' : '❌'}`)

      console.log(chalk.cyan('\n🔗 Connections:'))
      console.log(
        `Redis: ${health.databases.redis.connected ? '🟢' : '🔴'} Connected, ${health.databases.redis.responsive ? '🟢' : '🔴'} Responsive`
      )
      console.log(
        `PostgreSQL: ${health.databases.postgres.connected ? '🟢' : '🔴'} Connected, ${health.databases.postgres.responsive ? '🟢' : '🔴'} Responsive`
      )

      if (options.verbose && health.metrics) {
        console.log(chalk.cyan('\n📈 Performance Metrics:'))
        console.log(`Total Operations: ${health.metrics.totalOperations}`)
        console.log(`Cache Hit Rate: ${health.metrics.cacheHitRate || '0%'}`)
        console.log(`Error Rate: ${health.metrics.errorRate || '0%'}`)
      }

      await databaseInit.shutdown()
    } catch (error) {
      spinner.fail('Health check failed')
      console.error(chalk.red('❌ Error:'), error.message)
      process.exit(1)
    }
  })

// 数据同步命令
program
  .command('sync')
  .description('Synchronize data between Redis and PostgreSQL')
  .option('-s, --source <source>', 'Source database (redis|postgres)', 'redis')
  .option('-t, --target <target>', 'Target database (postgres|redis)', 'postgres')
  .option('-f, --force', 'Force sync without confirmation')
  .action(async (options) => {
    const { source, target, force } = options

    if (!force) {
      console.log(chalk.yellow(`⚠️  This will sync data from ${source} to ${target}`))
      console.log(chalk.yellow('   This may overwrite existing data in the target database'))
      console.log(chalk.yellow('   Use --force to skip this confirmation'))
      return
    }

    const spinner = ora(`Syncing data from ${source} to ${target}...`).start()

    try {
      await databaseInit.initialize()

      let result
      if (source === 'redis' && target === 'postgres') {
        result = await databaseInit.forceSyncRedisToPostgres()
      } else if (source === 'postgres' && target === 'redis') {
        result = await databaseInit.forceSyncPostgresToRedis()
      } else {
        throw new Error('Invalid sync direction. Use redis->postgres or postgres->redis')
      }

      spinner.succeed('Data sync completed')

      console.log(chalk.green('\n✅ Sync Results:'))
      console.log(`Synced: ${result.synced}`)
      console.log(`Errors: ${result.errors}`)
      console.log(`Total: ${result.total}`)

      await databaseInit.shutdown()
    } catch (error) {
      spinner.fail('Data sync failed')
      console.error(chalk.red('❌ Error:'), error.message)
      process.exit(1)
    }
  })

// 一致性检查命令
program
  .command('check-consistency')
  .description('Check data consistency between Redis and PostgreSQL')
  .action(async () => {
    const spinner = ora('Checking data consistency...').start()

    try {
      await databaseInit.initialize()

      const [redisKeys, pgKeys] = await Promise.allSettled([
        database.redis.getAllApiKeys(),
        database.postgres.getAllApiKeys()
      ])

      const redisCount = redisKeys.status === 'fulfilled' ? redisKeys.value.length : 0
      const pgCount = pgKeys.status === 'fulfilled' ? pgKeys.value.length : 0
      const isConsistent = redisCount === pgCount
      const difference = Math.abs(redisCount - pgCount)

      spinner.succeed('Consistency check completed')

      console.log(chalk.cyan('\n🔍 Consistency Check Results:'))
      console.log(`Redis API Keys: ${redisCount}`)
      console.log(`PostgreSQL API Keys: ${pgCount}`)
      console.log(
        `Status: ${isConsistent ? '✅ Consistent' : `❌ Inconsistent (${difference} records differ)`}`
      )

      if (!isConsistent) {
        console.log(chalk.yellow('\n💡 Recommendations:'))
        console.log('  - Run data sync operation')
        console.log('  - Check for recent write failures')
        console.log('  - Review error logs')
      }

      await databaseInit.shutdown()
    } catch (error) {
      spinner.fail('Consistency check failed')
      console.error(chalk.red('❌ Error:'), error.message)
      process.exit(1)
    }
  })

// 策略切换命令
program
  .command('switch-strategy')
  .description('Switch storage strategy')
  .argument(
    '<strategy>',
    'Strategy to switch to (dual_write|cache_first|database_first|redis_only|postgres_only)'
  )
  .option('-f, --force', 'Force switch without confirmation')
  .action(async (strategy, options) => {
    const validStrategies = [
      'dual_write',
      'cache_first',
      'database_first',
      'redis_only',
      'postgres_only'
    ]

    if (!validStrategies.includes(strategy)) {
      console.error(chalk.red(`❌ Invalid strategy: ${strategy}`))
      console.log(chalk.cyan('Valid strategies:'), validStrategies.join(', '))
      process.exit(1)
    }

    if (!options.force) {
      console.log(chalk.yellow(`⚠️  This will switch the storage strategy to: ${strategy}`))
      console.log(chalk.yellow('   This may affect service availability and data consistency'))
      console.log(chalk.yellow('   Use --force to skip this confirmation'))
      return
    }

    const spinner = ora(`Switching to ${strategy} strategy...`).start()

    try {
      await databaseInit.initialize()

      switch (strategy) {
        case 'redis_only':
          await databaseInit.switchToRedisOnly()
          break
        case 'postgres_only':
          await databaseInit.switchToPostgresOnly()
          break
        case 'dual_write': {
          const _success = await databaseInit.restoreDualMode()
          if (!_success) {
            throw new Error('Cannot restore dual-write mode - databases not available')
          }
          break
        }
        default:
          // For other strategies, directly set the strategy
          database.currentStrategy = strategy
          break
      }

      spinner.succeed(`Strategy switched to ${strategy}`)
      console.log(chalk.green(`✅ Current strategy: ${database.currentStrategy}`))

      await databaseInit.shutdown()
    } catch (error) {
      spinner.fail('Strategy switch failed')
      console.error(chalk.red('❌ Error:'), error.message)
      process.exit(1)
    }
  })

// 性能监控命令
program
  .command('metrics')
  .description('Show performance metrics')
  .option('-w, --watch', 'Watch metrics continuously')
  .option('-i, --interval <seconds>', 'Update interval for watch mode (default: 5)', '5')
  .action(async (options) => {
    try {
      await databaseInit.initialize()

      if (options.watch) {
        const interval = parseInt(options.interval) * 1000
        console.log(
          chalk.cyan(
            `📊 Watching metrics (updating every ${options.interval}s, press Ctrl+C to stop)...\n`
          )
        )

        setInterval(async () => {
          try {
            const metrics = database.getPerformanceMetrics()
            const health = await databaseInit.getHealthStatus()

            console.clear()
            console.log(chalk.cyan('📊 Real-time Database Metrics'))
            console.log(chalk.gray(`Last updated: ${new Date().toLocaleTimeString()}\n`))

            console.log(`Strategy: ${chalk.yellow(health.strategy)}`)
            console.log(`Status: ${getStatusIcon(health.status)} ${health.status}`)
            console.log(`Total Operations: ${metrics.totalOperations}`)
            console.log(`Cache Hits: ${metrics.cacheHits} | Misses: ${metrics.cacheMisses}`)
            console.log(`Cache Hit Rate: ${metrics.cacheHitRate || '0%'}`)
            console.log(`Redis Errors: ${metrics.redisErrors}`)
            console.log(`PostgreSQL Errors: ${metrics.postgresErrors}`)
            console.log(`Error Rate: ${metrics.errorRate || '0%'}`)
          } catch (error) {
            console.error(chalk.red('❌ Error updating metrics:'), error.message)
          }
        }, interval)
      } else {
        const metrics = database.getPerformanceMetrics()
        const health = await databaseInit.getHealthStatus()

        console.log(chalk.cyan('\n📊 Database Metrics:'))
        console.log(`Strategy: ${chalk.yellow(health.strategy)}`)
        console.log(`Status: ${getStatusIcon(health.status)} ${health.status}`)
        console.log(`Total Operations: ${metrics.totalOperations}`)
        console.log(`Cache Hits: ${metrics.cacheHits}`)
        console.log(`Cache Misses: ${metrics.cacheMisses}`)
        console.log(`Cache Hit Rate: ${metrics.cacheHitRate || '0%'}`)
        console.log(`Redis Errors: ${metrics.redisErrors}`)
        console.log(`PostgreSQL Errors: ${metrics.postgresErrors}`)
        console.log(`Error Rate: ${metrics.errorRate || '0%'}`)

        await databaseInit.shutdown()
      }
    } catch (error) {
      console.error(chalk.red('❌ Error:'), error.message)
      process.exit(1)
    }
  })

// 缓存清理命令
program
  .command('clear-cache')
  .description('Clear Redis cache')
  .option('-p, --pattern <pattern>', 'Key pattern to clear (default: clear all)', '')
  .option('-f, --force', 'Force clear without confirmation')
  .action(async (options) => {
    const { pattern, force } = options

    if (!force) {
      console.log(
        chalk.yellow(
          `⚠️  This will clear ${pattern ? `cache keys matching: ${pattern}` : 'ALL cache data'}`
        )
      )
      console.log(chalk.yellow('   This operation cannot be undone'))
      console.log(chalk.yellow('   Use --force to skip this confirmation'))
      return
    }

    const spinner = ora(
      `Clearing cache${pattern ? ` (pattern: ${pattern})` : ' (all data)'}...`
    ).start()

    try {
      await databaseInit.initialize()

      if (pattern) {
        const keys = await database.redis.keys(pattern)
        if (keys.length > 0) {
          await database.redis.del(...keys)
        }
        spinner.succeed(`Cleared ${keys.length} cache entries`)
      } else {
        await database.redis.client.flushdb()
        spinner.succeed('All cache cleared')
      }

      await databaseInit.shutdown()
    } catch (error) {
      spinner.fail('Cache clear failed')
      console.error(chalk.red('❌ Error:'), error.message)
      process.exit(1)
    }
  })

// 工具函数
function getStatusIcon(status) {
  switch (status) {
    case 'healthy':
      return '🟢'
    case 'degraded':
      return '🟡'
    case 'unhealthy':
      return '🔴'
    case 'not_initialized':
      return '⚪'
    default:
      return '❓'
  }
}

// 处理未处理的错误
process.on('uncaughtException', (error) => {
  console.error(chalk.red('❌ Uncaught Exception:'), error.message)
  process.exit(1)
})

process.on('unhandledRejection', (reason, promise) => {
  console.error(chalk.red('❌ Unhandled Rejection at:'), promise, chalk.red('reason:'), reason)
  process.exit(1)
})

// 解析命令行参数
program.parse()

// 如果没有提供命令，显示帮助信息
if (!process.argv.slice(2).length) {
  program.outputHelp()
}
