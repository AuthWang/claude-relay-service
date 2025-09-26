<template>
  <!-- 图片选择器 - 独立功能组件 -->
  <div class="image-selector">
    <!-- 分类选择 -->
    <div class="flex items-center gap-4 mb-4">
      <label class="text-sm font-medium text-gray-700 dark:text-gray-300">分类：</label>
      <div class="flex gap-2">
        <button
          v-for="cat in categories"
          :key="cat.value"
          @click="selectedCategory = cat.value"
          :class="[
            'px-3 py-1 text-xs rounded-full transition-colors',
            selectedCategory === cat.value
              ? 'bg-blue-600 text-white'
              : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-300 dark:hover:bg-gray-600'
          ]"
        >
          {{ cat.label }}
        </button>
      </div>
    </div>

    <!-- 图片网格 -->
    <div v-if="loading" class="text-center py-8">
      <i class="fas fa-spinner animate-spin text-xl text-gray-400 dark:text-gray-500"></i>
      <p class="text-gray-500 dark:text-gray-400 mt-2">加载中...</p>
    </div>

    <div v-else-if="filteredImages.length > 0" class="max-h-60 overflow-y-auto">
      <div class="grid grid-cols-4 gap-3">
        <div
          v-for="image in filteredImages"
          :key="image.name"
          @click="selectImage(image)"
          :class="[
            'relative cursor-pointer group rounded-lg overflow-hidden border-2 transition-all',
            selectedImage === image.url
              ? 'border-blue-500 ring-2 ring-blue-200 dark:ring-blue-800'
              : 'border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-600'
          ]"
        >
          <img
            :src="image.url"
            :alt="image.originalName"
            class="w-full h-16 object-cover"
          >

          <!-- 选中状态 -->
          <div
            v-if="selectedImage === image.url"
            class="absolute inset-0 bg-blue-500 bg-opacity-20 flex items-center justify-center"
          >
            <i class="fas fa-check text-white text-lg"></i>
          </div>

          <!-- 删除按钮 -->
          <button
            type="button"
            @click.stop="deleteImage(image)"
            class="absolute top-1 right-1 w-5 h-5 bg-red-500 text-white rounded-full text-xs opacity-0 group-hover:opacity-100 hover:bg-red-600 transition-all"
            title="删除图片"
          >
            <i class="fas fa-trash"></i>
          </button>
        </div>
      </div>
    </div>

    <div v-else class="text-center py-8 text-gray-500 dark:text-gray-400">
      <i class="fas fa-images text-2xl mb-2"></i>
      <p>暂无{{ categories.find(c => c.value === selectedCategory)?.label }}图片</p>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import api from '@/config/api'

// Props
const props = defineProps({
  selectedImage: {
    type: String,
    default: ''
  }
})

// Emits
const emit = defineEmits(['select'])

// 状态
const loading = ref(false)
const images = ref([])
const selectedCategory = ref('wechat')

// 分类配置
const categories = [
  { value: 'wechat', label: '微信' },
  { value: 'alipay', label: '支付宝' },
  { value: 'other', label: '其他' }
]

// 计算属性
const filteredImages = computed(() => {
  return images.value.filter(image => image.category === selectedCategory.value)
})

// 监听器
watch(selectedCategory, () => {
  loadImages()
})

// 生命周期
onMounted(() => {
  loadImages()
})

// 加载图片
async function loadImages() {
  try {
    loading.value = true
    const response = await api.get('/admin/upload/files', {
      params: { category: selectedCategory.value }
    })
    images.value = response.data.data || []
  } catch (error) {
    console.error('Failed to load images:', error)
    ElMessage.error('加载图片列表失败')
    images.value = []
  } finally {
    loading.value = false
  }
}

// 选择图片
function selectImage(image) {
  emit('select', image.url)
}

// 删除图片
async function deleteImage(image) {
  try {
    await ElMessageBox.confirm(
      `确定要删除图片 "${image.originalName}" 吗？`,
      '确认删除',
      {
        type: 'warning',
        confirmButtonText: '删除',
        confirmButtonClass: 'el-button--danger'
      }
    )

    const response = await api.delete(`/admin/upload/files/${encodeURIComponent(image.name)}`, {
      params: { category: image.category }
    })

    if (response.success) {
      ElMessage.success('图片删除成功')

      // 如果删除的是当前选中的图片，清空选择
      if (props.selectedImage === image.url) {
        emit('select', '')
      }

      await loadImages()
    } else {
      ElMessage.error(response.message || '删除失败')
    }
  } catch (error) {
    if (error !== 'cancel') {
      console.error('Delete error:', error)
      if (error.response?.data?.message) {
        ElMessage.error(error.response.data.message)
      } else if (error.message) {
        ElMessage.error(`删除失败: ${error.message}`)
      } else {
        ElMessage.error('删除失败')
      }
    }
  }
}
</script>

<style scoped>
.image-selector {
  max-width: 500px;
}

/* 自定义滚动条 */
.overflow-y-auto::-webkit-scrollbar {
  width: 4px;
}

.overflow-y-auto::-webkit-scrollbar-track {
  background: transparent;
}

.overflow-y-auto::-webkit-scrollbar-thumb {
  background: #cbd5e0;
  border-radius: 2px;
}

.dark .overflow-y-auto::-webkit-scrollbar-thumb {
  background: #4a5568;
}
</style>