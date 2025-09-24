<template>
  <section class="support-section mb-8 md:mb-12">
    <div class="mx-auto max-w-6xl">
      <!-- 标题 -->
      <div class="mb-10 text-center" style="display: none;">
        <h2 class="mb-4 text-3xl font-bold text-gray-800 dark:text-gray-200 md:text-4xl">
          专业支持服务
        </h2>
        <p class="mx-auto max-w-3xl text-lg text-gray-600 dark:text-gray-400">
          专业的技术团队为您提供全天候支持，确保您在使用过程中的每个问题都能得到及时解答
        </p>
      </div>

      <div class="grid gap-8 lg:grid-cols-2"  style="display: none;">
        <!-- 联系方式 -->
        <div class="contact-card glass-strong rounded-2xl p-8">
          <div class="mb-6 text-center">
            <div class="support-icon mb-4">
              <i class="fas fa-headset text-5xl text-blue-500"></i>
            </div>
            <h3 class="mb-2 text-2xl font-bold text-gray-800 dark:text-gray-200">24/7 技术支持</h3>
            <p class="text-gray-600 dark:text-gray-400">我们的专业技术团队随时为您提供帮助</p>
          </div>

          <div class="contact-methods space-y-4">
            <div class="contact-item">
              <div class="contact-icon">
                <i class="fas fa-envelope text-blue-500"></i>
              </div>
              <div class="contact-info">
                <div class="contact-label">邮件支持</div>
                <div class="contact-value">support@claude-relay.com</div>
                <div class="contact-desc">工作日24小时内回复</div>
              </div>
            </div>

            <div class="contact-item">
              <div class="contact-icon">
                <i class="fab fa-qq text-green-500"></i>
              </div>
              <div class="contact-info">
                <div class="contact-label">QQ技术群</div>
                <div class="contact-value">666888999</div>
                <div class="contact-desc">实时在线答疑</div>
              </div>
            </div>

            <div class="contact-item">
              <div class="contact-icon">
                <i class="fab fa-weixin text-green-500"></i>
              </div>
              <div class="contact-info">
                <div class="contact-label">微信客服</div>
                <div class="contact-value">claude-relay-support</div>
                <div class="contact-desc">扫码添加客服微信</div>
              </div>
            </div>

            <div class="contact-item">
              <div class="contact-icon">
                <i class="fab fa-telegram text-blue-500"></i>
              </div>
              <div class="contact-info">
                <div class="contact-label">Telegram</div>
                <div class="contact-value">@claude_relay_bot</div>
                <div class="contact-desc">海外用户首选</div>
              </div>
            </div>
          </div>
        </div>

        <!-- 服务承诺 -->
        <div class="service-promises">
          <div class="promise-card glass-strong mb-6 rounded-2xl p-6">
            <div class="promise-icon mb-4">
              <i class="fas fa-clock text-3xl text-purple-500"></i>
            </div>
            <h4 class="mb-2 text-lg font-semibold text-gray-800 dark:text-gray-200">快速响应</h4>
            <p class="text-sm text-gray-600 dark:text-gray-400">
              工作时间内30分钟响应，紧急问题立即处理
            </p>
          </div>

          <div class="promise-card glass-strong mb-6 rounded-2xl p-6">
            <div class="promise-icon mb-4">
              <i class="fas fa-user-graduate text-3xl text-green-500"></i>
            </div>
            <h4 class="mb-2 text-lg font-semibold text-gray-800 dark:text-gray-200">专业团队</h4>
            <p class="text-sm text-gray-600 dark:text-gray-400">
              5年以上AI开发经验的技术专家为您服务
            </p>
          </div>

          <div class="promise-card glass-strong mb-6 rounded-2xl p-6">
            <div class="promise-icon mb-4">
              <i class="fas fa-shield-alt text-3xl text-blue-500"></i>
            </div>
            <h4 class="mb-2 text-lg font-semibold text-gray-800 dark:text-gray-200">问题解决</h4>
            <p class="text-sm text-gray-600 dark:text-gray-400">95%的问题在24小时内得到完美解决</p>
          </div>

          <div class="promise-card glass-strong rounded-2xl p-6">
            <div class="promise-icon mb-4">
              <i class="fas fa-book text-3xl text-orange-500"></i>
            </div>
            <h4 class="mb-2 text-lg font-semibold text-gray-800 dark:text-gray-200">文档完善</h4>
            <p class="text-sm text-gray-600 dark:text-gray-400">
              详细的开发文档和示例代码，助您快速上手
            </p>
          </div>
        </div>
      </div>

      <!-- 常见问题 -->
      <div class="faq-section mt-12">
        <div class="mb-8 text-center">
          <h3 class="mb-4 text-2xl font-bold text-gray-800 dark:text-gray-200">常见问题</h3>
          <p class="text-gray-600 dark:text-gray-400">以下是用户最关心的问题和详细解答</p>
        </div>

        <div class="faq-grid grid gap-4 md:grid-cols-2">
          <div class="faq-item glass-light rounded-xl p-6">
            <h4 class="mb-3 font-semibold text-gray-800 dark:text-gray-200">
              🤔 如何开始使用服务？
            </h4>
            <p class="text-sm text-gray-600 dark:text-gray-400">
              注册账户 → 创建API Key → 配置您的应用 → 开始调用AI服务。整个过程只需5分钟。
            </p>
          </div>

          <div class="faq-item glass-light rounded-xl p-6">
            <h4 class="mb-3 font-semibold text-gray-800 dark:text-gray-200">
              💰 如何计算使用费用？
            </h4>
            <p class="text-sm text-gray-600 dark:text-gray-400">
              按实际使用的tokens计费，无隐藏费用。我们提供透明的价格计算器供您预估成本。
            </p>
          </div>

          <div class="faq-item glass-light rounded-xl p-6">
            <h4 class="mb-3 font-semibold text-gray-800 dark:text-gray-200">
              🔒 数据安全如何保障？
            </h4>
            <p class="text-sm text-gray-600 dark:text-gray-400">
              采用端到端加密，不存储用户数据，符合GDPR标准，确保您的隐私和数据安全。
            </p>
          </div>

          <div class="faq-item glass-light rounded-xl p-6">
            <h4 class="mb-3 font-semibold text-gray-800 dark:text-gray-200">🚀 服务稳定性如何？</h4>
            <p class="text-sm text-gray-600 dark:text-gray-400">
              99.9%的服务可用性，多地区部署，智能负载均衡，确保服务稳定可靠。
            </p>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
// 支持组件，无需额外逻辑
</script>

<style scoped>
/* 联系卡片 */
.contact-card {
  transition: transform 0.3s ease;
}

.contact-card:hover {
  transform: translateY(-2px);
}

.support-icon i {
  transition: transform 0.3s ease;
}

.contact-card:hover .support-icon i {
  transform: scale(1.1);
}

/* 联系方式列表 */
.contact-item {
  @apply flex items-start gap-4 rounded-lg p-3 transition-colors duration-300;
}

.contact-item:hover {
  background: rgba(0, 0, 0, 0.03);
}

.dark .contact-item:hover {
  background: rgba(31, 41, 55, 0.3);
}

.contact-icon {
  @apply flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg;
  background: rgba(0, 0, 0, 0.05);
  border: 1px solid rgba(0, 0, 0, 0.1);
}

.dark .contact-icon {
  background: rgba(31, 41, 55, 0.5);
  border: 1px solid rgba(75, 85, 99, 0.3);
}

.contact-info {
  @apply flex-1;
}

.contact-label {
  @apply text-sm font-medium text-gray-800 dark:text-gray-200;
}

.contact-value {
  @apply text-base font-semibold text-gray-700 dark:text-gray-300;
}

.contact-desc {
  @apply text-xs text-gray-600 dark:text-gray-400;
}

/* 服务承诺卡片 */
.promise-card {
  transition:
    transform 0.3s ease,
    box-shadow 0.3s ease;
}

.promise-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 25px rgba(0, 0, 0, 0.1);
}

.dark .promise-card:hover {
  box-shadow: 0 8px 25px rgba(0, 0, 0, 0.3);
}

.promise-icon {
  @apply flex justify-center;
}

.promise-card:hover .promise-icon i {
  transform: scale(1.1);
  transition: transform 0.3s ease;
}

/* FAQ部分 */
.faq-item {
  transition: transform 0.3s ease;
}

.faq-item:hover {
  transform: translateY(-2px);
}

/* 响应式调整 */
@media (max-width: 1024px) {
  .service-promises {
    @apply grid grid-cols-2 gap-4;
  }

  .promise-card {
    @apply p-4;
  }
}

@media (max-width: 640px) {
  .service-promises {
    @apply grid-cols-1;
  }

  .contact-card {
    @apply p-6;
  }

  .faq-grid {
    @apply grid-cols-1;
  }

  .contact-item {
    @apply flex-col gap-2 text-center;
  }

  .contact-icon {
    @apply mx-auto;
  }
}
</style>
