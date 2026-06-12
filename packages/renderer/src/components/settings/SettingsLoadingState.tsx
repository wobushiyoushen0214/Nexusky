import { Spinner } from '../ui/spinner'

interface SettingsLoadingStateProps {
  label: string
  className?: string
}

export function SettingsLoadingState({ label, className }: SettingsLoadingStateProps) {
  return (
    <div className={`${className ? `${className} ` : ''}settings-loading`}>
      <Spinner aria-hidden="true" />
      <p>{label}</p>
    </div>
  )
}
