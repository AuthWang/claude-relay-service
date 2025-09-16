<template>
  <section class="code-demo-section mb-8 md:mb-12">
    <div class="glass-strong p-6 shadow-xl md:p-8 lg:p-12">
      <div class="mx-auto max-w-6xl">
        <!-- 标题 -->
        <div class="mb-8 text-center">
          <h2 class="mb-4 text-3xl font-bold text-gray-800 dark:text-gray-200 md:text-4xl">
            🐍 Python AI 助手演示
          </h2>
        </div>

        <div class="grid gap-8 lg:grid-cols-2">
          <!-- 代码演示区域 -->
          <div class="code-demo-container">
            <div class="code-window h-96 rounded-lg bg-gray-900 p-4 shadow-lg">
              <!-- 窗口标题栏 -->
              <div class="mb-3 flex items-center gap-2">
                <div class="h-3 w-3 rounded-full bg-red-500"></div>
                <div class="h-3 w-3 rounded-full bg-yellow-500"></div>
                <div class="h-3 w-3 rounded-full bg-green-500"></div>
                <span class="ml-2 text-sm text-gray-400">Python AI Demo</span>
              </div>

              <!-- 代码内容 -->
              <div id="code-lines" class="code-content font-mono text-sm">
                <!-- 代码行将通过JavaScript动态添加 -->
                <span class="typing-cursor">|</span>
              </div>
            </div>
          </div>

          <!-- 结果展示区域 -->
          <div class="result-container">
            <div class="result-card rounded-lg border border-green-500/30 bg-green-500/10 p-6">
              <div class="mb-4 flex items-center gap-2">
                <i class="fas fa-check-circle text-2xl text-green-500"></i>
                <h3 class="text-lg font-semibold text-green-700 dark:text-green-400">
                  ✨ Python AI 助手就绪！
                </h3>
              </div>

              <div class="result-stats grid grid-cols-2 gap-4">
                <div class="stat-item text-center">
                  <div class="text-2xl font-bold text-green-600 dark:text-green-400">异步</div>
                  <div class="text-sm text-gray-600 dark:text-gray-400">高并发</div>
                </div>
                <div class="stat-item text-center">
                  <div class="text-2xl font-bold text-blue-600 dark:text-blue-400">类型</div>
                  <div class="text-sm text-gray-600 dark:text-gray-400">安全性</div>
                </div>
              </div>

              <!-- 进度动画 -->
              <div class="mt-4">
                <div class="progress-bar h-2 w-full rounded-full bg-gray-200 dark:bg-gray-700">
                  <div
                    class="progress-fill h-full rounded-full bg-gradient-to-r from-green-500 to-blue-500"
                  ></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { onMounted, onUnmounted } from 'vue'

// Python代码行数据
const codeLines = [
  {
    content: '<span class="text-purple-400">class</span> <span class="text-blue-400">ClaudeAssistant</span><span class="text-white">:</span>',
    indent: 0
  },
  {
    content: '<span class="text-purple-400">def</span> <span class="text-blue-400">__init__</span><span class="text-white">(</span><span class="text-cyan-400">self</span><span class="text-white">, </span><span class="text-green-400">api_key</span><span class="text-white">: </span><span class="text-yellow-400">str</span><span class="text-white">):</span>',
    indent: 4
  },
  {
    content: '<span class="text-cyan-400">self</span><span class="text-white">.</span><span class="text-green-400">api_key</span><span class="text-white"> = </span><span class="text-green-400">api_key</span>',
    indent: 8
  },
  {
    content: '<span class="text-cyan-400">self</span><span class="text-white">.</span><span class="text-green-400">base_url</span><span class="text-white"> = </span><span class="text-orange-400">\'/api/v1/messages\'</span>',
    indent: 8
  },
  {
    content: '',
    indent: 0
  },
  {
    content: '<span class="text-purple-400">async def</span> <span class="text-blue-400">chat</span><span class="text-white">(</span><span class="text-cyan-400">self</span><span class="text-white">, </span><span class="text-green-400">message</span><span class="text-white">: </span><span class="text-yellow-400">str</span><span class="text-white">):</span>',
    indent: 4
  },
  {
    content: '<span class="text-green-400">response</span><span class="text-white"> = </span><span class="text-purple-400">await</span><span class="text-white"> </span><span class="text-cyan-400">self</span><span class="text-white">.</span><span class="text-blue-400">call_api</span><span class="text-white">({</span>',
    indent: 8
  },
  {
    content: '<span class="text-orange-400">\'model\'</span><span class="text-white">: </span><span class="text-orange-400">\'claude-sonnet-4\'</span><span class="text-white">,</span>',
    indent: 12
  },
  {
    content: '<span class="text-orange-400">\'messages\'</span><span class="text-white">: [{</span><span class="text-orange-400">\'content\'</span><span class="text-white">: </span><span class="text-green-400">message</span><span class="text-white">}]</span>',
    indent: 12
  },
  {
    content: '<span class="text-white">})</span>',
    indent: 8
  },
  {
    content: '<span class="text-purple-400">return</span><span class="text-white"> </span><span class="text-green-400">response</span><span class="text-white">.</span><span class="text-blue-400">get</span><span class="text-white">(</span><span class="text-orange-400">\'content\'</span><span class="text-white">)</span>',
    indent: 8
  }
]

let currentLineIndex = 0
let typingTimer = null

onMounted(() => {
  // 启动打字机动画
  startTypewriterEffect()

  // 启动进度条动画
  setTimeout(() => {
    const progressFill = document.querySelector('.progress-fill')
    if (progressFill) {
      progressFill.style.width = '85%'
    }
  }, codeLines.length * 600 + 1000) // 根据代码行数调整时间
})

const startTypewriterEffect = () => {
  const cursor = document.querySelector('.typing-cursor')
  const codeContainer = document.getElementById('code-lines')

  if (!codeContainer || !cursor) return

  // 启动光标闪烁
  setInterval(() => {
    cursor.style.opacity = cursor.style.opacity === '0' ? '1' : '0'
  }, 500)

  // 开始逐行添加代码
  typingTimer = setInterval(() => {
    if (currentLineIndex < codeLines.length) {
      const line = codeLines[currentLineIndex]
      const lineElement = document.createElement('div')
      lineElement.className = 'mb-2'

      // 添加缩进
      if (line.indent > 0) {
        lineElement.style.marginLeft = `${line.indent * 0.25}rem` // 每4个空格 = 1rem
      }

      lineElement.innerHTML = line.content

      // 在光标前插入新行
      codeContainer.insertBefore(lineElement, cursor)
      currentLineIndex++
    } else {
      // 所有代码行都已添加，停止定时器
      clearInterval(typingTimer)
    }
  }, 600) // 每600ms添加一行
}

onUnmounted(() => {
  // 清理定时器
  if (typingTimer) {
    clearInterval(typingTimer)
  }
})
</script>

<style scoped>
.code-demo-section {
  position: relative;
}

/* 代码窗口样式 */
.code-window {
  background: #1a1a2e;
  border: 1px solid #333;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
}

/* 打字机光标 */
.typing-cursor {
  @apply text-white;
  animation: blink 1s infinite;
}

@keyframes blink {
  0%,
  50% {
    opacity: 1;
  }
  51%,
  100% {
    opacity: 0;
  }
}

/* 进度条动画 */
.progress-fill {
  width: 0%;
  transition: width 2s ease-out;
  animation: shimmer 2s ease-in-out infinite;
}

@keyframes shimmer {
  0% {
    background-position: -200% center;
  }
  100% {
    background-position: 200% center;
  }
}

/* 结果卡片动画 */
.result-card {
  animation: slideInRight 1s ease-out 0.5s both;
}

@keyframes slideInRight {
  from {
    opacity: 0;
    transform: translateX(30px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

/* 代码容器动画 */
.code-demo-container {
  animation: slideInLeft 1s ease-out both;
}

@keyframes slideInLeft {
  from {
    opacity: 0;
    transform: translateX(-30px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

/* 统计项目悬停效果 */
.stat-item {
  transition: transform 0.3s ease;
}

.stat-item:hover {
  transform: scale(1.05);
}

/* 响应式调整 */
@media (max-width: 1024px) {
  .code-content {
    @apply text-xs;
  }
}

@media (max-width: 640px) {
  .code-content {
    @apply text-xs;
  }

  .result-stats {
    @apply grid-cols-1 gap-2;
  }
}
</style>
