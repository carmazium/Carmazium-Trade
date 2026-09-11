import * as React from "react"
import { cn } from "@/lib/utils"

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>

const Input = React.forwardRef<HTMLInputElement, InputProps>(
    ({ className, type, ...props }, ref) => {
        return (
            <input
                type={type}
                onWheel={(e) => {
                    if (type === 'number') {
                        e.currentTarget.blur();
                    }
                }}
                className={cn(
                    "flex h-12 w-full border bg-[var(--bg-input)] border-[var(--border-default)] text-[var(--text-primary)] backdrop-blur-sm px-4 py-2 text-base ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50 font-sans transition-all duration-300 focus:border-primary/50 shadow-inner rounded-xl [&::placeholder]:opacity-60",
                    className
                )}
                ref={ref}
                {...props}
            />
        )
    }
)
Input.displayName = "Input"

export { Input }
