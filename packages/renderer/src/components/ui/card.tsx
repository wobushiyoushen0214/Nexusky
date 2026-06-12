import * as React from 'react'
import { Slot } from 'radix-ui'
import { cn } from '../../lib/utils'
import './ui.css'

export interface CardProps extends React.ComponentProps<'div'> {
  asChild?: boolean
}

export function Card({
  asChild = false,
  className,
  ...props
}: CardProps) {
  const Comp = asChild ? Slot.Root : 'div'

  return (
    <Comp
      data-slot="card"
      className={cn('ui-card', className)}
      {...props}
    />
  )
}

export function CardHeader({
  className,
  ...props
}: React.ComponentProps<'div'>) {
  return <div data-slot="card-header" className={cn('ui-card-header', className)} {...props} />
}

export function CardTitle({
  className,
  ...props
}: React.ComponentProps<'div'>) {
  return <div data-slot="card-title" className={cn('ui-card-title', className)} {...props} />
}

export function CardDescription({
  className,
  ...props
}: React.ComponentProps<'div'>) {
  return <div data-slot="card-description" className={cn('ui-card-description', className)} {...props} />
}

export function CardContent({
  className,
  ...props
}: React.ComponentProps<'div'>) {
  return <div data-slot="card-content" className={cn('ui-card-content', className)} {...props} />
}

export function CardFooter({
  className,
  ...props
}: React.ComponentProps<'div'>) {
  return <div data-slot="card-footer" className={cn('ui-card-footer', className)} {...props} />
}
