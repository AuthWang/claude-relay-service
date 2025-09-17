require('dotenv').config()
const { Pool } = require('pg')

async function fixUsageStatisticsTable() {
  const pool = new Pool({
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT) || 5432,
    database: process.env.POSTGRES_DATABASE || 'claude_relay',
    user: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD || ''
  })

  try {
    console.log('开始修复 usage_statistics 表结构...')

    // 删除现有的 usage_statistics 表
    await pool.query('DROP TABLE IF EXISTS usage_statistics CASCADE')
    console.log('✅ 删除了旧的 usage_statistics 表')

    // 重新创建正确的 usage_statistics 表结构
    const createTableSQL = `
      CREATE TABLE usage_statistics (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        api_key_id VARCHAR(64) NOT NULL,
        usage_date DATE NOT NULL,
        usage_hour INTEGER, -- NULL 表示日统计，非空表示小时统计
        model_name VARCHAR(100) NOT NULL,
        
        -- 请求和token统计
        requests_count BIGINT NOT NULL DEFAULT 0,
        input_tokens BIGINT NOT NULL DEFAULT 0,
        output_tokens BIGINT NOT NULL DEFAULT 0,
        total_tokens BIGINT NOT NULL DEFAULT 0,
        
        -- 缓存tokens
        cache_create_tokens BIGINT NOT NULL DEFAULT 0,
        cache_read_tokens BIGINT NOT NULL DEFAULT 0,
        
        -- 临时token统计
        ephemeral_5m_tokens BIGINT NOT NULL DEFAULT 0,
        ephemeral_1h_tokens BIGINT NOT NULL DEFAULT 0,
        
        -- 长上下文token统计
        long_context_input_tokens BIGINT NOT NULL DEFAULT 0,
        long_context_output_tokens BIGINT NOT NULL DEFAULT 0,
        long_context_requests BIGINT NOT NULL DEFAULT 0,
        
        -- 时间戳
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        
        -- 唯一约束：确保同一天/小时的同一个API KEY和模型只有一条记录
        UNIQUE(api_key_id, usage_date, usage_hour, model_name)
      )
    `

    await pool.query(createTableSQL)
    console.log('✅ 创建了新的 usage_statistics 表')

    // 创建索引
    const indexes = [
      'CREATE INDEX idx_usage_api_key ON usage_statistics(api_key_id)',
      'CREATE INDEX idx_usage_date ON usage_statistics(usage_date)',
      'CREATE INDEX idx_usage_model ON usage_statistics(model_name)',
      'CREATE INDEX idx_usage_date_model ON usage_statistics(usage_date, model_name)',
      'CREATE INDEX idx_usage_hour ON usage_statistics(usage_hour)',
      'CREATE INDEX idx_usage_composite ON usage_statistics(api_key_id, usage_date, usage_hour)'
    ]

    for (const indexSQL of indexes) {
      await pool.query(indexSQL)
    }
    console.log('✅ 创建了所有索引')

    // 添加外键约束
    await pool.query(
      'ALTER TABLE usage_statistics ADD CONSTRAINT fk_usage_api_key FOREIGN KEY (api_key_id) REFERENCES api_keys(id) ON DELETE CASCADE'
    )
    console.log('✅ 添加了外键约束')

    // 创建更新时间戳的触发器
    await pool.query(`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
          NEW.updated_at = CURRENT_TIMESTAMP;
          RETURN NEW;
      END;
      $$ language 'plpgsql'
    `)

    await pool.query(
      'CREATE TRIGGER update_usage_statistics_updated_at BEFORE UPDATE ON usage_statistics FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()'
    )
    console.log('✅ 创建了更新时间戳触发器')

    console.log('\n🎉 usage_statistics 表结构修复完成！')

    // 验证表结构
    const result = await pool.query(
      "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'usage_statistics' ORDER BY ordinal_position"
    )
    console.log('\n📋 最终表结构：')
    result.rows.forEach((row) => {
      console.log(`  ${row.column_name}: ${row.data_type}`)
    })
  } catch (error) {
    console.error('❌ 修复表结构时出错：', error.message)
  } finally {
    await pool.end()
  }
}

fixUsageStatisticsTable()
