import type * as React from "react";

import { cn } from "@/lib/utils";

function Badge({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full border border-[color:var(--line)] bg-[rgba(255,255,255,0.34)] px-3 py-1.5 text-[0.75rem] uppercase tracking-[0.12em] text-[color:var(--ink-soft)]",
        className,
      )}
      {...props}
    />
  );
}

export { Badge };
