"use client";

import { Check, ChevronsUpDown, LoaderCircle, X } from "lucide-react";
import { useEffect, useMemo, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
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
  widthClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState(initialOptions);
  const [isSearching, startSearchTransition] = useTransition();

  useEffect(() => {
    setOptions(initialOptions);
  }, [initialOptions]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setOptions(initialOptions);
      return;
    }

    const normalizedQuery = query.trim();

    if (normalizedQuery.length === 0) {
      setOptions(initialOptions);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      startSearchTransition(async () => {
        const nextOptions = await onSearch(normalizedQuery);
        setOptions(nextOptions);
      });
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [initialOptions, onSearch, open, query]);

  const visibleOptions = useMemo(() => {
    const currentValue = selectedOption?.value;

    return options.filter(
      (option) => !excludedValues?.has(option.value) || option.value === currentValue,
    );
  }, [excludedValues, options, selectedOption?.value]);

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

          <div className="max-h-72 overflow-auto rounded-[18px] border border-[color:var(--line)] bg-[color:var(--panel-strong)]">
            {isSearching ? (
              <div className="flex items-center gap-2 px-3 py-3 text-sm text-[color:var(--ink-soft)]">
                <LoaderCircle className="size-4 animate-spin" />
                <span>{messages.searching}</span>
              </div>
            ) : visibleOptions.length === 0 ? (
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
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
