<template>
  <section class="stats-section mb-12 md:mb-16">
    <div class="mx-auto max-w-6xl">
      <!-- 标题 -->
      <div class="mb-10 text-center">
        <h2 class="mb-4 text-3xl font-bold text-gray-800 dark:text-gray-200 md:text-4xl">
          平台数据概览
        </h2>
        <p class="mx-auto max-w-3xl text-lg text-gray-600 dark:text-gray-400">
          展示我们服务的基本信息和技术特色
        </p>
      </div>

      <!-- 统计数据网格 -->
      <div class="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <!-- 开发者用户 -->
        <div class="stat-card developers-card" data-index="0">
          <div class="stat-icon">
            <i class="fas fa-users text-4xl text-blue-500"></i>
          </div>
          <div class="stat-content">
            <div class="stat-number">多名</div>
            <div class="stat-unit"></div>
            <div class="stat-label">用户体验</div>
            <div class="stat-description">为开发者提供AI模型中转服务</div>
          </div>
        </div>

        <!-- 编程语言支持 -->
        <div class="stat-card languages-card" data-index="1">
          <div class="stat-icon">
            <i class="fas fa-code text-4xl text-green-500"></i>
          </div>
          <div class="stat-content">
            <div class="stat-number">多种</div>
            <div class="stat-unit"></div>
            <div class="stat-label">模型支持</div>
            <div class="stat-description">支持Claude、Gemini等主流AI模型</div>
          </div>
        </div>

        <!-- 服务可用性 -->
        <div class="stat-card uptime-card" data-index="2">
          <div class="stat-icon">
            <i class="fas fa-heartbeat text-4xl text-purple-500"></i>
          </div>
          <div class="stat-content">
            <div class="stat-number">稳定</div>
            <div class="stat-unit"></div>
            <div class="stat-label">服务运行</div>
            <div class="stat-description">致力于提供稳定可靠的中转服务</div>
          </div>
        </div>

        <!-- 客户支持 -->
        <div class="stat-card support-card" data-index="3">
          <div class="stat-icon">
            <i class="fas fa-clock text-4xl text-orange-500"></i>
          </div>
          <div class="stat-content">
            <div class="stat-number">开源</div>
            <div class="stat-unit"></div>
            <div class="stat-label">项目特色</div>
            <div class="stat-description">开源项目，社区共同维护和改进</div>
          </div>
        </div>
      </div>

      <!-- 成就展示 -->
      <div class="mt-12 text-center">
        <div class="achievement-card glass-strong rounded-2xl p-8">
          <div class="mb-6">
            <i class="fas fa-trophy text-5xl text-yellow-500"></i>
          </div>
          <h3 class="mb-4 text-2xl font-bold text-gray-800 dark:text-gray-200">Claude 中转服务</h3>
          <p class="mx-auto max-w-2xl text-gray-600 dark:text-gray-400">
            提供Claude
            AI模型的统一接入服务，支持多账户管理、代理配置和现代化Web管理界面，为开发者提供便捷的AI集成方案。
          </p>
          <div class="mt-6 flex flex-wrap justify-center gap-4">
            <div class="achievement-badge">
              <i class="fas fa-code mr-2 text-blue-500"></i>
              开源项目
            </div>
            <div class="achievement-badge">
              <i class="fas fa-cog mr-2 text-green-500"></i>
              易于配置
            </div>
            <div class="achievement-badge">
              <i class="fas fa-users mr-2 text-purple-500"></i>
              社区支持
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { onMounted, onUnmounted } from 'vue'

let observers = []

onMounted(() => {
  // 创建数字滚动动画观察器
  const numberObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const card = entry.target
          const index = parseInt(card.dataset.index)

          // 延迟动画以创建交错效果
          setTimeout(() => {
            card.classList.add('animate-in')
            startNumberAnimation(card)
          }, index * 200)
        }
      })
    },
    {
      threshold: 0.3,
      rootMargin: '0px 0px -100px 0px'
    }
  )

  // 观察所有统计卡片
  const cards = document.querySelectorAll('.stat-card')
  cards.forEach((card) => {
    numberObserver.observe(card)
  })

  observers.push(numberObserver)
})

const startNumberAnimation = (card) => {
  const numberElement = card.querySelector('.stat-number')
  const target = parseInt(numberElement.dataset.target)
  const isDecimal = numberElement.dataset.target.includes('.')
  const targetNumber = isDecimal ? parseFloat(numberElement.dataset.target) : target

  let current = 0
  const increment = targetNumber / 60 // 60 steps for smooth animation
  const duration = 2000 // 2 seconds
  const stepTime = duration / 60

  const timer = setInterval(() => {
    current += increment
    if (current >= targetNumber) {
      current = targetNumber
      clearInterval(timer)
    }

    if (isDecimal) {
      numberElement.textContent = current.toFixed(1)
    } else {
      numberElement.textContent = Math.floor(current)
    }
  }, stepTime)
}

onUnmounted(() => {
  // 清理观察器
  observers.forEach((observer) => observer.disconnect())
  observers = []
})
</script>

<style scoped>
/* 统计卡片基础样式 */
.stat-card {
  @apply relative overflow-hidden rounded-2xl p-6 text-center transition-all duration-500;
  background: rgba(0, 0, 0, 0.05);
  border: 1px solid rgba(0, 0, 0, 0.1);
  backdrop-filter: blur(15px);
  transform: translateY(30px) scale(0.95);
  opacity: 0;
}

.dark .stat-card {
  background: rgba(31, 41, 55, 0.6);
  border: 1px solid rgba(75, 85, 99, 0.3);
}

.stat-card.animate-in {
  transform: translateY(0) scale(1);
  opacity: 1;
}

.stat-card:hover {
  transform: translateY(-5px) scale(1.02);
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.15);
}

.dark .stat-card:hover {
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
}

/* 统计图标 */
.stat-icon {
  @apply mb-4 flex justify-center;
}

.stat-card:hover .stat-icon i {
  transform: scale(1.1) rotate(5deg);
  transition: transform 0.3s ease;
}

/* 统计数字 */
.stat-content {
  @apply flex flex-col items-center;
}

.stat-number {
  @apply inline-block text-4xl font-bold leading-none;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  background-clip: text;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  font-variant-numeric: tabular-nums;
}

.stat-unit {
  @apply inline-block text-2xl font-bold text-gray-600 dark:text-gray-400;
  margin-left: 2px;
}

.stat-label {
  @apply mt-2 text-lg font-semibold text-gray-800 dark:text-gray-200;
}

.stat-description {
  @apply mt-2 text-sm text-gray-600 dark:text-gray-400;
}

/* 成就卡片 */
.achievement-card {
  max-width: 800px;
  margin: 0 auto;
}

.achievement-badge {
  @apply flex items-center rounded-full px-4 py-2 text-sm font-medium;
  background: rgba(0, 0, 0, 0.05);
  border: 1px solid rgba(0, 0, 0, 0.1);
  backdrop-filter: blur(10px);
  color: inherit;
}

.dark .achievement-badge {
  background: rgba(31, 41, 55, 0.5);
  border: 1px solid rgba(75, 85, 99, 0.3);
}

/* 卡片专属样式 */
.developers-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: linear-gradient(90deg, #3b82f6, #1e40af);
}

.languages-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: linear-gradient(90deg, #10b981, #059669);
}

.uptime-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: linear-gradient(90deg, #8b5cf6, #7c3aed);
}

.support-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: linear-gradient(90deg, #f59e0b, #d97706);
}

/* 响应式调整 */
@media (max-width: 1024px) {
  .stat-card {
    @apply p-4;
  }

  .stat-number {
    @apply text-3xl;
  }

  .stat-icon i {
    @apply text-3xl;
  }
}

@media (max-width: 640px) {
  .stat-card {
    @apply p-4;
  }

  .stat-number {
    @apply text-2xl;
  }

  .stat-label {
    @apply text-base;
  }

  .stat-description {
    @apply text-xs;
  }

  .achievement-card {
    @apply p-6;
  }
}

/* 高性能动画 */
@keyframes slideInUp {
  from {
    opacity: 0;
    transform: translateY(30px) scale(0.95);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

/* 降级动画支持 */
@media (prefers-reduced-motion: reduce) {
  .stat-card {
    transform: none;
    opacity: 1;
  }

  .stat-card:hover {
    transform: none;
  }

  .stat-icon i {
    transition: none;
  }
}
</style>
