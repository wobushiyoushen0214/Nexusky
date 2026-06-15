import * as React from 'react'
import { Tooltip as TooltipPrimitive } from 'radix-ui'
import { cn } from '../../lib/utils'
import './ui.css'

const DEFAULT_DELAY_DURATION = 500
const TooltipProviderContext = React.createContext(false)

export function TooltipProvider({
  delayDuration = DEFAULT_DELAY_DURATION,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
  return (
    <TooltipProviderContext.Provider value={true}>
      <TooltipPrimitive.Provider
        data-slot="tooltip-provider"
        delayDuration={delayDuration}
        {...props}
      />
    </TooltipProviderContext.Provider>
  )
}

export function Tooltip(props: React.ComponentProps<typeof TooltipPrimitive.Root>) {
  const hasProvider = React.useContext(TooltipProviderContext)
  const root = <TooltipPrimitive.Root data-slot="tooltip" {...props} />

  if (hasProvider) return root
  return <TooltipProvider>{root}</TooltipProvider>
}

export function TooltipTrigger(props: React.ComponentProps<typeof TooltipPrimitive.Trigger>) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />
}

export function TooltipPortal(props: React.ComponentProps<typeof TooltipPrimitive.Portal>) {
  return <TooltipPrimitive.Portal data-slot="tooltip-portal" {...props} />
}

export function TooltipContent({
  className,
  sideOffset = 6,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPortal>
      <TooltipPrimitive.Content
        data-slot="tooltip-content"
        sideOffset={sideOffset}
        className={cn('ui-tooltip-content', className)}
        {...props}
      />
    </TooltipPortal>
  )
}
