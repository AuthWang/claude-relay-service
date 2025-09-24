const databaseManager = require('../src/models/database')
const webhookService = require('../src/services/webhookConfigService')

async function testWebhookHybridStorage() {
  try {
    console.log('🧪 测试Webhook混合存储服务...')

    // 初始化数据库连接
    await databaseManager.initialize()

    // 测试获取默认配置
    console.log('\n1️⃣ 测试获取默认配置...')
    const defaultConfig = await webhookService.getConfig()
    console.log('✅ 默认配置:', JSON.stringify(defaultConfig, null, 2))

    // 测试保存配置
    console.log('\n2️⃣ 测试保存配置...')
    defaultConfig.enabled = true
    defaultConfig.notificationTypes.test = true
    await webhookService.saveConfig(defaultConfig)
    console.log('✅ 配置已保存')

    // 测试添加平台
    console.log('\n3️⃣ 测试添加平台...')
    const testPlatform = {
      type: 'telegram',
      name: '测试 Telegram',
      enabled: true,
      botToken: '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11',
      chatId: '123456789'
    }
    const addedPlatform = await webhookService.addPlatform(testPlatform)
    console.log('✅ 平台已添加:', addedPlatform)

    // 测试获取启用的平台
    console.log('\n4️⃣ 测试获取启用的平台...')
    const enabledPlatforms = await webhookService.getEnabledPlatforms()
    console.log('✅ 启用的平台:', enabledPlatforms)

    // 测试健康检查
    console.log('\n5️⃣ 测试健康检查...')
    const health = await webhookService.healthCheck()
    console.log('✅ 健康状态:', health)

    // 测试性能统计
    console.log('\n6️⃣ 测试性能统计...')
    const stats = webhookService.getStats()
    console.log('✅ 性能统计:', stats)

    console.log('\n🎉 所有测试通过！混合存储webhook服务工作正常')
  } catch (error) {
    console.error('❌ 测试失败:', error)
    throw error
  }
}

// 加载环境变量
require('dotenv').config()

// 执行测试
testWebhookHybridStorage().catch(console.error)
