<template>
  <section class="testimonials-section mb-12 md:mb-16">
    <div class="mx-auto max-w-6xl">
      <!-- 标题 -->
      <div class="mb-10 text-center">
        <h2 class="mb-4 text-3xl font-bold text-gray-800 dark:text-gray-200 md:text-4xl">
          用户真实反馈
        </h2>
        <p class="mx-auto max-w-3xl text-lg text-gray-600 dark:text-gray-400">
          来自开发者的使用反馈和体验分享
        </p>
      </div>

      <!-- 轮播容器 -->
      <div class="testimonial-carousel">
        <div ref="carouselContainer" class="carousel-container">
          <div class="carousel-track" :style="{ transform: `translateX(-${currentSlide * 100}%)` }">
            <!-- 评价卡片 1 -->
            <div class="testimonial-card">
              <div class="testimonial-content">
                <div class="quote-icon">
                  <i class="fas fa-quote-left text-2xl text-blue-500"></i>
                </div>
                <p class="testimonial-text">
                  "使用这个中转服务很方便，可以统一管理多个AI模型的访问。
                  配置简单，界面友好，为我的项目集成AI功能提供了便利。"
                </p>
                <div class="testimonial-author">
                  <div class="author-avatar">
                    <i class="fas fa-user-circle text-4xl text-gray-400"></i>
                  </div>
                  <div class="author-info">
                    <div class="author-name">张明</div>
                    <div class="author-role">全栈工程师</div>
                    <div class="author-experience">开发经验丰富</div>
                  </div>
                </div>
                <div class="rating">
                  <i class="fas fa-star text-yellow-400"></i>
                  <i class="fas fa-star text-yellow-400"></i>
                  <i class="fas fa-star text-yellow-400"></i>
                  <i class="fas fa-star text-yellow-400"></i>
                  <i class="fas fa-star text-yellow-400"></i>
                </div>
              </div>
            </div>

            <!-- 评价卡片 2 -->
            <div class="testimonial-card">
              <div class="testimonial-content">
                <div class="quote-icon">
                  <i class="fas fa-quote-left text-2xl text-green-500"></i>
                </div>
                <p class="testimonial-text">
                  "作为初学者，这个中转服务让我更容易接入AI模型。
                  文档清晰，配置步骤明确，帮助我快速集成了AI功能到项目中。"
                </p>
                <div class="testimonial-author">
                  <div class="author-avatar">
                    <i class="fas fa-user-circle text-4xl text-gray-400"></i>
                  </div>
                  <div class="author-info">
                    <div class="author-name">王小雨</div>
                    <div class="author-role">前端开发者</div>
                    <div class="author-experience">编程爱好者</div>
                  </div>
                </div>
                <div class="rating">
                  <i class="fas fa-star text-yellow-400"></i>
                  <i class="fas fa-star text-yellow-400"></i>
                  <i class="fas fa-star text-yellow-400"></i>
                  <i class="fas fa-star text-yellow-400"></i>
                  <i class="fas fa-star text-yellow-400"></i>
                </div>
              </div>
            </div>

            <!-- 评价卡片 3 -->
            <div class="testimonial-card">
              <div class="testimonial-content">
                <div class="quote-icon">
                  <i class="fas fa-quote-left text-2xl text-purple-500"></i>
                </div>
                <p class="testimonial-text">
                  "我们团队在使用这个服务后，AI模型的接入变得更加方便。
                  统一的API接口和管理界面，让团队协作变得更高效。"
                </p>
                <div class="testimonial-author">
                  <div class="author-avatar">
                    <i class="fas fa-user-circle text-4xl text-gray-400"></i>
                  </div>
                  <div class="author-info">
                    <div class="author-name">李大海</div>
                    <div class="author-role">技术经理</div>
                    <div class="author-experience">团队管理者</div>
                  </div>
                </div>
                <div class="rating">
                  <i class="fas fa-star text-yellow-400"></i>
                  <i class="fas fa-star text-yellow-400"></i>
                  <i class="fas fa-star text-yellow-400"></i>
                  <i class="fas fa-star text-yellow-400"></i>
                  <i class="fas fa-star text-yellow-400"></i>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 轮播控制 -->
        <div class="carousel-controls">
          <!-- 指示器 -->
          <div class="carousel-indicators">
            <button
              v-for="(testimonial, index) in testimonials"
              :key="index"
              :class="['indicator', { active: currentSlide === index }]"
              @click="goToSlide(index)"
            ></button>
          </div>

          <!-- 导航按钮 -->
          <div class="carousel-navigation">
            <button class="nav-button prev" @click="prevSlide">
              <i class="fas fa-chevron-left"></i>
            </button>
            <button
              class="nav-button next"
              @click="nextSlide"
            >
              <i class="fas fa-chevron-right"></i>
            </button>
          </div>
        </div>
      </div>

      <!-- 统计数据 -->
      <div class="mt-12 text-center" style="display: none;">
        <div class="testimonial-stats grid gap-6 md:grid-cols-3">
          <div class="stat-item">
            <div class="stat-number">开源</div>
            <div class="stat-label">项目特色</div>
            <div class="stat-desc">GitHub开源项目</div>
          </div>
          <div class="stat-item">
            <div class="stat-number">多模型</div>
            <div class="stat-label">支持特色</div>
            <div class="stat-desc">Claude、Gemini支持</div>
          </div>
          <div class="stat-item">
            <div class="stat-number">易部署</div>
            <div class="stat-label">使用特色</div>
            <div class="stat-desc">Docker一键部署</div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'

const currentSlide = ref(0)
const carouselContainer = ref(null)
let autoPlayTimer = null

const testimonials = ref([
  { id: 1, name: '张明' },
  { id: 2, name: '王小雨' },
  { id: 3, name: '李大海' }
])

const goToSlide = (index) => {
  currentSlide.value = index
  resetAutoPlay()
}

const nextSlide = () => {
  if (currentSlide.value < testimonials.value.length - 1) {
    currentSlide.value++
  } else {
    currentSlide.value = 0 // 循环回到第一个
  }
  resetAutoPlay()
}

const prevSlide = () => {
  if (currentSlide.value > 0) {
    currentSlide.value--
  } else {
    currentSlide.value = testimonials.value.length - 1 // 循环到最后一个
  }
  resetAutoPlay()
}

const startAutoPlay = () => {
  autoPlayTimer = setInterval(() => {
    nextSlide()
  }, 5000) // 每5秒自动切换
}

const stopAutoPlay = () => {
  if (autoPlayTimer) {
    clearInterval(autoPlayTimer)
    autoPlayTimer = null
  }
}

const resetAutoPlay = () => {
  stopAutoPlay()
  startAutoPlay()
}

// 键盘导航
const handleKeydown = (event) => {
  if (event.key === 'ArrowLeft') {
    prevSlide()
  } else if (event.key === 'ArrowRight') {
    nextSlide()
  }
}

onMounted(() => {
  startAutoPlay()
  document.addEventListener('keydown', handleKeydown)

  // 鼠标悬停时暂停自动播放
  if (carouselContainer.value) {
    carouselContainer.value.addEventListener('mouseenter', stopAutoPlay)
    carouselContainer.value.addEventListener('mouseleave', startAutoPlay)
  }
})

onUnmounted(() => {
  stopAutoPlay()
  document.removeEventListener('keydown', handleKeydown)
})
</script>

<style scoped>
/* 轮播容器 */
.testimonial-carousel {
  @apply relative;
  max-width: 800px;
  margin: 0 auto;
}

.carousel-container {
  @apply overflow-hidden rounded-2xl;
}

.carousel-track {
  @apply flex transition-transform duration-500 ease-in-out;
}

/* 评价卡片 */
.testimonial-card {
  @apply min-w-full px-4;
}

.testimonial-content {
  @apply relative rounded-2xl p-8 text-center;
  background: rgba(0, 0, 0, 0.05);
  border: 1px solid rgba(0, 0, 0, 0.1);
  backdrop-filter: blur(15px);
}

.dark .testimonial-content {
  background: rgba(31, 41, 55, 0.6);
  border: 1px solid rgba(75, 85, 99, 0.3);
}

.quote-icon {
  @apply mb-4 flex justify-center;
}

.testimonial-text {
  @apply mb-6 text-lg leading-relaxed text-gray-700 dark:text-gray-300;
  font-style: italic;
}

/* 作者信息 */
.testimonial-author {
  @apply mb-4 flex items-center justify-center gap-4;
}

.author-avatar {
  @apply flex-shrink-0;
}

.author-info {
  @apply text-left;
}

.author-name {
  @apply text-lg font-semibold text-gray-800 dark:text-gray-200;
}

.author-role {
  @apply text-sm text-gray-600 dark:text-gray-400;
}

.author-experience {
  @apply text-xs text-gray-500 dark:text-gray-500;
}

/* 评分 */
.rating {
  @apply flex justify-center gap-1;
}

/* 轮播控制 */
.carousel-controls {
  @apply mt-6 flex items-center justify-between;
}

.carousel-indicators {
  @apply flex gap-2;
}

.indicator {
  @apply h-3 w-3 rounded-full transition-all duration-300;
  background: rgba(0, 0, 0, 0.2);
  border: none;
  cursor: pointer;
}

.dark .indicator {
  background: rgba(255, 255, 255, 0.3);
}

.indicator.active {
  @apply w-8;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.indicator:hover {
  background: rgba(0, 0, 0, 0.4);
}

.dark .indicator:hover {
  background: rgba(255, 255, 255, 0.5);
}

.indicator.active:hover {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

/* 导航按钮 */
.carousel-navigation {
  @apply flex gap-2;
}

.nav-button {
  @apply flex h-10 w-10 items-center justify-center rounded-full transition-all duration-300;
  background: rgba(0, 0, 0, 0.05);
  border: 1px solid rgba(0, 0, 0, 0.1);
  color: inherit;
  cursor: pointer;
}

.dark .nav-button {
  background: rgba(31, 41, 55, 0.6);
  border: 1px solid rgba(75, 85, 99, 0.3);
}

.nav-button:hover:not(:disabled) {
  background: rgba(0, 0, 0, 0.1);
  transform: scale(1.05);
}

.dark .nav-button:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.2);
}

.nav-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* 统计数据 */
.testimonial-stats {
  max-width: 600px;
  margin: 0 auto;
}

.stat-item {
  @apply rounded-xl p-6 text-center;
  background: rgba(0, 0, 0, 0.03);
  border: 1px solid rgba(0, 0, 0, 0.05);
  backdrop-filter: blur(10px);
}

.dark .stat-item {
  background: rgba(31, 41, 55, 0.3);
  border: 1px solid rgba(75, 85, 99, 0.3);
}

.stat-number {
  @apply text-3xl font-bold;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  background-clip: text;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.stat-label {
  @apply mt-2 text-lg font-semibold text-gray-800 dark:text-gray-200;
}

.stat-desc {
  @apply text-sm text-gray-600 dark:text-gray-400;
}

.stars {
  @apply mt-1 flex justify-center gap-1;
}

/* 响应式调整 */
@media (max-width: 768px) {
  .testimonial-content {
    @apply p-6;
  }

  .testimonial-text {
    @apply text-base;
  }

  .testimonial-author {
    @apply flex-col gap-2;
  }

  .author-info {
    @apply text-center;
  }

  .carousel-controls {
    @apply flex-col gap-4;
  }
}

@media (max-width: 640px) {
  .testimonial-content {
    @apply p-4;
  }

  .testimonial-text {
    @apply text-sm;
  }

  .stat-number {
    @apply text-2xl;
  }

  .stat-label {
    @apply text-base;
  }
}

/* 减少动画偏好设置 */
@media (prefers-reduced-motion: reduce) {
  .carousel-track {
    transition: none;
  }

  .nav-button:hover {
    transform: none;
  }

  .indicator {
    transition: none;
  }
}
</style>
