require('dotenv').config();
const { Pool } = require('pg');

async function testConnection() {
  const pool = new Pool({
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT) || 5432,
    database: process.env.POSTGRES_DATABASE || 'claude_relay',
    user: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD || ''
  });

  try {
    console.log('连接配置：');
    console.log('Host:', process.env.POSTGRES_HOST || 'localhost');
    console.log('Port:', parseInt(process.env.POSTGRES_PORT) || 5432);
    console.log('Database:', process.env.POSTGRES_DATABASE || 'claude_relay');
    console.log('User:', process.env.POSTGRES_USER || 'postgres');

    const result = await pool.query('SELECT current_database(), current_user');
    console.log('\n实际连接到：');
    console.log('Database:', result.rows[0].current_database);
    console.log('User:', result.rows[0].current_user);

    const tables = await pool.query('SELECT tablename FROM pg_tables WHERE schemaname = $1 ORDER BY tablename', ['public']);
    console.log('\n表列表：');
    tables.rows.forEach(row => {
      console.log('- ' + row.tablename);
    });

    // 测试api_keys表
    try {
      const apiKeysTest = await pool.query('SELECT COUNT(*) as count FROM api_keys');
      console.log('\napi_keys表测试：成功，行数：', apiKeysTest.rows[0].count);
    } catch (err) {
      console.log('\napi_keys表测试：失败 -', err.message);
    }

    // 测试usage_statistics表
    try {
      const usageTest = await pool.query('SELECT COUNT(*) as count FROM usage_statistics');
      console.log('usage_statistics表测试：成功，行数：', usageTest.rows[0].count);
    } catch (err) {
      console.log('usage_statistics表测试：失败 -', err.message);
    }

  } catch (err) {
    console.error('连接错误：', err.message);
  } finally {
    await pool.end();
  }
}

testConnection();
// Trigger nodemon restart