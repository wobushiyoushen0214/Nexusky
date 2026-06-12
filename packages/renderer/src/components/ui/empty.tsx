import * as React from 'react'
import { cn } from '../../lib/utils'
import './ui.css'

export function Empty({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div data-slot="empty" className={cn('ui-empty', className)} {...props} />
}

export function EmptyHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div data-slot="empty-header" className={cn('ui-empty-header', className)} {...props} />
}

export function EmptyTitle({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div data-slot="empty-title" className={cn('ui-empty-title', className)} {...props} />
}

export function EmptyDescription({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div data-slot="empty-description" className={cn('ui-empty-description', className)} {...props} />
}

export function EmptyContent({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div data-slot="empty-content" className={cn('ui-empty-content', className)} {...props} />
}
