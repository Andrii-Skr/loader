import type * as React from "react";

import { cn } from "@/lib/utils";

function Label({ className, ...props }: React.ComponentProps<"label">) {
  return (
    <label
      className={cn("text-sm font-medium leading-none text-[color:var(--ink)]", className)}
      {...props}
    />
  );
}

export { Label };
