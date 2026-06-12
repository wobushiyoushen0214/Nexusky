import * as React from 'react'
import { AlertDialog as AlertDialogPrimitive } from 'radix-ui'
import { cn } from '../../lib/utils'
import { Button } from './button'
import './ui.css'

export function AlertDialog(props: React.ComponentProps<typeof AlertDialogPrimitive.Root>) {
  return <AlertDialogPrimitive.Root data-slot="alert-dialog" {...props} />
}

export function AlertDialogTrigger(props: React.ComponentProps<typeof AlertDialogPrimitive.Trigger>) {
  return <AlertDialogPrimitive.Trigger data-slot="alert-dialog-trigger" {...props} />
}

export function AlertDialogPortal(props: React.ComponentProps<typeof AlertDialogPrimitive.Portal>) {
  return <AlertDialogPrimitive.Portal data-slot="alert-dialog-portal" {...props} />
}

export function AlertDialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Overlay>) {
  return (
    <AlertDialogPrimitive.Overlay
      data-slot="alert-dialog-overlay"
      className={cn('ui-alert-dialog-overlay', className)}
      {...props}
    />
  )
}

export function AlertDialogContent({
  className,
  children,
  overlayClassName,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Content> & {
  overlayClassName?: string
}) {
  return (
    <AlertDialogPortal>
      <AlertDialogOverlay className={overlayClassName} />
      <AlertDialogPrimitive.Content
        data-slot="alert-dialog-content"
        className={cn('ui-alert-dialog-content', className)}
        {...props}
      >
        {children}
      </AlertDialogPrimitive.Content>
    </AlertDialogPortal>
  )
}

export function AlertDialogHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="alert-dialog-header"
      className={cn('ui-alert-dialog-header', className)}
      {...props}
    />
  )
}

export function AlertDialogFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="alert-dialog-footer"
      className={cn('ui-alert-dialog-footer', className)}
      {...props}
    />
  )
}

export function AlertDialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Title>) {
  return (
    <AlertDialogPrimitive.Title
      data-slot="alert-dialog-title"
      className={cn('ui-alert-dialog-title', className)}
      {...props}
    />
  )
}

export function AlertDialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Description>) {
  return (
    <AlertDialogPrimitive.Description
      data-slot="alert-dialog-description"
      className={cn('ui-alert-dialog-description', className)}
      {...props}
    />
  )
}

export function AlertDialogAction({
  className,
  variant = 'default',
  size = 'sm',
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Action> & {
  variant?: React.ComponentProps<typeof Button>['variant']
  size?: React.ComponentProps<typeof Button>['size']
}) {
  return (
    <AlertDialogPrimitive.Action asChild>
      <Button
        data-slot="alert-dialog-action"
        className={cn('ui-alert-dialog-action', className)}
        variant={variant}
        size={size}
        {...props}
      />
    </AlertDialogPrimitive.Action>
  )
}

export function AlertDialogCancel({
  className,
  variant = 'outline',
  size = 'sm',
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Cancel> & {
  variant?: React.ComponentProps<typeof Button>['variant']
  size?: React.ComponentProps<typeof Button>['size']
}) {
  return (
    <AlertDialogPrimitive.Cancel asChild>
      <Button
        data-slot="alert-dialog-cancel"
        className={cn('ui-alert-dialog-cancel', className)}
        variant={variant}
        size={size}
        {...props}
      />
    </AlertDialogPrimitive.Cancel>
  )
}
