"use client";

import { Check, ChevronsUpDown, LoaderCircle, X } from "lucide-react";
import { useEffect, useEffectEvent, useMemo, useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { matchesNormalizedComboboxSearch } from "@/components/ui/combobox-search";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type ComboboxOption = {
  value: number;
  label: string;
  score?: number;
};

type ComboboxMessages = {
  clear: string;
  empty: string;
  searching: string;
  searchPlaceholder: string;
};

export function Combobox({
  disabled = false,
  excludedValues,
  initialOptions,
  messages,
  onSearch,
  onSelect,
  contentClassName,
  placeholder,
  selectedOption,
  normalizedClientFilter = false,
  widthClassName,
}: {
  disabled?: boolean;
  contentClassName?: string;
  excludedValues?: Set<number>;
  initialOptions: ComboboxOption[];
  messages: ComboboxMessages;
  onSearch: (query: string) => Promise<ComboboxOption[]>;
  onSelect: (option: ComboboxOption | null) => void;
  placeholder: string;
  selectedOption: ComboboxOption | null;
  normalizedClientFilter?: boolean;
  widthClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState(initialOptions);
  const [isSearching, startSearchTransition] = useTransition();
  const searchRequestIdRef = useRef(0);
  const initialOptionsRef = useRef(initialOptions);

  useEffect(() => {
    initialOptionsRef.current = initialOptions;
  }, [initialOptions]);

  const runSearch = useEffectEvent(async (normalizedQuery: string, requestId: number) => {
    const nextOptions = await onSearch(normalizedQuery);

    if (searchRequestIdRef.current !== requestId) {
      return;
    }

    setOptions(nextOptions);
  });

  useEffect(() => {
    if (!open || query.trim().length === 0) {
      setOptions(initialOptions);
    }
  }, [initialOptions, open, query]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: Effect Events change identity on every render and must not be dependencies.
  useEffect(() => {
    if (!open) {
      searchRequestIdRef.current += 1;
      setQuery("");
      setOptions(initialOptionsRef.current);
      return;
    }

    const normalizedQuery = query.trim();

    if (normalizedQuery.length === 0) {
      searchRequestIdRef.current += 1;
      setOptions(initialOptionsRef.current);
      return;
    }

    const requestId = searchRequestIdRef.current + 1;
    searchRequestIdRef.current = requestId;

    const timeoutId = window.setTimeout(() => {
      startSearchTransition(async () => {
        await runSearch(normalizedQuery, requestId);
      });
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [open, query]);

  const visibleOptions = useMemo(() => {
    const currentValue = selectedOption?.value;

    return options.filter(
      (option) =>
        (!excludedValues?.has(option.value) || option.value === currentValue) &&
        (!normalizedClientFilter || matchesNormalizedComboboxSearch(option.label, query)),
    );
  }, [excludedValues, normalizedClientFilter, options, query, selectedOption?.value]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          aria-expanded={open}
          className={cn("w-full justify-between", widthClassName)}
          disabled={disabled}
          type="button"
          variant="outline"
        >
          <span className="truncate text-left">
            {selectedOption?.label ?? <span className="muted">{placeholder}</span>}
          </span>
          <ChevronsUpDown className="size-4 opacity-70" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className={cn("w-[min(24rem,var(--radix-popover-trigger-width))] p-3", contentClassName)}
      >
        <div className="grid gap-3">
          <Input
            autoFocus
            onChange={(event) => setQuery(event.target.value)}
            placeholder={messages.searchPlaceholder}
            type="text"
            value={query}
          />

          <div className="flex justify-end">
            <Button
              disabled={selectedOption === null}
              onClick={() => {
                onSelect(null);
                setOpen(false);
              }}
              size="xs"
              type="button"
              variant="ghost"
            >
              <X className="size-3.5" />
              {messages.clear}
            </Button>
          </div>

          <div className="relative max-h-72 overflow-auto rounded-[18px] border border-[color:var(--line)] bg-[color:var(--panel-strong)]">
            {visibleOptions.length === 0 ? (
              <div className="px-3 py-3 text-sm text-[color:var(--ink-soft)]">{messages.empty}</div>
            ) : (
              <div className="grid">
                {visibleOptions.map((option) => (
                  <button
                    key={option.value}
                    className="grid w-full grid-cols-[auto_1fr_auto] items-start gap-3 border-b border-[color:var(--line)] px-3 py-3 text-left text-sm last:border-b-0 hover:bg-[color:var(--panel)]"
                    onClick={() => {
                      onSelect(option);
                      setOpen(false);
                    }}
                    type="button"
                  >
                    <Check
                      className={cn(
                        "mt-0.5 size-4 text-[color:var(--accent-strong)]",
                        selectedOption?.value === option.value ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <span>{option.label}</span>
                    {typeof option.score === "number" ? (
                      <span className="muted whitespace-nowrap">{option.score.toFixed(2)}</span>
                    ) : (
                      <span />
                    )}
                  </button>
                ))}
              </div>
            )}
            {isSearching ? (
              <div className="pointer-events-none absolute right-3 top-3 flex items-center gap-2 rounded-full bg-[color:var(--panel)]/95 px-2 py-1 text-xs text-[color:var(--ink-soft)] shadow-sm">
                <LoaderCircle className="size-3.5 animate-spin" />
                <span>{messages.searching}</span>
              </div>
            ) : null}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
