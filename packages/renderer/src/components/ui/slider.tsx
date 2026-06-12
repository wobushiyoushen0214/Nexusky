import * as React from 'react'
import { Slider as SliderPrimitive } from 'radix-ui'
import { cn } from '../../lib/utils'
import './ui.css'

export function Slider({
  className,
  ...props
}: React.ComponentProps<typeof SliderPrimitive.Root>) {
  return (
    <SliderPrimitive.Root
      data-slot="slider"
      className={cn('ui-slider', className)}
      {...props}
    >
      <SliderPrimitive.Track data-slot="slider-track" className="ui-slider-track">
        <SliderPrimitive.Range data-slot="slider-range" className="ui-slider-range" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb data-slot="slider-thumb" className="ui-slider-thumb" />
    </SliderPrimitive.Root>
  )
}
