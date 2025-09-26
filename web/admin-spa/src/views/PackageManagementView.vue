<template>
  <div class="package-management">
    <!-- 页面标题 -->
    <div class="mb-6">
      <h2 class="mb-2 text-2xl font-bold text-gray-900 dark:text-gray-100">套餐管理</h2>
      <p class="text-gray-600 dark:text-gray-400">管理首页展示的套餐信息和二维码</p>
    </div>

    <!-- 工具栏 -->
    <div class="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div class="flex flex-wrap gap-2 sm:gap-3">
        <button
          @click="showCreateModal"
          class="flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-blue-700 sm:gap-2 sm:px-4 sm:text-sm"
        >
          <i class="fas fa-plus"></i>
          <span class="hidden sm:inline">新增套餐</span>
          <span class="sm:hidden">新增</span>
        </button>

        <button
          @click="toggleReorderMode"
          :class="[
            'flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-medium transition-colors sm:gap-2 sm:px-4 sm:text-sm',
            reorderMode
              ? 'bg-orange-600 text-white hover:bg-orange-700'
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600'
          ]"
        >
          <i :class="reorderMode ? 'fas fa-check' : 'fas fa-sort'"></i>
          <span class="hidden sm:inline">{{ reorderMode ? '完成排序' : '排序模式' }}</span>
          <span class="sm:hidden">{{ reorderMode ? '完成' : '排序' }}</span>
        </button>

        <button
          @click="loadPackages"
          class="flex items-center gap-1 rounded-lg bg-gray-200 px-3 py-2 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600 sm:gap-2 sm:px-4 sm:text-sm"
        >
          <i class="fas fa-sync"></i>
          <span class="hidden sm:inline">刷新</span>
        </button>

        <button
          @click="resetToDefaults"
          class="flex items-center gap-1 rounded-lg bg-red-600 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-red-700 sm:gap-2 sm:px-4 sm:text-sm"
        >
          <i class="fas fa-redo"></i>
          <span class="hidden sm:inline">重置为默认</span>
          <span class="sm:hidden">重置</span>
        </button>
      </div>

      <div class="flex items-center gap-2">
        <label class="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
          <input
            v-model="showInactive"
            type="checkbox"
            class="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          显示未激活套餐
        </label>
      </div>
    </div>

    <!-- 加载状态 -->
    <div v-if="loading" class="flex items-center justify-center py-12">
      <div class="flex items-center gap-3 text-gray-600 dark:text-gray-400">
        <i class="fas fa-spinner animate-spin"></i>
        <span>加载套餐数据...</span>
      </div>
    </div>

    <!-- 套餐列表 -->
    <div v-else-if="packages.length > 0">
      <!-- 拖拽排序模式 -->
      <draggable
        v-if="reorderMode"
        v-model="sortablePackages"
        @change="handleDragChange"
        class="grid gap-6 lg:grid-cols-2 xl:grid-cols-3"
        ghost-class="dragging-ghost"
        chosen-class="dragging-chosen"
        drag-class="dragging-item"
        handle=".drag-handle"
        :animation="200"
        item-key="id"
      >
        <template #item="{ element: pkg }">
          <div
            :class="[
              'package-card group relative rounded-xl border-2 border-gray-200 bg-white p-6 shadow-sm transition-all duration-200 dark:border-gray-700 dark:bg-gray-800',
              'cursor-move hover:border-blue-400 hover:shadow-md',
              pkg.isPopular ? 'border-gradient-to-r from-purple-400 to-pink-400' : ''
            ]"
          >
            <!-- 拖拽图标 -->
            <div class="drag-handle absolute left-2 top-2 opacity-60 group-hover:opacity-100 cursor-move z-10">
              <i class="fas fa-grip-vertical text-blue-500 text-lg"></i>
            </div>

            <!-- 推荐标签 -->
            <div
              v-if="pkg.isPopular"
              class="absolute -right-1 -top-1 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 px-3 py-1 text-xs font-bold text-white shadow-lg"
            >
              <i class="fas fa-star mr-1"></i>推荐
            </div>

            <!-- 套餐内容 -->
            <div class="ml-6">
              <!-- 头部信息 -->
              <div class="mb-4">
                <div class="mb-2 flex items-start justify-between">
                  <div>
                    <span
                      v-if="pkg.badge"
                      class="inline-block rounded-full bg-blue-100 px-2 py-1 text-xs font-semibold text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                    >
                      {{ pkg.badge }}
                    </span>
                    <h3 class="mt-1 text-lg font-bold text-gray-900 dark:text-gray-100">
                      {{ pkg.displayName || pkg.name }}
                    </h3>
                  </div>
                  <div class="flex items-center gap-2">
                    <!-- 激活状态 -->
                    <span
                      :class="[
                        'inline-flex h-2 w-2 rounded-full',
                        pkg.isActive ? 'bg-green-500' : 'bg-red-500'
                      ]"
                    ></span>
                  </div>
                </div>

                <!-- 价格信息 -->
                <div class="flex items-baseline gap-2">
                  <span class="text-2xl font-bold text-orange-500">{{ pkg.price === 0 ? '免费' : `¥${pkg.price}` }}</span>
                  <span class="text-sm text-gray-500 dark:text-gray-400">{{ pkg.period }}</span>
                </div>
              </div>

              <!-- 套餐特性 -->
              <div class="mb-4">
                <h4 class="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300">套餐特性</h4>
                <ul class="space-y-1">
                  <li
                    v-for="feature in pkg.features.slice(0, 3)"
                    :key="feature.text"
                    class="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-400"
                  >
                    <i :class="[feature.icon, `text-${feature.color}`, 'mt-0.5 flex-shrink-0']"></i>
                    <span>{{ feature.text }}</span>
                  </li>
                  <li v-if="pkg.features.length > 3" class="text-xs text-gray-500 dark:text-gray-500">
                    +{{ pkg.features.length - 3 }} 项更多特性
                  </li>
                </ul>
              </div>

              <!-- 二维码状态 -->
              <div class="flex items-center justify-between text-xs text-gray-500 dark:text-gray-500">
                <span>排序: {{ pkg.sortOrder }}</span>
                <span class="flex items-center gap-1">
                  <i
                    :class="[
                      'fas',
                      pkg.modalConfig?.qrcodeUrl
                        ? 'fa-qrcode text-green-500'
                        : 'fa-exclamation-triangle text-orange-500'
                    ]"
                  ></i>
                  {{ pkg.modalConfig?.qrcodeUrl ? '已配置二维码' : '未配置二维码' }}
                </span>
              </div>
            </div>
          </div>
        </template>
      </draggable>

      <!-- 普通显示模式 -->
      <div v-else class="grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
        <div
          v-for="(pkg, index) in filteredPackages"
          :key="pkg.id"
          :class="[
            'package-card group relative rounded-xl border-2 border-gray-200 bg-white p-6 shadow-sm transition-all duration-200 dark:border-gray-700 dark:bg-gray-800',
            'hover:border-blue-300 hover:shadow-lg',
            pkg.isPopular ? 'border-gradient-to-r from-purple-400 to-pink-400' : ''
          ]"
        >
          <!-- 推荐标签 -->
          <div
            v-if="pkg.isPopular"
            class="absolute -right-1 -top-1 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 px-3 py-1 text-xs font-bold text-white shadow-lg"
          >
            <i class="fas fa-star mr-1"></i>推荐
          </div>

          <!-- 套餐内容 -->
          <div>
            <!-- 头部信息 -->
            <div class="mb-4">
              <div class="mb-2 flex items-start justify-between">
                <div>
                  <span
                    v-if="pkg.badge"
                    class="inline-block rounded-full bg-blue-100 px-2 py-1 text-xs font-semibold text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                  >
                    {{ pkg.badge }}
                  </span>
                  <h3 class="mt-1 text-lg font-bold text-gray-900 dark:text-gray-100">
                    {{ pkg.displayName || pkg.name }}
                  </h3>
                </div>
                <div class="flex items-center gap-2">
                  <!-- 激活状态 -->
                  <span
                    :class="[
                      'inline-flex h-2 w-2 rounded-full',
                      pkg.isActive ? 'bg-green-500' : 'bg-red-500'
                    ]"
                  ></span>
                  <!-- 操作按钮 -->
                  <div class="opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      @click="editPackage(pkg)"
                      class="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-700 dark:hover:text-gray-300"
                      title="编辑"
                    >
                      <i class="fas fa-edit text-sm"></i>
                    </button>
                    <button
                      @click="previewPackage(pkg)"
                      class="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-700 dark:hover:text-gray-300"
                      title="预览"
                    >
                      <i class="fas fa-eye text-sm"></i>
                    </button>
                    <button
                      @click="togglePackageStatus(pkg)"
                      :class="[
                        'rounded p-1 text-sm',
                        pkg.isActive
                          ? 'text-orange-500 hover:bg-orange-50 hover:text-orange-700 dark:hover:bg-orange-900'
                          : 'text-green-500 hover:bg-green-50 hover:text-green-700 dark:hover:bg-green-900'
                      ]"
                      :title="pkg.isActive ? '停用' : '激活'"
                    >
                      <i :class="pkg.isActive ? 'fas fa-pause' : 'fas fa-play'"></i>
                    </button>
                    <button
                      @click="deletePackage(pkg)"
                      class="rounded p-1 text-sm text-red-500 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-900"
                      title="删除"
                    >
                      <i class="fas fa-trash"></i>
                    </button>
                  </div>
                </div>
              </div>

              <!-- 价格信息 -->
              <div class="flex items-baseline gap-2">
                <span class="text-2xl font-bold text-orange-500">{{ pkg.price === 0 ? '免费' : `¥${pkg.price}` }}</span>
                <span class="text-sm text-gray-500 dark:text-gray-400">{{ pkg.period }}</span>
              </div>
            </div>

            <!-- 套餐特性 -->
            <div class="mb-4">
              <h4 class="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300">套餐特性</h4>
              <ul class="space-y-1">
                <li
                  v-for="feature in pkg.features.slice(0, 3)"
                  :key="feature.text"
                  class="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-400"
                >
                  <i :class="[feature.icon, `text-${feature.color}`, 'mt-0.5 flex-shrink-0']"></i>
                  <span>{{ feature.text }}</span>
                </li>
                <li v-if="pkg.features.length > 3" class="text-xs text-gray-500 dark:text-gray-500">
                  +{{ pkg.features.length - 3 }} 项更多特性
                </li>
              </ul>
            </div>

            <!-- 二维码状态 -->
            <div class="flex items-center justify-between text-xs text-gray-500 dark:text-gray-500">
              <span>排序: {{ pkg.sortOrder }}</span>
              <span class="flex items-center gap-1">
                <i
                  :class="[
                    'fas',
                    pkg.modalConfig?.qrcodeUrl
                      ? 'fa-qrcode text-green-500'
                      : 'fa-exclamation-triangle text-orange-500'
                  ]"
                ></i>
                {{ pkg.modalConfig?.qrcodeUrl ? '已配置二维码' : '未配置二维码' }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 空状态 -->
    <div v-else class="flex flex-col items-center justify-center py-12">
      <div class="text-center">
        <i class="fas fa-box-open mb-4 text-4xl text-gray-300 dark:text-gray-600"></i>
        <h3 class="mb-2 text-lg font-medium text-gray-900 dark:text-gray-100">暂无套餐</h3>
        <p class="mb-4 text-gray-500 dark:text-gray-400">开始创建您的第一个套餐吧</p>
        <button
          @click="showCreateModal"
          class="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          <i class="fas fa-plus"></i>
          新增套餐
        </button>
      </div>
    </div>

    <!-- 套餐编辑模态框 -->
    <PackageEditModal
      v-model:visible="editModalVisible"
      :package="currentPackage"
      @save="handleSavePackage"
    />

    <!-- 预览模态框 -->
    <PackageModal v-model:visible="previewModalVisible" :package="previewPackageData" />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import api from '@/config/api'
import draggable from 'vuedraggable'
import PackageEditModal from '@/components/packages/PackageEditModal.vue'
import PackageModal from '@/components/packages/PackageModal.vue'

// 数据状态
const loading = ref(false)
const packages = ref([])
const showInactive = ref(false)
const reorderMode = ref(false)

// 拖拽相关
const dragStartIndex = ref(null)
const sortablePackages = ref([])

// 模态框状态
const editModalVisible = ref(false)
const previewModalVisible = ref(false)
const currentPackage = ref(null)
const previewPackageData = ref(null)


// 计算属性
const filteredPackages = computed(() => {
  return packages.value.filter((pkg) => showInactive.value || pkg.isActive)
})

// 生命周期
onMounted(() => {
  loadPackages()
})

// 监听器
watch(showInactive, () => {
  loadPackages()
})

// 方法
async function loadPackages() {
  try {
    loading.value = true
    const response = await api.get('/admin/packages', {
      params: { includeInactive: showInactive.value }
    })
    packages.value = response.data || []
  } catch (error) {
    console.error('Failed to load packages:', error)
    ElMessage.error('加载套餐失败')
  } finally {
    loading.value = false
  }
}

function showCreateModal() {
  currentPackage.value = null
  editModalVisible.value = true
}

function editPackage(pkg) {
  currentPackage.value = { ...pkg }
  editModalVisible.value = true
}

function previewPackage(pkg) {
  previewPackageData.value = pkg
  previewModalVisible.value = true
}

async function togglePackageStatus(pkg) {
  try {
    const action = pkg.isActive ? '停用' : '激活'
    await ElMessageBox.confirm(`确定要${action}套餐"${pkg.name}"吗？`, '确认操作', {
      type: 'warning'
    })

    await api.put(`/admin/packages/${pkg.id}`, {
      isActive: !pkg.isActive
    })

    ElMessage.success(`套餐${action}成功`)
    await loadPackages()
  } catch (error) {
    if (error !== 'cancel') {
      console.error('Failed to toggle package status:', error)
      ElMessage.error('操作失败')
    }
  }
}

async function deletePackage(pkg) {
  try {
    await ElMessageBox.confirm(`确定要删除套餐"${pkg.name}"吗？此操作不可恢复。`, '确认删除', {
      type: 'error',
      confirmButtonText: '删除',
      confirmButtonClass: 'el-button--danger'
    })

    await api.delete(`/admin/packages/${pkg.id}`)
    ElMessage.success('套餐删除成功')
    await loadPackages()
  } catch (error) {
    if (error !== 'cancel') {
      console.error('Failed to delete package:', error)
      ElMessage.error('删除失败')
    }
  }
}

async function handleSavePackage(packageData) {
  try {
    if (currentPackage.value) {
      // 更新套餐
      await api.put(`/admin/packages/${currentPackage.value.id}`, packageData)
      ElMessage.success('套餐更新成功')
    } else {
      // 创建套餐
      await api.post('/admin/packages', packageData)
      ElMessage.success('套餐创建成功')
    }

    editModalVisible.value = false
    await loadPackages()
  } catch (error) {
    console.error('Failed to save package:', error)
    ElMessage.error('保存失败')
  }
}

function toggleReorderMode() {
  if (reorderMode.value) {
    // 退出排序模式时保存排序
    saveOrder()
  } else {
    // 进入排序模式时更新可排序列表
    sortablePackages.value = [...filteredPackages.value]
  }
  reorderMode.value = !reorderMode.value
}

// 处理 VueDraggableNext 的拖拽变化事件
async function handleDragChange(evt) {
  if (evt.moved) {
    // 实时保存排序
    await saveOrderFromSortable()
  }
}

// 从可排序列表保存排序
async function saveOrderFromSortable() {
  try {
    const orderList = sortablePackages.value.map((pkg, index) => ({
      id: pkg.id,
      sortOrder: index + 1
    }))

    await api.put('/admin/packages/reorder', { orderList })
    await loadPackages()
    ElMessage.success('排序更新成功')
  } catch (error) {
    console.error('Failed to reorder packages:', error)
    ElMessage.error('排序保存失败')
    // 失败时恢复原来的顺序
    sortablePackages.value = [...filteredPackages.value]
  }
}

async function saveOrder() {
  try {
    const orderList = sortablePackages.value.map((pkg, index) => ({
      id: pkg.id,
      sortOrder: index + 1
    }))

    await api.put('/admin/packages/reorder', { orderList })
    ElMessage.success('排序保存成功')
  } catch (error) {
    console.error('Failed to save order:', error)
    ElMessage.error('排序保存失败')
  }
}

async function resetToDefaults() {
  try {
    await ElMessageBox.confirm(
      '确定要将所有套餐重置为默认配置吗？此操作将删除现有套餐并创建新的默认套餐，且不可恢复。',
      '确认重置',
      {
        type: 'warning',
        confirmButtonText: '重置',
        confirmButtonClass: 'el-button--danger',
        dangerouslyUseHTMLString: false
      }
    )

    loading.value = true
    await api.post('/admin/packages/reset-defaults')
    ElMessage.success('套餐已重置为默认配置')
    await loadPackages()
  } catch (error) {
    if (error !== 'cancel') {
      console.error('Failed to reset packages:', error)
      ElMessage.error('重置套餐失败')
    }
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.package-card {
  transition: all 0.2s ease;
}

.package-card:hover {
  transform: translateY(-2px);
}

.border-gradient-to-r {
  background:
    linear-gradient(white, white) padding-box,
    linear-gradient(135deg, theme('colors.purple.400'), theme('colors.pink.400')) border-box;
}

.dark .border-gradient-to-r {
  background:
    linear-gradient(theme('colors.gray.800'), theme('colors.gray.800')) padding-box,
    linear-gradient(135deg, theme('colors.purple.400'), theme('colors.pink.400')) border-box;
}

/* 拖拽相关样式 */
.package-card[draggable='true'] {
  cursor: move;
}

.package-card[draggable='true']:hover {
  border-color: theme('colors.blue.400');
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.15);
}

/* VueDraggableNext 样式 */
.dragging-ghost {
  opacity: 0.5;
  background: theme('colors.blue.50');
  border-color: theme('colors.blue.300');
  transform: rotate(3deg);
}

.dark .dragging-ghost {
  background: theme('colors.blue.900');
  border-color: theme('colors.blue.600');
}

.dragging-chosen {
  cursor: grabbing !important;
  transform: scale(1.02);
  box-shadow: 0 8px 25px rgba(59, 130, 246, 0.2);
  z-index: 10;
}

.dragging-item {
  opacity: 0.8;
  transform: scale(1.05) rotate(2deg);
  transition: all 0.2s ease;
}

.drag-handle:hover {
  background: rgba(59, 130, 246, 0.1);
  border-radius: 4px;
}
</style>
