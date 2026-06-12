import * as React from 'react'
import { cn } from '../../lib/utils'
import './ui.css'

export type TextareaProps = React.ComponentPropsWithoutRef<'textarea'>

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea({
  className,
  ...props
}, ref) {
  return (
    <textarea
      ref={ref}
      data-slot="textarea"
      className={cn('ui-textarea', className)}
      {...props}
    />
  )
})

Textarea.displayName = 'Textarea'
