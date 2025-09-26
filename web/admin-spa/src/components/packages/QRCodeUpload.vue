<template>
  <!-- 简单的图片上传组件 - 单一职责原则 -->
  <div class="simple-image-uploader">
    <!-- 当前图片预览 -->
    <div v-if="currentUrl" class="mb-4 text-center">
      <div class="relative inline-block">
        <img
          :src="currentUrl"
          alt="当前图片"
          class="w-32 h-32 object-cover rounded-lg border-2 border-gray-200 dark:border-gray-700"
        >
        <button
          @click="$emit('update', '')"
          class="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full text-xs hover:bg-red-600 transition-colors"
          title="移除"
        >
          ✕
        </button>
      </div>
    </div>

    <!-- 上传区域 -->
    <div
      class="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-8 text-center transition-colors hover:border-blue-400 dark:hover:border-blue-500 cursor-pointer"
      @click="$refs.fileInput.click()"
    >
      <input
        ref="fileInput"
        type="file"
        accept="image/*"
        @change="handleUpload"
        class="hidden"
      >

      <div v-if="!uploading">
        <i class="fas fa-cloud-upload-alt text-4xl text-gray-400 dark:text-gray-500 mb-3"></i>
        <p class="text-gray-600 dark:text-gray-400 mb-1">点击上传图片</p>
        <p class="text-sm text-gray-500">支持 JPG, PNG, GIF, WebP，最大 5MB</p>
      </div>

      <div v-else>
        <i class="fas fa-spinner animate-spin text-3xl text-blue-500 mb-3"></i>
        <p class="text-blue-600 dark:text-blue-400">上传中...</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import api from '@/config/api'

// Props
const props = defineProps({
  currentUrl: {
    type: String,
    default: ''
  },
  category: {
    type: String,
    default: 'wechat'
  }
})

// Emits
const emit = defineEmits(['update'])

// 状态
const uploading = ref(false)

// 上传处理
async function handleUpload(event) {
  const file = event.target.files[0]
  if (!file) return

  // 验证文件
  if (!isValidFile(file)) return

  try {
    uploading.value = true
    const formData = new FormData()
    formData.append('image', file)

    const response = await api.post(`/admin/upload/qrcode?category=${props.category}`, formData)

    if (response.success) {
      ElMessage.success('上传成功')
      emit('update', response.data.url)
    } else {
      ElMessage.error(response.message || '上传失败')
    }
  } catch (error) {
    console.error('Upload error:', error)
    console.error('Upload error details:', {
      message: error.message,
      response: error.response,
      status: error.response?.status
    })

    // 更详细的错误处理
    if (error.response?.data?.message) {
      ElMessage.error(error.response.data.message)
    } else if (error.message) {
      ElMessage.error(`上传失败: ${error.message}`)
    } else {
      ElMessage.error('上传失败')
    }
  } finally {
    uploading.value = false
    // 清空文件输入
    event.target.value = ''
  }
}

// 文件验证
function isValidFile(file) {
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp']
  if (!allowedTypes.includes(file.type)) {
    ElMessage.error('请选择支持的图片格式（JPG, PNG, GIF, WebP）')
    return false
  }

  if (file.size > 5 * 1024 * 1024) {
    ElMessage.error('图片大小不能超过 5MB')
    return false
  }

  return true
}
</script>

<style scoped>
/* 简洁的上传区域样式 */
.simple-image-uploader {
  max-width: 400px;
  margin: 0 auto;
}

.border-dashed:hover {
  border-color: #3b82f6;
  background-color: rgba(59, 130, 246, 0.05);
}

.dark .border-dashed:hover {
  background-color: rgba(59, 130, 246, 0.1);
}
</style>