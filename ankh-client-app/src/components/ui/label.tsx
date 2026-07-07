"use client"

import * as React from "react"
import * as LabelPrimitive from "@radix-ui/react-label"
import clsx from "clsx"
import { twMerge } from "tailwind-merge"

// Utility function to combine class names
function combineClassNames(...inputs: Parameters<typeof clsx>) {
  return twMerge(clsx(inputs))
}

function Label({
  className,
  ...props
}: React.ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={combineClassNames(
        "flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
}

export { Label }
