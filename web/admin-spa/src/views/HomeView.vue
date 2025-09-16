<template>
  <div class="home-view-container" :class="isDarkMode ? 'home-bg-dark' : 'home-bg-light'">
    <!-- 固定定位的主题切换按钮 -->
    <div class="theme-toggle-fixed">
      <ThemeToggle mode="compact" />
    </div>

    <!-- 英雄区块 -->
    <HeroSection />

    <!-- 动态代码演示 -->
    <CodeDemoSection />

    <!-- AI 服务套餐 -->
    <ServicePackagesSection />

    <!-- 核心功能特性 -->
    <FeaturesSection />

    <!-- 统计数据 -->
    <StatsSection />

    <!-- 用户评价 -->
    <TestimonialsSection />

    <!-- 联系支持 -->
    <SupportSection />
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useThemeStore } from '@/stores/theme'

// 导入各个section组件
import HeroSection from '@/components/home/HeroSection.vue'
import CodeDemoSection from '@/components/home/CodeDemoSection.vue'
import ServicePackagesSection from '@/components/home/ServicePackagesSection.vue'
import FeaturesSection from '@/components/home/FeaturesSection.vue'
import StatsSection from '@/components/home/StatsSection.vue'
import TestimonialsSection from '@/components/home/TestimonialsSection.vue'
import SupportSection from '@/components/home/SupportSection.vue'
import ThemeToggle from '@/components/common/ThemeToggle.vue'

const themeStore = useThemeStore()

// 响应式数据
const isDarkMode = computed(() => themeStore.isDarkMode)
</script>

<style scoped>
/* 固定定位的主题切换按钮 */
.theme-toggle-fixed {
  position: fixed;
  top: 20px;
  right: 20px;
  z-index: 1000;
  @apply transition-all duration-300;
}

/* 响应式调整 */
@media (max-width: 768px) {
  .theme-toggle-fixed {
    top: 15px;
    right: 15px;
  }
}

/* 首页容器基础样式 - 配合全局CSS覆盖规则 */
.home-view-container {
  min-height: 100vh;
  min-height: 100dvh; /* 支持动态视口高度 */
  position: relative;
  width: 100%;
  z-index: 1;
}

/* 备用样式 - 确保在所有浏览器下正确显示 */
.home-view-container.home-bg-light {
  background: white;
}

.home-view-container.home-bg-dark {
  background: #111827;
}

.glass-strong {
  @apply backdrop-blur-xl;
  background: rgba(255, 255, 255, 0.8);
  border: 1px solid rgba(0, 0, 0, 0.1);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
}

.dark .glass-strong {
  background: rgba(31, 41, 55, 0.9);
  border: 1px solid rgba(75, 85, 99, 0.3);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
}

/* 用户登录按钮样式 */
.user-login-button {
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  box-shadow: 0 4px 15px rgba(16, 185, 129, 0.4);
}

.user-login-button:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 25px rgba(16, 185, 129, 0.6);
}

/* 管理后台按钮样式 */
.admin-button-refined {
  background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
  color: white;
  box-shadow: 0 4px 15px rgba(59, 130, 246, 0.4);
}

.admin-button-refined:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 25px rgba(59, 130, 246, 0.6);
}
</style>
