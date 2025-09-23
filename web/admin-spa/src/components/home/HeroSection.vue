<template>
  <section class="hero-section mb-12 md:mb-16">
    <div class="glass-strong p-8 shadow-xl md:p-10 lg:p-16">
      <div class="mx-auto max-w-6xl">
        <!-- 主标题区域 -->
        <div class="text-center">
          <h1 class="hero-title mb-6 text-4xl font-bold leading-tight md:text-5xl lg:text-6xl">
            <span class="bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
              {{ oemSettings.siteName }}
            </span>
          </h1>

          <p
            class="hero-subtitle mx-auto mb-10 max-w-4xl text-lg leading-relaxed text-gray-700 dark:text-gray-300 md:text-xl lg:text-2xl">
            Claude AI 模型中转服务 - 专业的 Claude 模型接入方案 提供统一的 API 接入和管理界面，简化
            Claude 模型的集成和使用
          </p>
        </div>

        <!-- 核心特性网格 -->
        <div class="mb-12 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          <div class="feature-card group">
            <div class="feature-icon mb-3">
              <i class="fas fa-magic text-2xl text-purple-500"></i>
            </div>
            <h3 class="mb-2 text-lg font-semibold text-gray-800 dark:text-gray-200">
              AI 模型统一接入
            </h3>
          </div>

          <div class="feature-card group">
            <div class="feature-icon mb-3">
              <i class="fas fa-chart-line text-2xl text-green-500"></i>
            </div>
            <h3 class="mb-2 text-lg font-semibold text-gray-800 dark:text-gray-200">
              便捷的中转服务
            </h3>
          </div>

          <div class="feature-card group">
            <div class="feature-icon mb-3">
              <i class="fas fa-layer-group text-2xl text-blue-500"></i>
            </div>
            <h3 class="mb-2 text-lg font-semibold text-gray-800 dark:text-gray-200">
              多平台支持和统一管理
            </h3>
          </div>

          <div class="feature-card group">
            <div class="feature-icon mb-3">
              <i class="fas fa-shield-alt text-2xl text-indigo-500"></i>
            </div>
            <h3 class="mb-2 text-lg font-semibold text-gray-800 dark:text-gray-200">
              开源项目安全透明
            </h3>
          </div>
        </div>

        <!-- 支持语言标签 -->
        <div class="text-center">
          <p class="mb-6 text-sm font-medium text-gray-600 dark:text-gray-400">技术栈:</p>
          <div class="flex flex-wrap justify-center gap-4">
            <span class="language-tag animate__animated animate__pulse animate__infinite animate__slow">Node.js</span>
            <span class="language-separator">•</span>
            <span
              class="language-tag animate__animated animate__pulse animate__infinite animate__slow animate__delay-1s">Vue.js</span>
            <span class="language-separator">•</span>
            <span
              class="language-tag animate__animated animate__pulse animate__infinite animate__slow animate__delay-2s">Redis</span>
            <span class="language-separator">•</span>
            <span
              class="language-tag animate__animated animate__pulse animate__infinite animate__slow animate__delay-3s">Docker</span>
            <span class="language-separator">•</span>
            <span
              class="language-tag animate__animated animate__pulse animate__infinite animate__slow animate__delay-4s">OAuth</span>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { onMounted } from 'vue'
import { useAuthStore } from '@/stores/auth'
const authStore = useAuthStore()
const oemSettings = computed(() => authStore.oemSettings || {})
// 动画初始化
onMounted(() => {
  // 添加加载完成的动画效果
  const heroSection = document.querySelector('.hero-section')
  if (heroSection) {
    heroSection.classList.add('animate-fade-in')
  }
})
</script>

<style scoped>
.hero-section {
  position: relative;
  overflow: hidden;
}

/* 主标题样式 */
.hero-title {
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  animation: slideInUp 0.8s ease-out;
}

.hero-subtitle {
  animation: slideInUp 0.8s ease-out 0.2s both;
}

/* 特性卡片样式 */
.feature-card {
  @apply rounded-xl p-4 text-center transition-all duration-300;
  background: rgba(0, 0, 0, 0.05);
  border: 1px solid rgba(0, 0, 0, 0.1);
  backdrop-filter: blur(10px);
}

.dark .feature-card {
  background: rgba(31, 41, 55, 0.3);
  border: 1px solid rgba(75, 85, 99, 0.3);
}

.feature-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 25px rgba(0, 0, 0, 0.15);
}

.feature-icon {
  transition: transform 0.3s ease;
}

.group:hover .feature-icon {
  transform: scale(1.1);
}

/* 语言标签样式 */
.language-tag {
  @apply inline-flex items-center rounded-full px-3 py-1 text-sm font-medium transition-transform duration-300 cursor-pointer;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  box-shadow: 0 2px 8px rgba(102, 126, 234, 0.3);
  animation: slideInUp 0.8s ease-out 0.4s both;
}

.language-tag:hover {
  transform: translateY(-3px) scale(1.05);
  box-shadow: 0 4px 16px rgba(102, 126, 234, 0.5);
}

.language-separator {
  @apply text-gray-400 dark:text-gray-500;
  animation: slideInUp 0.8s ease-out 0.4s both;
}

/* 动画效果 */
@keyframes slideInUp {
  from {
    opacity: 0;
    transform: translateY(30px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.animate-fade-in {
  animation: fadeIn 1s ease-out;
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }

  to {
    opacity: 1;
  }
}

/* 响应式调整 */
@media (max-width: 768px) {
  .glass-strong {
    @apply p-6;
  }
}

@media (max-width: 640px) {
  .feature-card {
    @apply p-3;
  }

  .hero-title {
    @apply mb-4 text-3xl;
  }

  .hero-subtitle {
    @apply mb-8 text-base;
  }

  .glass-strong {
    @apply p-4;
  }
}
</style>
