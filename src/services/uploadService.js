const multer = require('multer')
const path = require('path')
const fs = require('fs')
const logger = require('../utils/logger')

class UploadService {
  constructor() {
    this.uploadsDir = path.join(__dirname, '../../uploads')
    this.qrcodesDir = path.join(this.uploadsDir, 'qrcodes')

    // 确保上传目录存在
    this.ensureDirectories()
  }

  /**
   * 确保上传目录存在
   */
  ensureDirectories() {
    const dirs = [
      this.uploadsDir,
      this.qrcodesDir,
      path.join(this.qrcodesDir, 'wechat'),
      path.join(this.qrcodesDir, 'alipay'),
      path.join(this.qrcodesDir, 'other')
    ]

    dirs.forEach((dir) => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
        logger.info(`Created directory: ${dir}`)
      }
    })
  }

  /**
   * 配置 multer 存储
   */
  getMulterConfig(category = 'other') {
    const storage = multer.diskStorage({
      destination: (req, file, cb) => {
        try {
          let uploadPath
          switch (category) {
            case 'wechat':
              uploadPath = path.join(this.qrcodesDir, 'wechat')
              break
            case 'alipay':
              uploadPath = path.join(this.qrcodesDir, 'alipay')
              break
            default:
              uploadPath = path.join(this.qrcodesDir, 'other')
          }

          // 确保目录存在
          if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true })
            logger.info(`📁 Created upload directory: ${uploadPath}`)
          }

          cb(null, uploadPath)
        } catch (error) {
          logger.error('❌ Failed to create upload directory:', error)
          cb(error)
        }
      },
      filename: (req, file, cb) => {
        try {
          // 生成唯一文件名：时间戳_原文件名
          const timestamp = Date.now()
          const ext = path.extname(file.originalname)
          const name = path.basename(file.originalname, ext)
          // 清理文件名，移除特殊字符
          const cleanName = name.replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]/g, '_')
          const uniqueName = `${timestamp}_${cleanName}${ext}`

          logger.info(`📝 Generated filename: ${uniqueName} from: ${file.originalname}`)
          cb(null, uniqueName)
        } catch (error) {
          logger.error('❌ Failed to generate filename:', error)
          cb(error)
        }
      }
    })

    return multer({
      storage,
      limits: {
        fileSize: 5 * 1024 * 1024, // 5MB 限制
        fieldSize: 2 * 1024 * 1024, // 2MB field size limit
        files: 1, // 单个文件上传
        fields: 1 // 单个字段
      },
      fileFilter: (req, file, cb) => {
        try {
          // 记录文件信息
          logger.info('📋 File filter check:', {
            originalname: file.originalname,
            mimetype: file.mimetype,
            size: file.size
          })

          // 检查文件名
          if (!file.originalname) {
            return cb(new Error('文件名不能为空'))
          }

          // 只允许图片文件
          const allowedTypes = /jpeg|jpg|png|gif|webp/i
          const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase())
          const mimetype = allowedTypes.test(file.mimetype)

          if (!mimetype) {
            return cb(new Error(`不支持的MIME类型: ${file.mimetype}，只支持图片文件`))
          }

          if (!extname) {
            return cb(new Error(`不支持的文件扩展名，只支持: jpeg, jpg, png, gif, webp`))
          }

          if (mimetype && extname) {
            return cb(null, true)
          }

          cb(new Error('只能上传图片文件 (jpeg, jpg, png, gif, webp)'))
        } catch (error) {
          logger.error('❌ File filter error:', error)
          cb(error)
        }
      }
    })
  }

  /**
   * 处理单文件上传
   * @param {string} category - 文件分类 (wechat, alipay, other)
   * @returns {Function} multer middleware
   */
  uploadSingle(category = 'other') {
    const upload = this.getMulterConfig(category)
    return upload.single('image')
  }

  /**
   * 处理多文件上传
   * @param {string} category - 文件分类
   * @param {number} maxCount - 最大文件数量
   * @returns {Function} multer middleware
   */
  uploadMultiple(category = 'other', maxCount = 5) {
    const upload = this.getMulterConfig(category)
    return upload.array('images', maxCount)
  }

  /**
   * 获取文件列表
   * @param {string} category - 文件分类
   * @returns {Array} 文件列表
   */
  async getFileList(category = '') {
    try {
      let searchDir = this.qrcodesDir

      if (category && ['wechat', 'alipay', 'other'].includes(category)) {
        searchDir = path.join(this.qrcodesDir, category)
      }

      if (!fs.existsSync(searchDir)) {
        return []
      }

      const files = fs.readdirSync(searchDir)
      const fileList = []

      for (const file of files) {
        const filePath = path.join(searchDir, file)
        const stats = fs.statSync(filePath)

        if (stats.isFile()) {
          const relativePath = path.relative(this.uploadsDir, filePath).replace(/\\/g, '/')

          fileList.push({
            name: file,
            originalName: this.extractOriginalName(file),
            url: `/uploads/${relativePath}`,
            path: filePath,
            size: stats.size,
            category: category || this.getCategoryFromPath(relativePath),
            uploadTime: stats.ctime,
            lastModified: stats.mtime
          })
        }
      }

      // 按上传时间倒序排列
      fileList.sort((a, b) => new Date(b.uploadTime) - new Date(a.uploadTime))

      return fileList
    } catch (error) {
      logger.error(`Failed to get file list for category ${category}:`, error)
      return []
    }
  }

  /**
   * 删除文件
   * @param {string} filePath - 文件路径
   * @returns {boolean} 删除结果
   */
  async deleteFile(filePath) {
    try {
      // 确保文件路径在允许的目录内
      const absolutePath = path.resolve(filePath)
      const uploadsPath = path.resolve(this.uploadsDir)

      if (!absolutePath.startsWith(uploadsPath)) {
        throw new Error('Invalid file path')
      }

      if (fs.existsSync(absolutePath)) {
        fs.unlinkSync(absolutePath)
        logger.success(`Deleted file: ${filePath}`)
        return true
      }

      return false
    } catch (error) {
      logger.error(`Failed to delete file ${filePath}:`, error)
      throw error
    }
  }

  /**
   * 获取文件信息
   * @param {string} filename - 文件名
   * @param {string} category - 文件分类
   * @returns {Object|null} 文件信息
   */
  async getFileInfo(filename, category = '') {
    try {
      const files = await this.getFileList(category)
      return files.find((file) => file.name === filename) || null
    } catch (error) {
      logger.error(`Failed to get file info for ${filename}:`, error)
      return null
    }
  }

  /**
   * 从文件名提取原始名称
   * @private
   */
  extractOriginalName(filename) {
    // 移除时间戳前缀 (格式: timestamp_originalname.ext)
    const match = filename.match(/^\d+_(.+)/)
    return match ? match[1] : filename
  }

  /**
   * 从路径获取分类
   * @private
   */
  getCategoryFromPath(relativePath) {
    const parts = relativePath.split('/')
    if (parts.length >= 2 && parts[0] === 'qrcodes') {
      return parts[1] // wechat, alipay, other
    }
    return 'other'
  }

  /**
   * 生成文件URL
   * @param {string} filename - 文件名
   * @param {string} category - 分类
   * @returns {string} 文件URL
   */
  generateFileUrl(filename, category = 'other') {
    return `/uploads/qrcodes/${category}/${filename}`
  }

  /**
   * 检查文件是否存在
   * @param {string} filename - 文件名
   * @param {string} category - 分类
   * @returns {boolean} 是否存在
   */
  fileExists(filename, category = 'other') {
    const filePath = path.join(this.qrcodesDir, category, filename)
    return fs.existsSync(filePath)
  }
}

module.exports = new UploadService()
