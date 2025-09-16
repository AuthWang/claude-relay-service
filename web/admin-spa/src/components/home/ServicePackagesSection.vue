<template>
  <section class="service-packages-section mb-12 md:mb-16">
    <div class="mx-auto max-w-7xl">
      <!-- 标题 -->
      <div class="mb-10 text-center">
        <h2 class="mb-4 text-3xl font-bold text-gray-800 dark:text-gray-200 md:text-4xl">
          Claude 中转服务套餐
        </h2>
        <p class="mx-auto max-w-3xl text-lg text-gray-600 dark:text-gray-400">
          提供多种规格的Claude AI模型中转服务，支持Sonnet和Opus模型
        </p>
      </div>

      <!-- 套餐卡片网格 -->
      <div class="grid gap-6 lg:grid-cols-4">
        <!-- 基础套餐 -->
        <div class="package-card basic-card">
          <div class="package-header">
            <div class="package-badge basic-badge">入门首选</div>
            <h3 class="package-title">基础版</h3>
            <div class="package-price">
              <span class="price-symbol">¥</span>
              <span class="price-number">99</span>
              <span class="price-period">/月</span>
            </div>
            <p class="package-description">适合轻度使用的开发者</p>
          </div>

          <div class="package-features">
            <ul class="features-list">
              <li class="feature-item">
                <i class="fas fa-check text-green-500"></i>
                Claude Sonnet 模型
              </li>
              <li class="feature-item">
                <i class="fas fa-clock text-blue-500"></i>
                每天4小时保证时长
              </li>
              <li class="feature-item">
                <i class="fas fa-users text-purple-500"></i>
                共享账户池
              </li>
              <li class="feature-item">
                <i class="fas fa-shield-alt text-green-500"></i>
                基础技术支持
              </li>
            </ul>
          </div>

          <div class="package-footer">
            <button class="package-button basic-button">选择基础版</button>
          </div>
        </div>

        <!-- 标准套餐 -->
        <div class="package-card pro-card popular">
          <div class="popular-badge">
            <i class="fas fa-star"></i>
            推荐
          </div>
          <div class="package-header">
            <div class="package-badge pro-badge">性价比之选</div>
            <h3 class="package-title">标准版</h3>
            <div class="package-price">
              <span class="price-symbol">¥</span>
              <span class="price-number">199</span>
              <span class="price-period">/月</span>
            </div>
            <p class="package-description">最受欢迎的均衡选择</p>
          </div>

          <div class="package-features">
            <ul class="features-list">
              <li class="feature-item">
                <i class="fas fa-check text-green-500"></i>
                Claude Sonnet 模型
              </li>
              <li class="feature-item">
                <i class="fas fa-infinity text-blue-500"></i>
                不限使用次数
              </li>
              <li class="feature-item">
                <i class="fas fa-clock text-purple-500"></i>
                24小时可用
              </li>
              <li class="feature-item">
                <i class="fas fa-headset text-green-500"></i>
                优先技术支持
              </li>
            </ul>
          </div>

          <div class="package-footer">
            <button class="package-button pro-button">选择标准版</button>
          </div>
        </div>

        <!-- 高级套餐 -->
        <div class="package-card premium-card">
          <div class="package-header">
            <div class="package-badge premium-badge">高端选择</div>
            <h3 class="package-title">高级版</h3>
            <div class="package-price">
              <span class="price-symbol">¥</span>
              <span class="price-number">399</span>
              <span class="price-period">/月</span>
            </div>
            <p class="package-description">更稳定的服务体验</p>
          </div>

          <div class="package-features">
            <ul class="features-list">
              <li class="feature-item">
                <i class="fas fa-crown text-yellow-500"></i>
                Claude Sonnet + Opus
              </li>
              <li class="feature-item">
                <i class="fas fa-infinity text-blue-500"></i>
                不限使用次数
              </li>
              <li class="feature-item">
                <i class="fas fa-users text-purple-500"></i>
                更少用户共享
              </li>
              <li class="feature-item">
                <i class="fas fa-headset text-green-500"></i>
                专属技术支持
              </li>
            </ul>
          </div>

          <div class="package-footer">
            <button class="package-button premium-button">选择高级版</button>
          </div>
        </div>

        <!-- 企业套餐 -->
        <div class="package-card enterprise-card">
          <div class="package-header">
            <div class="package-badge enterprise-badge">旗舰独享</div>
            <h3 class="package-title">企业版</h3>
            <div class="package-price">
              <span class="price-symbol">¥</span>
              <span class="price-number">999</span>
              <span class="price-period">/月</span>
            </div>
            <p class="package-description">独享专属，无任何限制</p>
          </div>

          <div class="package-features">
            <ul class="features-list">
              <li class="feature-item">
                <i class="fas fa-crown text-yellow-500"></i>
                Claude Sonnet + Opus
              </li>
              <li class="feature-item">
                <i class="fas fa-user-crown text-blue-500"></i>
                独享账户资源
              </li>
              <li class="feature-item">
                <i class="fas fa-infinity text-purple-500"></i>
                不做任何限制
              </li>
              <li class="feature-item">
                <i class="fas fa-phone text-green-500"></i>
                1对1专属服务
              </li>
            </ul>
          </div>

          <div class="package-footer">
            <button class="package-button enterprise-button">选择企业版</button>
          </div>
        </div>
      </div>

      <!-- 重要说明 -->
      <div
        class="mt-12 rounded-2xl bg-gradient-to-r from-blue-50 to-purple-50 p-6 dark:from-blue-900/20 dark:to-purple-900/20"
      >
        <h4 class="mb-4 text-center text-lg font-semibold text-gray-800 dark:text-gray-200">
          <i class="fas fa-info-circle mr-2 text-blue-500"></i>
          重要说明
        </h4>
        <div class="space-y-3 text-sm text-gray-600 dark:text-white">
          <div class="flex items-start gap-3">
            <i class="fas fa-microchip mt-1 text-blue-500"></i>
            <span
              ><strong>模型规格：</strong>所有套餐统一提供Claude
              Sonnet模型，高级版和企业版额外支持Opus模型</span
            >
          </div>
          <div class="flex items-start gap-3">
            <i class="fas fa-infinity mt-1 text-green-500"></i>
            <span
              ><strong>使用说明：</strong
              >标注"不限使用次数"的套餐，均以正常使用为前提，避免恶意滥用</span
            >
          </div>
          <div class="flex items-start gap-3">
            <i class="fas fa-shield-alt mt-1 text-purple-500"></i>
            <span><strong>服务保障：</strong>提供稳定的API接入服务和技术支持，确保服务质量</span>
          </div>
          <div class="flex items-start gap-3">
            <i class="fas fa-cog mt-1 text-orange-500"></i>
            <span
              ><strong>自建服务：</strong>本项目为开源的AI模型中转服务，用户可自行部署和配置</span
            >
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { onMounted } from 'vue'

onMounted(() => {
  // 添加交错动画效果
  const cards = document.querySelectorAll('.package-card')
  cards.forEach((card, index) => {
    setTimeout(() => {
      card.classList.add('animate-in')
    }, index * 200)
  })
})
</script>

<style scoped>
/* 套餐卡片基础样式 */
.package-card {
  @apply relative rounded-2xl p-6 transition-all duration-300;
  background: rgba(0, 0, 0, 0.05);
  border: 1px solid rgba(0, 0, 0, 0.1);
  backdrop-filter: blur(15px);
  transform: translateY(30px);
  opacity: 0;
  overflow: visible; /* 确保推荐标签不被截掉 */
  animation: fadeInUp 0.8s ease-out forwards;
}

.dark .package-card {
  background: rgba(31, 41, 55, 0.8);
  border: 1px solid rgba(75, 85, 99, 0.3);
}

.package-card:nth-child(1) {
  animation-delay: 0.1s;
}

.package-card:nth-child(2) {
  animation-delay: 0.2s;
}

.package-card:nth-child(3) {
  animation-delay: 0.3s;
}

.package-card:nth-child(4) {
  animation-delay: 0.4s;
}

.package-card.animate-in {
  transform: translateY(0);
  opacity: 1;
  transition: all 0.6s ease-out;
}

.package-card:hover {
  transform: translateY(-8px);
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.15);
}

/* 推荐徽章 */
.popular-badge {
  @apply absolute -right-1 -top-1 flex items-center gap-1 rounded-full px-4 py-2 text-xs font-bold text-white;
  background: linear-gradient(135deg, #ff6b6b 0%, #ee5a24 50%, #ff9ff3 100%);
  box-shadow:
    0 8px 32px rgba(255, 107, 107, 0.4),
    0 4px 16px rgba(238, 90, 36, 0.3),
    inset 0 1px 0 rgba(255, 255, 255, 0.3);
  border: 2px solid rgba(255, 255, 255, 0.2);
  z-index: 10;
  transform: rotate(-5deg);
  animation: recommend-glow 2s ease-in-out infinite alternate;
}

/* 套餐徽章 */
.package-badge {
  @apply mb-2 inline-block rounded-full px-3 py-1 text-xs font-semibold;
}

.basic-badge {
  background: linear-gradient(135deg, #6b7280 0%, #4b5563 100%);
  color: white;
}

.pro-badge {
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  color: white;
}

.premium-badge {
  background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%);
  color: white;
}

.enterprise-badge {
  background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
  color: white;
}

/* 套餐标题 */
.package-title {
  @apply mb-3 text-xl font-bold text-gray-800 dark:text-gray-200;
}

/* 价格样式 */
.package-price {
  @apply mb-4 flex items-baseline;
}

.price-symbol {
  @apply text-lg text-gray-600 dark:text-gray-400;
  animation: countUp 1s ease-out 0.8s both;
}

.price-number {
  @apply text-3xl font-bold text-gray-800 dark:text-gray-200;
  animation: countUp 1.2s ease-out 0.9s both;
}

.price-period {
  @apply ml-1 text-sm text-gray-600 dark:text-gray-400;
  animation: countUp 1s ease-out 1s both;
}

/* 描述 */
.package-description {
  @apply mb-6 text-sm leading-relaxed text-gray-600 dark:text-gray-400;
}

/* 特性列表 */
.features-title {
  @apply mb-3 text-sm font-semibold text-gray-800 dark:text-gray-200;
}

.features-list {
  @apply mb-6 space-y-2;
}

.feature-item {
  @apply flex items-start gap-2 text-sm text-gray-600 dark:text-gray-400;
}

.feature-item i {
  @apply mt-0.5 flex-shrink-0;
}

/* 按钮样式 */
.package-button {
  @apply w-full rounded-lg py-3 text-sm font-semibold text-white transition-all duration-300;
  position: relative;
  overflow: hidden;
  z-index: 0;
}

/* 白光扫过效果 */
.package-button::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: linear-gradient(
    90deg,
    transparent,
    rgba(255, 255, 255, 0.1),
    rgba(255, 255, 255, 0.3),
    rgba(255, 255, 255, 0.1),
    transparent
  );
  transform: translateX(-100%) skewX(-25deg);
  z-index: 1;
  pointer-events: none;
}

.package-button:hover::before {
  animation: shimmer 0.6s ease-out;
}

.basic-button {
  background: linear-gradient(135deg, #6b7280 0%, #4b5563 100%);
  box-shadow: 0 4px 15px rgba(107, 114, 128, 0.4);
}

.basic-button:hover {
  transform: translateY(-3px);
  box-shadow: 0 15px 30px rgba(107, 114, 128, 0.45);
  background: linear-gradient(135deg, #4b5563, #6b7280);
}

.pro-button {
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  box-shadow: 0 4px 15px rgba(16, 185, 129, 0.4);
}

.pro-button:hover {
  transform: translateY(-3px);
  box-shadow: 0 15px 30px rgba(16, 185, 129, 0.45);
  background: linear-gradient(135deg, #059669, #10b981);
}

.premium-button {
  background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%);
  box-shadow: 0 4px 15px rgba(139, 92, 246, 0.4);
}

.premium-button:hover {
  transform: translateY(-3px);
  box-shadow: 0 15px 30px rgba(139, 92, 246, 0.45);
  background: linear-gradient(135deg, #7c3aed, #8b5cf6);
}

.enterprise-button {
  background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
  box-shadow: 0 4px 15px rgba(245, 158, 11, 0.4);
}

.enterprise-button:hover {
  transform: translateY(-3px);
  box-shadow: 0 15px 30px rgba(245, 158, 11, 0.45);
  background: linear-gradient(135deg, #d97706, #f59e0b);
}

/* 建议卡片 */
.suggestion-card {
  max-width: 600px;
  margin: 0 auto;
}

/* 关键帧动画 */
@keyframes recommend-glow {
  0% {
    box-shadow:
      0 8px 32px rgba(255, 107, 107, 0.4),
      0 4px 16px rgba(238, 90, 36, 0.3),
      inset 0 1px 0 rgba(255, 255, 255, 0.3);
    transform: rotate(-5deg) scale(1);
  }
  100% {
    box-shadow:
      0 12px 40px rgba(255, 107, 107, 0.6),
      0 6px 24px rgba(238, 90, 36, 0.5),
      inset 0 1px 0 rgba(255, 255, 255, 0.4);
    transform: rotate(-5deg) scale(1.05);
  }
}

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

@keyframes countUp {
  from {
    transform: translateY(20px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

@keyframes shimmer {
  0% {
    transform: translateX(-100%) skewX(-25deg);
  }
  100% {
    transform: translateX(100%) skewX(-25deg);
  }
}

/* 响应式调整 */
@media (max-width: 768px) {
  .package-card {
    @apply p-4;
  }

  .package-price {
    @apply justify-center;
  }

  .features-list {
    @apply mb-4;
  }
}
</style>
