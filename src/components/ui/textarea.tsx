import type * as React from "react";

import { cn } from "@/lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(
        "flex min-h-[180px] w-full rounded-[18px] border border-[color:var(--line)] bg-[color:var(--panel-strong)] px-4 py-3 text-base text-[color:var(--ink)] outline-none transition-colors placeholder:text-[color:var(--ink-soft)] focus-visible:border-[color:var(--accent)] disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
