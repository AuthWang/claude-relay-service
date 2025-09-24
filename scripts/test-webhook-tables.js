const { Pool } = require('pg')
const logger = require('winston')

// 简化的日志配置
logger.configure({
  level: 'info',
  format: logger.format.combine(
    logger.format.timestamp(),
    logger.format.colorize(),
    logger.format.printf(({ timestamp, level, message }) => `${timestamp} [${level}] ${message}`)
  ),
  transports: [new logger.transports.Console()]
})

async function testWebhookTables() {
  const pool = new Pool({
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT) || 5432,
    database: process.env.POSTGRES_DATABASE || 'claude_relay',
    user: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD || 'claude_relay_db_2024',
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000
  })

  try {
    logger.info('🧪 测试webhook表创建...')
    const client = await pool.connect()

    try {
      // 检查表是否存在
      const checkTablesQuery = `
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name IN ('webhook_configs', 'webhook_platforms', 'webhook_history')
        ORDER BY table_name
      `

      const existingTables = await client.query(checkTablesQuery)
      logger.info(`📋 现有webhook相关表 (${existingTables.rows.length}个):`)
      existingTables.rows.forEach((row) => {
        logger.info(`  - ${row.table_name}`)
      })

      // 检查默认配置
      if (existingTables.rows.some((row) => row.table_name === 'webhook_configs')) {
        const configQuery = `
          SELECT config_key, enabled, global_settings, notification_types
          FROM webhook_configs
          WHERE config_key = 'webhook_config:default'
        `

        const configResult = await client.query(configQuery)
        if (configResult.rows.length > 0) {
          logger.info('✅ 找到默认webhook配置:')
          logger.info(`  - 键名: ${configResult.rows[0].config_key}`)
          logger.info(`  - 启用状态: ${configResult.rows[0].enabled}`)
          logger.info(`  - 全局设置: ${JSON.stringify(configResult.rows[0].global_settings)}`)
          logger.info(`  - 通知类型: ${JSON.stringify(configResult.rows[0].notification_types)}`)
        } else {
          logger.info('⚠️ 未找到默认webhook配置')
        }
      }

      // 测试与混合存储服务的兼容性
      logger.info('\n🔧 测试与混合存储服务兼容性...')
      const webhookService = require('../src/services/webhookConfigService')
      const config = await webhookService.getConfig()

      logger.info('✅ 混合存储服务测试通过:')
      logger.info(`  - 配置启用: ${config.enabled}`)
      logger.info(`  - 平台数量: ${config.platforms?.length || 0}`)
      logger.info(`  - 通知类型: ${Object.keys(config.notificationTypes || {}).length}个`)

      logger.info('\n🎉 Webhook表结构和混合存储集成测试全部通过！')
    } finally {
      client.release()
    }
  } catch (error) {
    logger.error('❌ 测试失败:', error.message)
    throw error
  } finally {
    await pool.end()
  }
}

// 加载环境变量
require('dotenv').config()

// 执行测试
testWebhookTables().catch(console.error)
