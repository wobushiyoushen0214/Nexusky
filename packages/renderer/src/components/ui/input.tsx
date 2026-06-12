import * as React from 'react'
import { cn } from '../../lib/utils'
import './ui.css'

export type InputProps = React.ComponentPropsWithoutRef<'input'>

export const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input({
  className,
  ...props
}, ref) {
  return (
    <input
      ref={ref}
      data-slot="input"
      className={cn('ui-input', className)}
      {...props}
    />
  )
})

Input.displayName = 'Input'
