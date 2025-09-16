<template>
  <div class="space-y-6">

    <!-- 数据库状态卡片 -->
    <div class="grid gap-4 md:grid-cols-3">
      <!-- Redis 状态 -->
      <div class="glass rounded-2xl p-6 shadow-lg">
        <div class="flex items-center justify-between">
          <div>
            <h3 class="text-lg font-semibold text-gray-800 dark:text-gray-200">Redis 缓存</h3>
            <p class="text-sm text-gray-600 dark:text-gray-400">高性能缓存层</p>
          </div>
          <div class="text-3xl">
            <i
              :class="[
                'fas',
                dbStatus?.databases?.redis ? 'fa-check-circle text-green-500' : 'fa-times-circle text-red-500'
              ]"
            />
          </div>
        </div>
        <div class="mt-4">
          <div class="text-2xl font-bold text-blue-600 dark:text-blue-400">
            {{ dbCounts.redis }}
          </div>
          <div class="text-sm text-gray-500 dark:text-gray-400">API Keys</div>
        </div>
      </div>

      <!-- PostgreSQL 状态 -->
      <div class="glass rounded-2xl p-6 shadow-lg">
        <div class="flex items-center justify-between">
          <div>
            <h3 class="text-lg font-semibold text-gray-800 dark:text-gray-200">PostgreSQL</h3>
            <p class="text-sm text-gray-600 dark:text-gray-400">持久存储数据库</p>
          </div>
          <div class="text-3xl">
            <i
              :class="[
                'fas',
                dbStatus?.databases?.postgres ? 'fa-check-circle text-green-500' : 'fa-times-circle text-red-500'
              ]"
            />
          </div>
        </div>
        <div class="mt-4">
          <div class="text-2xl font-bold text-purple-600 dark:text-purple-400">
            {{ dbCounts.postgres }}
          </div>
          <div class="text-sm text-gray-500 dark:text-gray-400">API Keys</div>
        </div>
      </div>

      <!-- 一致性状态 -->
      <div class="glass rounded-2xl p-6 shadow-lg">
        <div class="flex items-center justify-between">
          <div>
            <h3 class="text-lg font-semibold text-gray-800 dark:text-gray-200">数据一致性</h3>
            <p class="text-sm text-gray-600 dark:text-gray-400">Redis ⇄ PostgreSQL</p>
          </div>
          <div class="text-3xl">
            <i
              :class="[
                'fas',
                isDataConsistent ? 'fa-check-circle text-green-500' : 'fa-exclamation-triangle text-yellow-500'
              ]"
            />
          </div>
        </div>
        <div class="mt-4">
          <div
            class="text-lg font-bold"
            :class="isDataConsistent ? 'text-green-600 dark:text-green-400' : 'text-yellow-600 dark:text-yellow-400'"
          >
            {{ isDataConsistent ? '一致' : `差异 ${Math.abs(dbCounts.redis - dbCounts.postgres)}` }}
          </div>
          <div class="text-sm text-gray-500 dark:text-gray-400">
            {{ dbStatus?.strategy || 'cache_first' }} 策略
          </div>
        </div>
      </div>
    </div>

    <!-- 同步控制面板 -->
    <div class="glass rounded-2xl p-6 shadow-lg">
      <h2 class="mb-4 text-xl font-semibold text-gray-800 dark:text-gray-200">
        <i class="fas fa-sync-alt mr-2" />
        数据同步控制
      </h2>

      <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <!-- 一致性检查 -->
        <button
          @click="checkConsistency"
          :disabled="loading.check"
          class="sync-button bg-blue-500 hover:bg-blue-600 disabled:opacity-50"
        >
          <i :class="loading.check ? 'fas fa-spinner fa-spin' : 'fas fa-search'" class="mr-2" />
          检查一致性
        </button>

        <!-- 自动修复 -->
        <button
          @click="autoFixConsistency"
          :disabled="loading.fix"
          class="sync-button bg-green-500 hover:bg-green-600 disabled:opacity-50"
        >
          <i :class="loading.fix ? 'fas fa-spinner fa-spin' : 'fas fa-wrench'" class="mr-2" />
          自动修复
        </button>

        <!-- Redis → PostgreSQL -->
        <button
          @click="syncRedisToPostgres"
          :disabled="loading.sync1"
          class="sync-button bg-purple-500 hover:bg-purple-600 disabled:opacity-50"
        >
          <i :class="loading.sync1 ? 'fas fa-spinner fa-spin' : 'fas fa-arrow-right'" class="mr-2" />
          Redis → PG
        </button>

        <!-- PostgreSQL → Redis -->
        <button
          @click="syncPostgresToRedis"
          :disabled="loading.sync2"
          class="sync-button bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50"
        >
          <i :class="loading.sync2 ? 'fas fa-spinner fa-spin' : 'fas fa-arrow-left'" class="mr-2" />
          PG → Redis
        </button>
      </div>
    </div>

    <!-- 操作日志 -->
    <div class="glass rounded-2xl p-6 shadow-lg">
      <h2 class="mb-4 text-xl font-semibold text-gray-800 dark:text-gray-200">
        <i class="fas fa-list-alt mr-2" />
        操作日志
        <button
          @click="clearLogs"
          class="ml-4 text-sm text-gray-500 hover:text-red-500 transition-colors"
        >
          <i class="fas fa-trash mr-1" />
          清空
        </button>
      </h2>

      <div class="max-h-64 overflow-y-auto rounded-lg bg-gray-50 dark:bg-gray-800 p-4">
        <div v-if="logs.length === 0" class="text-center text-gray-500 dark:text-gray-400">
          暂无操作日志
        </div>
        <div
          v-for="(log, index) in logs"
          :key="index"
          class="mb-2 flex items-start gap-3 text-sm"
        >
          <span class="text-gray-400 dark:text-gray-500 font-mono">
            {{ formatTime(log.timestamp) }}
          </span>
          <div class="flex-1">
            <span
              :class="{
                'text-green-600 dark:text-green-400': log.type === 'success',
                'text-red-600 dark:text-red-400': log.type === 'error',
                'text-blue-600 dark:text-blue-400': log.type === 'info',
                'text-yellow-600 dark:text-yellow-400': log.type === 'warning'
              }"
            >
              {{ log.message }}
            </span>
            <div v-if="log.details" class="mt-1 text-gray-500 dark:text-gray-400">
              {{ log.details }}
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, computed, onMounted } from 'vue'
import { useThemeStore } from '@/stores/theme'
import { useAuthStore } from '@/stores/auth'
import { apiClient } from '@/config/api'

export default {
  name: 'DatabaseManagementView',
  components: {},
  setup() {
    const themeStore = useThemeStore()
    const authStore = useAuthStore()

    // Reactive data
    const dbStatus = ref(null)
    const dbCounts = ref({ redis: 0, postgres: 0 })
    const logs = ref([])
    const loading = ref({
      check: false,
      fix: false,
      sync1: false,
      sync2: false
    })

    // Computed properties
    const isDarkMode = computed(() => themeStore.isDarkMode)
    const oemSettings = computed(() => authStore.oemSettings || {})
    const isDataConsistent = computed(() =>
      Math.abs(dbCounts.value.redis - dbCounts.value.postgres) === 0
    )

    // Methods
    const addLog = (message, type = 'info', details = null) => {
      logs.value.unshift({
        timestamp: new Date(),
        message,
        type,
        details
      })
      // 只保留最近50条日志
      if (logs.value.length > 50) {
        logs.value = logs.value.slice(0, 50)
      }
    }

    const clearLogs = () => {
      logs.value = []
      addLog('日志已清空', 'info')
    }

    const formatTime = (timestamp) => {
      return new Date(timestamp).toLocaleTimeString('zh-CN', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      })
    }

    const fetchDatabaseStatus = async () => {
      try {
        const response = await apiClient.get('/admin/database/status')

        if (response.success) {
          dbStatus.value = response.data
          addLog('数据库状态更新', 'success')
        }
      } catch (error) {
        console.error('Failed to fetch database status:', error)
        addLog('获取数据库状态失败', 'error', error.message)
      }
    }

    const checkConsistency = async () => {
      loading.value.check = true
      try {
        addLog('正在检查数据一致性...', 'info')

        const response = await apiClient.get('/admin/database/consistency-check')

        if (response.success) {
          const data = response.data
          dbCounts.value.redis = data.counts.redis
          dbCounts.value.postgres = data.counts.postgres

          addLog(
            `一致性检查完成: Redis(${data.counts.redis}) vs PostgreSQL(${data.counts.postgres})`,
            data.consistent ? 'success' : 'warning',
            data.status
          )
        }
      } catch (error) {
        console.error('Consistency check failed:', error)
        addLog('一致性检查失败', 'error', error.message)
      }
      loading.value.check = false
    }

    const autoFixConsistency = async () => {
      loading.value.fix = true
      try {
        addLog('正在执行自动修复...', 'info')

        const response = await apiClient.post('/admin/database/consistency-fix', {})

        if (response.success) {
          const data = response.data
          dbCounts.value.redis = data.counts.redis
          dbCounts.value.postgres = data.counts.postgres

          addLog(
            `自动修复完成: Redis(${data.counts.redis}) vs PostgreSQL(${data.counts.postgres})`,
            data.consistent ? 'success' : 'warning',
            data.message
          )
        }
      } catch (error) {
        console.error('Auto-fix failed:', error)
        addLog('自动修复失败', 'error', error.message)
      }
      loading.value.fix = false
    }

    const syncRedisToPostgres = async () => {
      loading.value.sync1 = true
      try {
        addLog('正在同步 Redis → PostgreSQL...', 'info')

        const response = await apiClient.post('/admin/database/sync/redis-to-postgres', {})

        if (response.success) {
          const data = response.data
          addLog(
            `同步完成: ${data.synced}/${data.total} 条记录`,
            'success',
            data.message
          )
          await checkConsistency()
        }
      } catch (error) {
        console.error('Redis to PostgreSQL sync failed:', error)
        addLog('Redis → PostgreSQL 同步失败', 'error', error.message)
      }
      loading.value.sync1 = false
    }

    const syncPostgresToRedis = async () => {
      loading.value.sync2 = true
      try {
        addLog('正在同步 PostgreSQL → Redis...', 'info')

        const response = await apiClient.post('/admin/database/sync/postgres-to-redis', {})

        if (response.success) {
          const data = response.data
          addLog(
            `同步完成: ${data.synced}/${data.total} 条记录`,
            'success',
            data.message
          )
          await checkConsistency()
        }
      } catch (error) {
        console.error('PostgreSQL to Redis sync failed:', error)
        addLog('PostgreSQL → Redis 同步失败', 'error', error.message)
      }
      loading.value.sync2 = false
    }

    // Lifecycle
    onMounted(async () => {
      addLog('数据库管理界面加载完成', 'success')
      await fetchDatabaseStatus()
      await checkConsistency()

      // 每30秒刷新状态
      setInterval(fetchDatabaseStatus, 30000)
    })

    return {
      isDarkMode,
      oemSettings,
      dbStatus,
      dbCounts,
      logs,
      loading,
      isDataConsistent,
      addLog,
      clearLogs,
      formatTime,
      checkConsistency,
      autoFixConsistency,
      syncRedisToPostgres,
      syncPostgresToRedis
    }
  }
}
</script>

<style scoped>
.sync-button {
  @apply rounded-xl px-4 py-3 text-white font-medium transition-all duration-200 transform hover:scale-105 shadow-lg;
}
</style>