<template>
  <Teleport to="body">
    <div v-if="visible" class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm">
    <div
      class="relative w-full max-w-sm mx-4 bg-white dark:bg-gray-800 rounded-2xl shadow-2xl overflow-hidden"
      @click.stop
    >
      <!-- 关闭按钮 -->
      <button
        @click="closeModal"
        class="absolute top-4 right-4 z-10 w-8 h-8 bg-black bg-opacity-50 text-white rounded-full hover:bg-opacity-70 transition-all"
      >
        <i class="fas fa-times"></i>
      </button>

      <!-- 弹窗内容 -->
      <div v-if="package" class="p-6 text-center">
        <!-- 标题 -->
        <h3 class="text-xl font-bold text-gray-900 dark:text-gray-100 mb-6">
          {{ package.modalConfig?.title || package.displayName || package.name }}
        </h3>

        <!-- 套餐信息卡片 -->
        <div class="bg-gray-50 dark:bg-gray-900 rounded-xl p-4 mb-6">
          <!-- 价格 -->
          <div class="mb-3">
            <span class="text-2xl font-bold text-gray-900 dark:text-gray-100">
              ¥{{ package.price }}
            </span>
            <span class="text-gray-600 dark:text-gray-400">/{{ package.period }}</span>
          </div>

          <!-- 描述 -->
          <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">
            {{ package.description }}
          </p>

          <!-- 特性列表 -->
          <div v-if="package.features && package.features.length > 0" class="space-y-2">
            <div
              v-for="feature in package.features.slice(0, 4)"
              :key="feature.text"
              class="flex items-center justify-center gap-2 text-sm"
            >
              <i :class="[feature.icon, `text-${feature.color}`, 'flex-shrink-0']"></i>
              <span class="text-gray-700 dark:text-gray-300">{{ feature.text }}</span>
            </div>
            <div
              v-if="package.features.length > 4"
              class="text-xs text-gray-500 dark:text-gray-500 mt-2"
            >
              +{{ package.features.length - 4 }} 项更多特性
            </div>
          </div>
        </div>

        <!-- 二维码区域 -->
        <div v-if="package.modalConfig?.qrcodeUrl" class="mb-6">
          <img
            :src="package.modalConfig.qrcodeUrl"
            :alt="package.modalConfig?.qrcodeAlt || '二维码'"
            class="w-48 h-48 mx-auto rounded-lg shadow-lg object-cover bg-white"
            @error="handleImageError"
          >

          <!-- 提示文字 -->
          <p class="text-sm text-gray-600 dark:text-gray-400 mt-4 leading-relaxed">
            {{ package.modalConfig?.tipText || '扫一扫上面的二维码图案，加我为朋友。' }}
          </p>
        </div>

        <!-- 无二维码状态 -->
        <div v-else class="mb-6 py-12">
          <div class="text-gray-400 dark:text-gray-500">
            <i class="fas fa-qrcode text-4xl mb-3"></i>
            <p class="text-sm">暂未配置二维码</p>
            <p class="text-xs mt-1">请联系管理员配置</p>
          </div>
        </div>

        <!-- 额外信息 -->
        <div v-if="package.modalConfig?.extraInfo && package.modalConfig.extraInfo.length > 0" class="mb-4">
          <div class="space-y-1 text-xs text-gray-500 dark:text-gray-500">
            <div
              v-for="info in package.modalConfig.extraInfo"
              :key="info"
              class="leading-relaxed"
            >
              {{ info }}
            </div>
          </div>
        </div>

        <!-- 联系信息 -->
        <div v-if="package.modalConfig?.contactPerson" class="text-sm font-medium text-blue-600 dark:text-blue-400">
          {{ package.modalConfig.contactPerson }}
        </div>

        <!-- 操作按钮 -->
        <div class="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
          <button
            @click="closeModal"
            class="w-full py-3 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors font-medium"
          >
            关闭
          </button>
        </div>
      </div>

      <!-- 加载状态 -->
      <div v-else class="p-8 text-center">
        <i class="fas fa-spinner animate-spin text-2xl text-gray-400 dark:text-gray-500"></i>
        <p class="text-gray-500 dark:text-gray-400 mt-2">加载中...</p>
      </div>
    </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, watch } from 'vue'
import { ElMessage } from 'element-plus'

// Props
const props = defineProps({
  visible: {
    type: Boolean,
    default: false
  },
  package: {
    type: Object,
    default: null
  }
})

// Emits
const emit = defineEmits(['update:visible'])

// 数据状态
const imageError = ref(false)

// 监听器
watch(() => props.visible, (newVal) => {
  if (newVal) {
    imageError.value = false
    // 防止背景滚动
    document.body.style.overflow = 'hidden'
  } else {
    // 恢复背景滚动
    document.body.style.overflow = 'unset'
  }
})

// 方法
function closeModal() {
  emit('update:visible', false)
}

function handleImageError() {
  imageError.value = true
  console.warn('Failed to load QR code image:', props.package?.modalConfig?.qrcodeUrl)
}

// 键盘事件处理
function handleKeydown(event) {
  if (event.key === 'Escape' && props.visible) {
    closeModal()
  }
}

// 组件销毁时清理
import { onMounted, onUnmounted } from 'vue'

onMounted(() => {
  document.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
  // 确保清理背景滚动限制
  document.body.style.overflow = 'unset'
})
</script>

<style scoped>
/* 模态框动画 */
.fixed {
  animation: modalFadeIn 0.3s ease-out;
}

.relative {
  animation: modalScaleIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

@keyframes modalFadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes modalScaleIn {
  from {
    opacity: 0;
    transform: scale(0.8) translateY(-20px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

/* 二维码图片样式 */
.w-48.h-48 {
  transition: transform 0.2s ease;
}

.w-48.h-48:hover {
  transform: scale(1.05);
}

/* 背景点击关闭 */
.fixed {
  backdrop-filter: blur(4px);
}

/* 响应式调整 */
@media (max-width: 640px) {
  .relative {
    margin: 1rem;
    max-width: calc(100vw - 2rem);
  }

  .w-48.h-48 {
    width: 12rem;
    height: 12rem;
  }
}

/* 深色模式下的二维码背景 */
.dark .bg-white {
  background-color: white !important;
}

/* 特性图标颜色 */
.text-green-500 { color: #10b981; }
.text-blue-500 { color: #3b82f6; }
.text-purple-500 { color: #8b5cf6; }
.text-yellow-500 { color: #f59e0b; }
.text-red-500 { color: #ef4444; }
.text-gray-500 { color: #6b7280; }

/* 深色模式下的图标颜色保持一致 */
.dark .text-green-500 { color: #10b981; }
.dark .text-blue-500 { color: #3b82f6; }
.dark .text-purple-500 { color: #8b5cf6; }
.dark .text-yellow-500 { color: #f59e0b; }
.dark .text-red-500 { color: #ef4444; }
.dark .text-gray-500 { color: #6b7280; }
</style>