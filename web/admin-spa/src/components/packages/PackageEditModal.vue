<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm"
    >
      <div
        class="relative mx-4 flex max-h-[90vh] w-full max-w-4xl flex-col rounded-2xl bg-white shadow-2xl dark:bg-gray-800"
      >
        <!-- 头部 -->
        <div
          class="flex items-center justify-between border-b border-gray-200 p-6 dark:border-gray-700"
        >
          <h3 class="text-xl font-bold text-gray-900 dark:text-gray-100">
            {{ package ? '编辑套餐' : '新增套餐' }}
          </h3>
          <button
            type="button"
            @click="closeModal"
            class="p-2 text-gray-400 transition-colors hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
          >
            <i class="fas fa-times text-lg"></i>
          </button>
        </div>

        <!-- 内容区域 -->
        <div class="flex-1 overflow-y-auto">
          <form @submit.prevent="handleSubmit" class="space-y-6 p-6">
            <div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <!-- 左侧：基本信息 -->
              <div class="space-y-6">
                <div class="rounded-xl bg-gray-50 p-6 dark:bg-gray-900">
                  <h4 class="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100">
                    基本信息
                  </h4>

                  <!-- 套餐名称 -->
                  <div class="mb-4">
                    <label class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                      套餐名称 <span class="text-red-500">*</span>
                    </label>
                    <input
                      v-model="formData.name"
                      type="text"
                      required
                      class="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 focus:border-transparent focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                      placeholder="请输入套餐名称"
                    />
                  </div>

                  <!-- 显示名称 -->
                  <div class="mb-4">
                    <label class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                      显示名称
                    </label>
                    <input
                      v-model="formData.displayName"
                      type="text"
                      class="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 focus:border-transparent focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                      placeholder="留空则使用套餐名称"
                    />
                  </div>

                  <!-- 标签 -->
                  <div class="mb-4">
                    <label class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                      套餐标签
                    </label>
                    <input
                      v-model="formData.badge"
                      type="text"
                      class="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 focus:border-transparent focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                      placeholder="如：推荐、热门等"
                    />
                  </div>

                  <!-- 价格和周期 -->
                  <div class="mb-4 grid grid-cols-2 gap-4">
                    <div>
                      <label
                        class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
                      >
                        价格 <span class="text-red-500">*</span>
                      </label>
                      <input
                        v-model="formData.price"
                        type="number"
                        min="0"
                        step="0.01"
                        required
                        class="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 focus:border-transparent focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                        placeholder="0.00"
                      />
                    </div>
                    <div>
                      <label
                        class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
                      >
                        周期
                      </label>
                      <select
                        v-model="formData.period"
                        class="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 focus:border-transparent focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                      >
                        <option value="月">月</option>
                        <option value="年">年</option>
                        <option value="次">次</option>
                        <option value="永久">永久</option>
                      </select>
                    </div>
                  </div>

                  <!-- 描述 -->
                  <div class="mb-4">
                    <label class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                      套餐描述
                    </label>
                    <textarea
                      v-model="formData.description"
                      rows="3"
                      class="w-full resize-none rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 focus:border-transparent focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                      placeholder="请输入套餐描述"
                    ></textarea>
                  </div>

                  <!-- 状态选项 -->
                  <div class="flex flex-wrap gap-4">
                    <label class="flex items-center">
                      <input
                        v-model="formData.isActive"
                        type="checkbox"
                        class="mr-2 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span class="text-sm text-gray-700 dark:text-gray-300">激活状态</span>
                    </label>
                    <label class="flex items-center">
                      <input
                        v-model="formData.isPopular"
                        type="checkbox"
                        class="mr-2 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span class="text-sm text-gray-700 dark:text-gray-300">推荐套餐</span>
                    </label>
                  </div>
                </div>

                <!-- 套餐特性 -->
                <div class="rounded-xl bg-gray-50 p-6 dark:bg-gray-900">
                  <div class="mb-4 flex items-center justify-between">
                    <h4 class="text-lg font-semibold text-gray-900 dark:text-gray-100">套餐特性</h4>
                    <button
                      type="button"
                      @click="addFeature"
                      class="inline-flex items-center px-3 py-1 text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                    >
                      <i class="fas fa-plus mr-1"></i>
                      添加特性
                    </button>
                  </div>

                  <div
                    v-if="formData.features.length === 0"
                    class="py-8 text-center text-gray-500 dark:text-gray-400"
                  >
                    <i class="fas fa-list-ul mb-2 text-2xl"></i>
                    <p>暂无特性，点击"添加特性"开始配置</p>
                  </div>

                  <div v-else class="space-y-3">
                    <div
                      v-for="(feature, index) in formData.features"
                      :key="index"
                      class="relative rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800"
                    >
                      <!-- 第一行：图标、颜色选择器和删除按钮 -->
                      <div class="mb-3 flex items-center gap-3">
                        <!-- 图标选择 -->
                        <select
                          v-model="feature.icon"
                          class="w-20 rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-900 focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                        >
                          <option value="fas fa-check">✓</option>
                          <option value="fas fa-star">★</option>
                          <option value="fas fa-crown">👑</option>
                          <option value="fas fa-shield-alt">🛡️</option>
                          <option value="fas fa-infinity">∞</option>
                          <option value="fas fa-clock">🕐</option>
                          <option value="fas fa-users">👥</option>
                          <option value="fas fa-headset">🎧</option>
                        </select>

                        <!-- 颜色选择 -->
                        <select
                          v-model="feature.color"
                          class="w-20 rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-900 focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                        >
                          <option value="green-500">绿色</option>
                          <option value="blue-500">蓝色</option>
                          <option value="purple-500">紫色</option>
                          <option value="yellow-500">黄色</option>
                          <option value="red-500">红色</option>
                          <option value="gray-500">灰色</option>
                        </select>

                        <!-- 预览图标 -->
                        <div class="flex-1 text-sm text-gray-500 dark:text-gray-400">
                          <i :class="[feature.icon, `text-${feature.color}`]"></i>
                          特性预览
                        </div>

                        <!-- 删除按钮 -->
                        <button
                          type="button"
                          @click="removeFeature(index)"
                          class="p-1 text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                          title="删除特性"
                        >
                          <i class="fas fa-trash text-xs"></i>
                        </button>
                      </div>

                      <!-- 第二行：特性文本输入框 -->
                      <input
                        v-model="feature.text"
                        type="text"
                        placeholder="请输入特性描述，如：Claude Sonnet 模型、不限使用次数等"
                        class="w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-transparent focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <!-- 右侧：二维码配置 -->
              <div class="space-y-6">
                <div class="rounded-xl bg-gray-50 p-6 dark:bg-gray-900">
                  <h4 class="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100">
                    二维码配置
                  </h4>

                  <!-- 二维码上传 -->
                  <QRCodeUpload
                    :current-url="formData.modalConfig.qrcodeUrl"
                    category="wechat"
                    @update="handleQRCodeUpdate"
                  />

                  <!-- 分割线 -->
                  <div class="my-6 flex items-center">
                    <div class="h-px flex-1 bg-gray-200 dark:bg-gray-700"></div>
                    <span class="px-3 text-sm text-gray-500 dark:text-gray-400"
                      >或从已上传的图片中选择</span
                    >
                    <div class="h-px flex-1 bg-gray-200 dark:bg-gray-700"></div>
                  </div>

                  <!-- 图片选择器 -->
                  <ImageSelector
                    :selected-image="formData.modalConfig.qrcodeUrl"
                    @select="handleQRCodeUpdate"
                  />

                  <!-- 弹窗标题 -->
                  <div class="mb-4 mt-6">
                    <label class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                      弹窗标题
                    </label>
                    <input
                      v-model="formData.modalConfig.title"
                      type="text"
                      class="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 focus:border-transparent focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                      placeholder="请输入弹窗标题"
                    />
                  </div>

                  <!-- 二维码描述 -->
                  <div class="mb-4">
                    <label class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                      二维码描述
                    </label>
                    <input
                      v-model="formData.modalConfig.qrcodeAlt"
                      type="text"
                      class="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 focus:border-transparent focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                      placeholder="二维码"
                    />
                  </div>

                  <!-- 提示文字 -->
                  <div class="mb-4">
                    <label class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                      提示文字
                    </label>
                    <input
                      v-model="formData.modalConfig.tipText"
                      type="text"
                      class="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 focus:border-transparent focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                      placeholder="扫一扫上面的二维码图案，加我为朋友。"
                    />
                  </div>

                  <!-- 联系人名称 -->
                  <div class="mb-4">
                    <label class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                      联系人名称
                    </label>
                    <input
                      v-model="formData.modalConfig.contactPerson"
                      type="text"
                      class="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 focus:border-transparent focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                      placeholder="联系客服"
                    />
                  </div>

                  <!-- 工作时间 -->
                  <div class="mb-4">
                    <label class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                      工作时间
                      <span class="ml-1 text-xs text-gray-500 dark:text-gray-400">(可选)</span>
                    </label>
                    <div class="flex items-center gap-2">
                      <el-time-picker
                        v-model="workStartTime"
                        format="HH:mm"
                        value-format="HH:mm"
                        placeholder="开始时间"
                        class="flex-1"
                        size="default"
                      />
                      <span class="text-sm text-gray-500 dark:text-gray-400">至</span>
                      <el-time-picker
                        v-model="workEndTime"
                        format="HH:mm"
                        value-format="HH:mm"
                        placeholder="结束时间"
                        class="flex-1"
                        size="default"
                      />
                    </div>
                  </div>

                  <!-- 其他说明 -->
                  <div class="mb-4">
                    <label class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                      其他说明
                      <span class="ml-1 text-xs text-gray-500 dark:text-gray-400"
                        >(可选，每行一条)</span
                      >
                    </label>
                    <textarea
                      v-model="otherInfo"
                      rows="2"
                      class="w-full resize-none rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 focus:border-transparent focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                      placeholder="如：添加好友后请说明所需套餐&#10;支持24小时客服等"
                    ></textarea>
                  </div>
                </div>

                <!-- 预览区域 -->
                <div
                  v-if="formData.modalConfig.qrcodeUrl"
                  class="rounded-xl bg-gray-50 p-6 dark:bg-gray-900"
                >
                  <h4 class="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100">
                    预览效果
                  </h4>
                  <div
                    class="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800"
                  >
                    <div class="text-center">
                      <h5 class="mb-2 text-lg font-bold text-gray-900 dark:text-gray-100">
                        {{ formData.modalConfig.title }}
                      </h5>
                      <img
                        :src="formData.modalConfig.qrcodeUrl"
                        :alt="formData.modalConfig.qrcodeAlt"
                        class="mx-auto mb-3 h-32 w-32 rounded-lg object-cover"
                      />
                      <p class="mb-3 text-sm text-gray-600 dark:text-gray-400">
                        {{ formData.modalConfig.tipText }}
                      </p>
                      <div class="space-y-1 text-xs text-gray-500 dark:text-gray-500">
                        <div v-for="info in formData.modalConfig.extraInfo" :key="info">
                          {{ info }}
                        </div>
                        <div class="font-medium">{{ formData.modalConfig.contactPerson }}</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </form>
        </div>

        <!-- 底部操作栏 -->
        <div
          class="flex items-center justify-end gap-3 border-t border-gray-200 p-6 dark:border-gray-700"
        >
          <button
            type="button"
            @click="closeModal"
            class="rounded-lg bg-gray-100 px-6 py-2 text-gray-700 transition-colors hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
          >
            取消
          </button>
          <button
            type="button"
            @click="handleSubmit"
            :disabled="!isFormValid || loading"
            :class="[
              'rounded-lg px-6 py-2 font-medium transition-colors',
              isFormValid && !loading
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'cursor-not-allowed bg-gray-300 text-gray-500 dark:bg-gray-600 dark:text-gray-400'
            ]"
          >
            <i v-if="loading" class="fas fa-spinner mr-2 animate-spin"></i>
            {{ package ? '更新套餐' : '创建套餐' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import QRCodeUpload from './QRCodeUpload.vue'
import ImageSelector from './ImageSelector.vue'

// Props
const props = defineProps({
  visible: {
    type: Boolean,
    default: false
  },
  package: {
    type: Object,
    default: () => null
  }
})

// Emits
const emit = defineEmits(['update:visible', 'save'])

// 数据状态
const loading = ref(false)
const workStartTime = ref('')
const workEndTime = ref('')
const otherInfo = ref('')

// 表单数据
const formData = ref({
  name: '',
  displayName: '',
  badge: '',
  price: 0,
  period: '月',
  description: '',
  features: [],
  modalConfig: {
    title: '',
    qrcodeUrl: '',
    qrcodeAlt: '二维码',
    tipText: '扫一扫上面的二维码图案，加我为朋友。',
    extraInfo: [],
    contactPerson: '联系客服'
  },
  isActive: true,
  isPopular: false
})

// 计算属性
const isFormValid = computed(() => {
  const { name, price, period, modalConfig } = formData.value

  // 基础验证
  if (!name || !name.trim()) return false

  // 价格验证
  const priceNum = Number(price)
  if (isNaN(priceNum) || priceNum < 0) return false

  // 周期验证
  const validPeriods = ['月', '年', '次', '永久']
  if (!validPeriods.includes(period)) return false

  // 弹窗配置验证：如果有二维码，必须有标题
  if (modalConfig.qrcodeUrl && !modalConfig.title?.trim()) return false

  return true
})

// 监听器
watch(
  () => props.visible,
  (newVal) => {
    if (newVal) {
      resetForm()
      if (props.package) {
        loadPackageData()
      }
    }
  }
)

// 监听工作时间和其他信息的变化，合并到 extraInfo
watch(
  [workStartTime, workEndTime, otherInfo],
  ([startTime, endTime, other]) => {
    const extraInfo = []

    // 添加工作时间
    if (startTime && endTime) {
      extraInfo.push(`工作时间：${startTime}-${endTime}`)
    }

    // 添加其他信息
    if (other) {
      const lines = other.split('\n').filter((line) => line.trim())
      extraInfo.push(...lines)
    }

    formData.value.modalConfig.extraInfo = extraInfo
  },
  { deep: true }
)

// 生命周期
onMounted(() => {
  if (props.visible && props.package) {
    loadPackageData()
  }
})

// 方法
function resetForm() {
  formData.value = {
    name: '',
    displayName: '',
    badge: '',
    price: 0,
    period: '月',
    description: '',
    features: [],
    modalConfig: {
      title: '',
      qrcodeUrl: '',
      qrcodeAlt: '二维码',
      tipText: '扫一扫上面的二维码图案，加我为朋友。',
      extraInfo: [],
      contactPerson: '联系客服'
    },
    isActive: true,
    isPopular: false
  }
  workStartTime.value = ''
  workEndTime.value = ''
  otherInfo.value = ''
}

function loadPackageData() {
  if (!props.package) return

  formData.value = {
    name: props.package.name || '',
    displayName: props.package.displayName || '',
    badge: props.package.badge || '',
    price: props.package.price || 0,
    period: props.package.period || '月',
    description: props.package.description || '',
    features: Array.isArray(props.package.features) ? [...props.package.features] : [],
    modalConfig: {
      title: props.package.modalConfig?.title || props.package.name || '',
      qrcodeUrl: props.package.modalConfig?.qrcodeUrl || '',
      qrcodeAlt: props.package.modalConfig?.qrcodeAlt || '二维码',
      tipText: props.package.modalConfig?.tipText || '扫一扫上面的二维码图案，加我为朋友。',
      extraInfo: Array.isArray(props.package.modalConfig?.extraInfo)
        ? [...props.package.modalConfig.extraInfo]
        : [],
      contactPerson: props.package.modalConfig?.contactPerson || '联系客服'
    },
    isActive: props.package.isActive !== false,
    isPopular: props.package.isPopular === true
  }

  // 解析工作时间和其他信息
  const extraInfo = formData.value.modalConfig.extraInfo || []
  let workTimeFound = false
  const otherLines = []

  extraInfo.forEach((line) => {
    if (line.startsWith('工作时间：') && !workTimeFound) {
      // 解析工作时间格式：工作时间：09:00-22:00
      const timeRange = line.replace('工作时间：', '')
      const [start, end] = timeRange.split('-')
      if (start && end) {
        workStartTime.value = start.trim()
        workEndTime.value = end.trim()
        workTimeFound = true
      }
    } else {
      otherLines.push(line)
    }
  })

  otherInfo.value = otherLines.join('\n')
}

function addFeature() {
  formData.value.features.push({
    icon: 'fas fa-check',
    color: 'green-500',
    text: ''
  })
}

function removeFeature(index) {
  formData.value.features.splice(index, 1)
}

function handleQRCodeUpdate(qrcodeUrl) {
  formData.value.modalConfig.qrcodeUrl = qrcodeUrl
}

async function handleSubmit() {
  if (!isFormValid.value || loading.value) return

  try {
    loading.value = true

    // 过滤空的特性
    const validFeatures = formData.value.features.filter((feature) => feature.text.trim())

    const packageData = {
      ...formData.value,
      features: validFeatures
    }

    emit('save', packageData)
  } catch (error) {
    console.error('Submit error:', error)
    ElMessage.error('保存失败')
  } finally {
    loading.value = false
  }
}

function closeModal() {
  emit('update:visible', false)
}
</script>

<style scoped>
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

/* 模态框动画 */
.fixed {
  animation: modalFadeIn 0.2s ease-out;
}

.relative {
  animation: modalSlideIn 0.2s ease-out;
}

@keyframes modalFadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes modalSlideIn {
  from {
    opacity: 0;
    transform: translateY(-20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
