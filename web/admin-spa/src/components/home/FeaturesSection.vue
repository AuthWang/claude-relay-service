<template>
  <section class="features-section mb-12 md:mb-16">
    <div class="mx-auto max-w-6xl">
      <!-- 标题 -->
      <div class="mb-10 text-center">
        <h2 class="mb-4 text-3xl font-bold text-gray-800 dark:text-gray-200 md:text-4xl">
          为什么选择我们的AI中转服务？
        </h2>
        <p class="mx-auto max-w-4xl text-lg text-gray-600 dark:text-gray-400">
          整合全球顶尖AI模型，为您提供稳定、高效、低成本的统一API接入服务。
        </p>
      </div>

      <!-- 功能特性网格 -->
      <div class="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <!-- 智能代码生成 -->
        <div class="feature-card" data-index="0">
          <div class="feature-icon">
            <i class="fas fa-code text-3xl text-purple-500"></i>
          </div>
          <h3 class="feature-title">智能代码生成</h3>
          <p class="feature-description">
            基于Claude、Gemini、OpenAI技术，协助生成代码片段，提供编程建议和方案参考
          </p>
          <div class="feature-stats">
            <span class="stat-number">智能</span>
            <span class="stat-label">代码辅助</span>
          </div>
        </div>

        <!-- 错误诊断修复 -->
        <div class="feature-card" data-index="1">
          <div class="feature-icon">
            <i class="fas fa-bug text-3xl text-red-500"></i>
          </div>
          <h3 class="feature-title">错误诊断修复</h3>
          <p class="feature-description">协助识别常见代码问题，提供修复建议和优化思路</p>
          <div class="feature-stats">
            <span class="stat-number">协助</span>
            <span class="stat-label">问题分析</span>
          </div>
        </div>

        <!-- 代码重构优化 -->
        <div class="feature-card" data-index="2">
          <div class="feature-icon">
            <i class="fas fa-tools text-3xl text-blue-500"></i>
          </div>
          <h3 class="feature-title">代码重构优化</h3>
          <p class="feature-description">分析现有代码结构，提供重构建议和最佳实践参考</p>
          <div class="feature-stats">
            <span class="stat-number">建议</span>
            <span class="stat-label">重构方案</span>
          </div>
        </div>

        <!-- 多语言支持 -->
        <div class="feature-card" data-index="3">
          <div class="feature-icon">
            <i class="fas fa-globe text-3xl text-green-500"></i>
          </div>
          <h3 class="feature-title">多语言支持</h3>
          <p class="feature-description">支持主流编程语言，覆盖常见开发场景需求</p>
          <div class="feature-stats">
            <span class="stat-number">多种</span>
            <span class="stat-label">编程语言</span>
          </div>
        </div>

        <!-- Git集成 -->
        <div class="feature-card" data-index="4">
          <div class="feature-icon">
            <i class="fas fa-code-branch text-3xl text-orange-500"></i>
          </div>
          <h3 class="feature-title">开发工具集成</h3>
          <p class="feature-description">兼容主流开发工具和IDE，提供便捷的集成方案</p>
          <div class="feature-stats">
            <span class="stat-number">便捷</span>
            <span class="stat-label">工具集成</span>
          </div>
        </div>

        <!-- 项目理解 -->
        <div class="feature-card" data-index="5">
          <div class="feature-icon">
            <i class="fas fa-brain text-3xl text-indigo-500"></i>
          </div>
          <h3 class="feature-title">项目理解</h3>
          <p class="feature-description">分析项目结构和上下文，提供相关的代码建议</p>
          <div class="feature-stats">
            <span class="stat-number">智能</span>
            <span class="stat-label">上下文分析</span>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { onMounted } from 'vue'

onMounted(() => {
  // 创建交互观察器，实现滚动动画
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const index = entry.target.dataset.index
          setTimeout(() => {
            entry.target.classList.add('animate-in')
          }, index * 100)
        }
      })
    },
    {
      threshold: 0.1,
      rootMargin: '0px 0px -50px 0px'
    }
  )

  // 观察所有特性卡片
  const cards = document.querySelectorAll('.feature-card')
  cards.forEach((card) => {
    observer.observe(card)
  })

  return () => {
    observer.disconnect()
  }
})
</script>

<style scoped>
/* 特性卡片基础样式 */
.feature-card {
  @apply relative overflow-hidden rounded-2xl p-6 text-center transition-all duration-500;
  background: rgba(0, 0, 0, 0.05);
  border: 1px solid rgba(0, 0, 0, 0.1);
  backdrop-filter: blur(15px);
  transform: translateY(30px);
  opacity: 0;
}

.dark .feature-card {
  background: rgba(31, 41, 55, 0.6);
  border: 1px solid rgba(75, 85, 99, 0.3);
}

.feature-card.animate-in {
  transform: translateY(0);
  opacity: 1;
}

.feature-card:hover {
  transform: translateY(-5px);
  box-shadow: 0 15px 35px rgba(0, 0, 0, 0.1);
}

.dark .feature-card:hover {
  box-shadow: 0 15px 35px rgba(0, 0, 0, 0.3);
}

/* 特性图标 */
.feature-icon {
  @apply mb-4 flex justify-center;
}

.feature-card:hover .feature-icon i {
  transform: scale(1.1) rotate(5deg);
  transition: transform 0.3s ease;
}

/* 特性标题 */
.feature-title {
  @apply mb-3 text-xl font-bold text-gray-800 dark:text-gray-200;
}

/* 特性描述 */
.feature-description {
  @apply mb-4 text-sm leading-relaxed text-gray-600 dark:text-gray-400;
}

/* 统计数据 */
.feature-stats {
  @apply flex flex-col items-center;
}

.stat-number {
  @apply text-2xl font-bold;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  background-clip: text;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.stat-label {
  @apply text-xs text-gray-500 dark:text-gray-400;
}

/* 悬停效果增强 */
.feature-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.1), transparent);
  transition: left 0.5s;
}

.feature-card:hover::before {
  left: 100%;
}

/* 响应式调整 */
@media (max-width: 1024px) {
  .feature-card {
    @apply p-4;
  }

  .feature-icon i {
    @apply text-2xl;
  }

  .feature-title {
    @apply text-lg;
  }

  .stat-number {
    @apply text-xl;
  }
}

@media (max-width: 640px) {
  .feature-card {
    @apply p-4;
  }

  .feature-description {
    @apply text-xs;
  }
}

/* 加载动画 */
@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(30px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* Intersection Observer 不支持时的降级动画 */
@media (prefers-reduced-motion: no-preference) {
  .feature-card {
    animation: fadeInUp 0.6s ease-out forwards;
  }

  .feature-card:nth-child(1) {
    animation-delay: 0.1s;
  }
  .feature-card:nth-child(2) {
    animation-delay: 0.2s;
  }
  .feature-card:nth-child(3) {
    animation-delay: 0.3s;
  }
  .feature-card:nth-child(4) {
    animation-delay: 0.4s;
  }
  .feature-card:nth-child(5) {
    animation-delay: 0.5s;
  }
  .feature-card:nth-child(6) {
    animation-delay: 0.6s;
  }
}

/* 减少动画偏好设置 */
@media (prefers-reduced-motion: reduce) {
  .feature-card {
    transform: none;
    opacity: 1;
    animation: none;
  }

  .feature-card:hover {
    transform: none;
  }

  .feature-icon i {
    transition: none;
  }
}
</style>
