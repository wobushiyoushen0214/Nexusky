import { useMaintenanceStore } from '../../stores/maintenance-store'
import { MaintenanceSession } from './MaintenanceSession'
import { SessionSummary } from './SessionSummary'
import { MaintenanceQueuePanel } from './MaintenanceQueuePanel'
import './maintenance.css'

/**
 * 维护队列主容器
 * 根据 viewMode 切换不同的视图
 */
export function MaintenanceContainer() {
  const viewMode = useMaintenanceStore((s) => s.viewMode)

  if (viewMode === 'session') {
    return <MaintenanceSession />
  }

  if (viewMode === 'summary') {
    return <SessionSummary />
  }

  return <MaintenanceQueuePanel />
}
