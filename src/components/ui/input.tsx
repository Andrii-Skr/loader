import type * as React from "react";

import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "flex h-12 w-full rounded-[18px] border border-[rgba(17,24,39,0.14)] bg-[rgba(255,255,255,0.75)] px-4 py-3 text-base text-[color:var(--ink)] outline-none transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-[color:var(--ink-soft)] focus-visible:border-[color:var(--accent)] disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        className,
      )}
      type={type}
      {...props}
    />
  );
}

export { Input };
