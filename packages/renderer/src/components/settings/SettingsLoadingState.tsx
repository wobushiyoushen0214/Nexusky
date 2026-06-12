import { cn } from '../../lib/utils'
import { Empty, EmptyDescription } from '../ui/empty'
import { Spinner } from '../ui/spinner'

interface SettingsLoadingStateProps {
  label: string
  className?: string
}

export function SettingsLoadingState({ label, className }: SettingsLoadingStateProps) {
  return (
    <Empty className={cn(className, 'settings-loading')}>
      <Spinner aria-hidden="true" />
      <EmptyDescription>{label}</EmptyDescription>
    </Empty>
  )
}
