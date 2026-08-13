import { AlertTriangle, CheckCircle2, CircleHelp, XCircle } from "lucide-react";

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { MappingStatusKey } from "@/lib/documents/mapping-status";
import { cn } from "@/lib/utils";

const iconByStatus = {
  fullyMatched: CheckCircle2,
  partiallyMatched: AlertTriangle,
  unmatched: XCircle,
  unparsed: CircleHelp,
} satisfies Record<MappingStatusKey, React.ComponentType<{ className?: string }>>;

const classNameByStatus = {
  fullyMatched: "text-green-600",
  partiallyMatched: "text-yellow-500",
  unmatched: "text-red-600",
  unparsed: "text-slate-400",
} satisfies Record<MappingStatusKey, string>;

export function MappingStatusIcon({
  status,
  label,
  className,
}: {
  status: MappingStatusKey;
  label: string;
  className?: string;
}) {
  const Icon = iconByStatus[status];

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            aria-label={label}
            className={cn("inline-flex items-center justify-center", className)}
            role="img"
          >
            <Icon aria-hidden="true" className={cn("size-4", classNameByStatus[status])} />
          </span>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
