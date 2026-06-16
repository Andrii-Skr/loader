import { type VariantProps, cva } from "class-variance-authority";
import { Slot } from "radix-ui";
import type * as React from "react";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-[18px] text-sm font-medium whitespace-nowrap transition-[transform,background-color,border-color,color,box-shadow] outline-none focus-visible:ring-[3px] focus-visible:ring-[rgba(177,74,47,0.22)] disabled:pointer-events-none disabled:opacity-50 data-[size=default]:shadow-[0_10px_24px_rgba(32,22,12,0.08)] [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "bg-[color:var(--accent)] text-[rgba(255,250,242,0.98)] hover:-translate-y-px hover:bg-[color:var(--accent-strong)]",
        destructive:
          "bg-[color:var(--accent-strong)] text-[rgba(255,250,242,0.98)] hover:-translate-y-px hover:bg-[#742717] focus-visible:ring-[rgba(141,53,31,0.24)]",
        outline:
          "border border-[rgba(17,24,39,0.14)] bg-[rgba(255,255,255,0.78)] text-[color:var(--ink)] hover:-translate-y-px hover:bg-[rgba(255,250,242,0.96)]",
        secondary:
          "border border-[rgba(17,24,39,0.1)] bg-[rgba(255,250,242,0.88)] text-[color:var(--ink)] hover:-translate-y-px hover:bg-[rgba(255,245,234,0.98)]",
        ghost:
          "text-[color:var(--ink)] shadow-none hover:bg-[rgba(177,74,47,0.1)] hover:text-[color:var(--accent-strong)]",
        link: "rounded-none p-0 text-[color:var(--accent-strong)] shadow-none underline-offset-4 hover:text-[color:var(--accent)] hover:underline",
      },
      size: {
        default: "h-11 px-5 py-2.5 has-[>svg]:px-4",
        xs: "h-7 gap-1 rounded-[14px] px-2.5 text-xs has-[>svg]:px-2 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-9 gap-1.5 rounded-[16px] px-4 has-[>svg]:px-3",
        lg: "h-12 rounded-[20px] px-6 text-[0.95rem] has-[>svg]:px-5",
        icon: "size-9",
        "icon-xs": "size-6 rounded-md [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8 rounded-[16px]",
        "icon-lg": "size-10 rounded-[20px]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot.Root : "button";

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
