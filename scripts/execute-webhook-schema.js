const fs = require('fs')
const path = require('path')
const { Pool } = require('pg')

async function executeWebhookSchema() {
  const pool = new Pool({
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT) || 5432,
    database: process.env.POSTGRES_DATABASE || 'claude_relay',
    user: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD || 'claude_relay_db_2024',
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 60000
  })

  try {
    console.log('🗄️ 连接PostgreSQL数据库...')

    // 读取SQL脚本
    const schemaPath = path.join(__dirname, 'webhook-schema.sql')
    const schema = fs.readFileSync(schemaPath, 'utf8')

    console.log('📝 执行webhook数据库表结构...')

    // 执行SQL脚本
    await pool.query(schema)

    console.log('✅ Webhook数据库表结构创建成功!')

    // 验证表是否存在
    const result = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name IN ('webhook_configs', 'webhook_platforms', 'webhook_history')
      ORDER BY table_name
    `)

    console.log('📋 创建的表:')
    result.rows.forEach((row) => {
      console.log(`  - ${row.table_name}`)
    })
  } catch (error) {
    console.error('❌ 执行失败:', error.message)
    throw error
  } finally {
    await pool.end()
  }
}

// 加载环境变量
require('dotenv').config()

// 执行
executeWebhookSchema().catch(console.error)
