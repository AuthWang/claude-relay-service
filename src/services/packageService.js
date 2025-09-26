const { v4: uuidv4 } = require('uuid')
const redis = require('../models/redis')
const logger = require('../utils/logger')

class PackageService {
  constructor() {
    this.keyPrefix = 'package'
    this.listKey = 'packages:list'
    this.orderKey = 'packages:order'
  }

  /**
   * 获取所有套餐
   * @param {boolean} includeInactive - 是否包含未激活的套餐
   * @returns {Array} 套餐列表
   */
  async getAllPackages(includeInactive = false) {
    try {
      // 确保 Redis 连接
      if (!redis.isConnected) {
        await redis.connect()
      }
      const client = redis.getClientSafe()
      const packageIds = await client.lrange(this.listKey, 0, -1)

      if (!packageIds.length) {
        return []
      }

      const packages = []
      for (const packageId of packageIds) {
        const packageData = await client.hgetall(`${this.keyPrefix}:${packageId}`)
        if (packageData && packageData.id) {
          const parsedPackage = this._parsePackageData(packageData)

          // 根据 includeInactive 参数过滤
          if (includeInactive || parsedPackage.isActive) {
            packages.push(parsedPackage)
          }
        }
      }

      // 按 sortOrder 排序
      packages.sort((a, b) => a.sortOrder - b.sortOrder)
      return packages
    } catch (error) {
      logger.error('Failed to get all packages:', error)
      return []
    }
  }

  /**
   * 获取公开套餐列表（供首页使用）
   * @returns {Array} 激活的套餐列表
   */
  async getPublicPackages() {
    return this.getAllPackages(false) // 只返回激活的套餐
  }

  /**
   * 根据ID获取单个套餐
   * @param {string} packageId - 套餐ID
   * @returns {Object|null} 套餐数据
   */
  async getPackageById(packageId) {
    try {
      const client = redis.getClientSafe()
      const packageData = await client.hgetall(`${this.keyPrefix}:${packageId}`)

      if (!packageData || !packageData.id) {
        return null
      }

      return this._parsePackageData(packageData)
    } catch (error) {
      logger.error(`Failed to get package ${packageId}:`, error)
      return null
    }
  }

  /**
   * 创建新套餐
   * @param {Object} packageData - 套餐数据
   * @returns {Object} 创建的套餐数据
   */
  async createPackage(packageData) {
    try {
      const packageId = `pkg_${uuidv4().replace(/-/g, '').substring(0, 8)}`
      const now = new Date().toISOString()
      const client = redis.getClientSafe()

      // 使用 Redis INCR 优化 sortOrder 生成性能
      const sortOrder = await client.incr(this.orderKey)

      const newPackage = {
        id: packageId,
        name: packageData.name || '未命名套餐',
        displayName: packageData.displayName || packageData.name || '未命名套餐',
        badge: packageData.badge || '',
        price: Number(packageData.price) || 0,
        period: packageData.period || '月',
        description: packageData.description || '',
        features: JSON.stringify(packageData.features || []),
        modalConfig: JSON.stringify(
          packageData.modalConfig || {
            title: packageData.name || '未命名套餐',
            qrcodeUrl: '',
            qrcodeAlt: '二维码',
            tipText: '扫一扫上面的二维码图案，加我为朋友。',
            extraInfo: ['添加好友后请说明所需套餐', '工作时间：9:00-22:00'],
            contactPerson: '联系客服'
          }
        ),
        sortOrder: String(sortOrder),
        isActive: String(packageData.isActive !== false), // 默认激活
        isPopular: String(packageData.isPopular === true),
        createdAt: now,
        updatedAt: now,
        createdBy: packageData.createdBy || 'admin'
      }

      // 使用 Redis 事务确保数据一致性
      const multi = client.multi()
      multi.hmset(`${this.keyPrefix}:${packageId}`, newPackage)
      multi.rpush(this.listKey, packageId)
      await multi.exec()

      logger.success(`Created new package: ${newPackage.name} (${packageId})`)
      return this._parsePackageData(newPackage)
    } catch (error) {
      logger.error('Failed to create package:', error)
      throw error
    }
  }

  /**
   * 更新套餐
   * @param {string} packageId - 套餐ID
   * @param {Object} updates - 更新数据
   * @returns {Object} 更新后的套餐数据
   */
  async updatePackage(packageId, updates) {
    try {
      const client = redis.getClientSafe()
      const existingData = await client.hgetall(`${this.keyPrefix}:${packageId}`)

      if (!existingData || !existingData.id) {
        throw new Error('Package not found')
      }

      const updatedData = {
        ...existingData,
        updatedAt: new Date().toISOString()
      }

      // 更新允许的字段
      const allowedUpdates = [
        'name',
        'displayName',
        'badge',
        'price',
        'period',
        'description',
        'features',
        'modalConfig',
        'sortOrder',
        'isActive',
        'isPopular'
      ]

      allowedUpdates.forEach((field) => {
        if (Object.hasOwnProperty.call(updates, field)) {
          if (field === 'features' || field === 'modalConfig') {
            updatedData[field] = JSON.stringify(updates[field])
          } else {
            updatedData[field] = String(updates[field])
          }
        }
      })

      await client.hmset(`${this.keyPrefix}:${packageId}`, updatedData)

      logger.success(`Updated package: ${packageId}`)
      return this._parsePackageData(updatedData)
    } catch (error) {
      logger.error(`Failed to update package ${packageId}:`, error)
      throw error
    }
  }

  /**
   * 删除套餐
   * @param {string} packageId - 套餐ID
   * @returns {boolean} 删除结果
   */
  async deletePackage(packageId) {
    try {
      const client = redis.getClientSafe()

      // 检查套餐是否存在
      const exists = await client.exists(`${this.keyPrefix}:${packageId}`)
      if (!exists) {
        throw new Error('Package not found')
      }

      // 使用 Redis 事务确保数据一致性
      const multi = client.multi()
      multi.lrem(this.listKey, 0, packageId)
      multi.del(`${this.keyPrefix}:${packageId}`)
      await multi.exec()

      logger.success(`Deleted package: ${packageId}`)
      return true
    } catch (error) {
      logger.error(`Failed to delete package ${packageId}:`, error)
      throw error
    }
  }

  /**
   * 调整套餐排序
   * @param {Array} orderList - 排序列表 [{id, sortOrder}, ...]
   * @returns {boolean} 更新结果
   */
  async reorderPackages(orderList) {
    try {
      const client = redis.getClientSafe()
      const now = new Date().toISOString()

      // 使用 Redis 事务批量更新排序
      const multi = client.multi()
      for (const item of orderList) {
        multi.hset(`${this.keyPrefix}:${item.id}`, 'sortOrder', String(item.sortOrder))
        multi.hset(`${this.keyPrefix}:${item.id}`, 'updatedAt', now)
      }
      await multi.exec()

      logger.success(`Reordered ${orderList.length} packages`)
      return true
    } catch (error) {
      logger.error('Failed to reorder packages:', error)
      throw error
    }
  }

  /**
   * 重置套餐数据到默认配置
   */
  async resetToDefaultPackages() {
    try {
      const client = redis.getClientSafe()

      // 获取现有套餐ID列表
      const packageIds = await client.lrange(this.listKey, 0, -1)

      if (packageIds.length > 0) {
        // 删除所有现有套餐数据
        const multi = client.multi()
        for (const packageId of packageIds) {
          multi.del(`${this.keyPrefix}:${packageId}`)
        }
        multi.del(this.listKey)
        multi.del(this.orderKey)
        await multi.exec()

        logger.info(`Removed ${packageIds.length} existing packages`)
      }

      // 创建默认套餐
      await this._createDefaultPackages()

      logger.success('Successfully reset packages to default configuration')
      return true
    } catch (error) {
      logger.error('Failed to reset packages to default:', error)
      throw error
    }
  }

  /**
   * 初始化默认套餐数据（如果没有任何套餐）
   */
  async initializeDefaultPackages() {
    try {
      const packages = await this.getAllPackages(true)
      if (packages.length > 0) {
        return // 已有套餐，不需要初始化
      }

      await this._createDefaultPackages()
    } catch (error) {
      logger.error('Failed to initialize default packages:', error)
    }
  }

  /**
   * 创建默认套餐数据
   * @private
   */
  async _createDefaultPackages() {
    const defaultPackages = [
      {
        name: '八人车',
        displayName: '八人车',
        badge: '入门首选',
        price: 99,
        period: '月',
        description: '适合轻度使用的开发者',
        features: [
          { icon: 'fas fa-check', color: 'green-500', text: 'Claude Sonnet 模型' },
          { icon: 'fas fa-clock', color: 'blue-500', text: '每天4小时保证时长' },
          { icon: 'fas fa-users', color: 'purple-500', text: '共享账户池' },
          { icon: 'fas fa-shield-alt', color: 'green-500', text: '基础技术支持' }
        ],
        modalConfig: {
          title: '八人车',
          qrcodeUrl: '',
          qrcodeAlt: '微信二维码',
          tipText: '扫一扫上面的二维码图案，加我为朋友。',
          extraInfo: ['添加好友后请说明所需套餐', '工作时间：9:00-22:00'],
          contactPerson: '联系客服'
        },
        isActive: true,
        isPopular: false
      },
      {
        name: '测试套餐',
        displayName: '测试套餐',
        badge: '测试专用',
        price: 0,
        period: '月',
        description: '用于测试功能的专用套餐',
        features: [
          { icon: 'fas fa-flask', color: 'blue-500', text: '测试功能' },
          { icon: 'fas fa-code', color: 'green-500', text: '开发环境' },
          { icon: 'fas fa-bug', color: 'orange-500', text: '调试支持' },
          { icon: 'fas fa-tools', color: 'purple-500', text: '工具集成' }
        ],
        modalConfig: {
          title: '测试套餐',
          qrcodeUrl: '',
          qrcodeAlt: '微信二维码',
          tipText: '扫一扫上面的二维码图案，加我为朋友。',
          extraInfo: ['添加好友后请说明所需套餐', '工作时间：9:00-22:00'],
          contactPerson: '联系客服'
        },
        isActive: true,
        isPopular: false
      },
      {
        name: '标准套餐',
        displayName: '标准套餐',
        badge: '性价比之选',
        price: 199,
        period: '月',
        description: '最受欢迎的均衡选择',
        features: [
          { icon: 'fas fa-check', color: 'green-500', text: 'Claude Sonnet 模型' },
          { icon: 'fas fa-infinity', color: 'blue-500', text: '不限使用次数' },
          { icon: 'fas fa-clock', color: 'purple-500', text: '24小时可用' },
          { icon: 'fas fa-headset', color: 'green-500', text: '优先技术支持' }
        ],
        modalConfig: {
          title: '标准套餐',
          qrcodeUrl: '',
          qrcodeAlt: '微信二维码',
          tipText: '扫一扫上面的二维码图案，加我为朋友。',
          extraInfo: ['添加好友后请说明所需套餐', '工作时间：9:00-22:00'],
          contactPerson: '联系客服'
        },
        isActive: true,
        isPopular: true
      },
      {
        name: '高级版',
        displayName: '高级版',
        badge: '高端选择',
        price: 399,
        period: '月',
        description: '更稳定的服务体验',
        features: [
          { icon: 'fas fa-crown', color: 'yellow-500', text: 'Claude Sonnet + Opus' },
          { icon: 'fas fa-infinity', color: 'blue-500', text: '不限使用次数' },
          { icon: 'fas fa-users', color: 'purple-500', text: '更少用户共享' },
          { icon: 'fas fa-headset', color: 'green-500', text: '专属技术支持' }
        ],
        modalConfig: {
          title: '高级版',
          qrcodeUrl: '',
          qrcodeAlt: '微信二维码',
          tipText: '扫一扫上面的二维码图案，加我为朋友。',
          extraInfo: ['添加好友后请说明所需套餐', '工作时间：9:00-22:00'],
          contactPerson: '联系客服'
        },
        isActive: true,
        isPopular: false
      },
      {
        name: '企业版',
        displayName: '企业版',
        badge: '旗舰独享',
        price: 999,
        period: '月',
        description: '独享专属，无任何限制',
        features: [
          { icon: 'fas fa-crown', color: 'yellow-500', text: 'Claude Sonnet + Opus' },
          { icon: 'fas fa-user-crown', color: 'blue-500', text: '独享账户资源' },
          { icon: 'fas fa-infinity', color: 'purple-500', text: '不做任何限制' },
          { icon: 'fas fa-phone', color: 'green-500', text: '1对1专属服务' }
        ],
        modalConfig: {
          title: '企业版',
          qrcodeUrl: '',
          qrcodeAlt: '微信二维码',
          tipText: '扫一扫上面的二维码图案，加我为朋友。',
          extraInfo: ['添加好友后请说明所需套餐', '工作时间：9:00-22:00'],
          contactPerson: '联系客服'
        },
        isActive: true,
        isPopular: false
      }
    ]

    for (const packageData of defaultPackages) {
      await this.createPackage(packageData)
    }

    logger.success('Created default packages')
  }

  /**
   * 解析套餐数据
   * @private
   */
  _parsePackageData(rawData) {
    try {
      return {
        id: rawData.id,
        name: rawData.name,
        displayName: rawData.displayName || rawData.name,
        badge: rawData.badge || '',
        price: Number(rawData.price) || 0,
        period: rawData.period || '月',
        description: rawData.description || '',
        features: JSON.parse(rawData.features || '[]'),
        modalConfig: JSON.parse(rawData.modalConfig || '{}'),
        sortOrder: Number(rawData.sortOrder) || 0,
        isActive: rawData.isActive === 'true',
        isPopular: rawData.isPopular === 'true',
        createdAt: rawData.createdAt,
        updatedAt: rawData.updatedAt,
        createdBy: rawData.createdBy || 'admin'
      }
    } catch (error) {
      logger.error('Failed to parse package data:', error)
      return null
    }
  }
}

module.exports = new PackageService()
