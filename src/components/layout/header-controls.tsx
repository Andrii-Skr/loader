"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { startTransition, useEffect, useState } from "react";

import { useTheme } from "@/components/providers/theme-provider";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { usePathname, useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

type AppLocale = "ru" | "uk" | "en";
type ThemeMode = "light" | "dark" | "system";

type HeaderControlsProps = {
  currentLocale: AppLocale;
  headerControlsLabel: string;
  languageLabel: string;
  localeLabels: Record<AppLocale, string>;
  themeLabel: string;
  themeLabels: Record<ThemeMode, string>;
};

const localeOrder: AppLocale[] = ["ru", "uk", "en"];
const themeOptions: Array<{ value: ThemeMode; icon: typeof Sun }> = [
  { value: "light", icon: Sun },
  { value: "dark", icon: Moon },
  { value: "system", icon: Monitor },
];

export function HeaderControls({
  currentLocale,
  headerControlsLabel,
  languageLabel,
  localeLabels,
  themeLabel,
  themeLabels,
}: HeaderControlsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { resolvedTheme, setTheme, theme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <div aria-label={headerControlsLabel} className="flex flex-wrap items-center justify-end gap-3">
      <fieldset className="header-control">
        <legend className="header-control__label">{languageLabel}</legend>
        <div className="header-control__segmented">
          {localeOrder.map((locale) => {
            const isActive = locale === currentLocale;

            return (
              <button
                aria-pressed={isActive}
                className={cn("header-control__chip", isActive && "header-control__chip--active")}
                key={locale}
                onClick={() => {
                  if (locale === currentLocale) {
                    return;
                  }

                  startTransition(() => {
                    router.replace(pathname, { locale });
                  });
                }}
                type="button"
              >
                {localeLabels[locale]}
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="header-control">
        <legend className="header-control__label">{themeLabel}</legend>
        <div className="header-control__segmented">
          {themeOptions.map(({ value, icon: Icon }) => {
            const isCurrentTheme = mounted
              ? value === "system"
                ? theme === "system"
                : theme !== "system" && resolvedTheme === value
              : value === "system";

            return (
              <TooltipProvider key={value}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      aria-label={themeLabels[value]}
                      aria-pressed={isCurrentTheme}
                      className={cn(
                        "header-control__chip header-control__chip--icon",
                        isCurrentTheme && "header-control__chip--active",
                      )}
                      onClick={() => setTheme(value)}
                      type="button"
                    >
                      <Icon />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <span>{themeLabels[value]}</span>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            );
          })}
        </div>
      </fieldset>
    </div>
  );
}
