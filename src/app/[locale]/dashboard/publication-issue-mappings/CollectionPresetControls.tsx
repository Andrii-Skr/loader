"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";

import {
  forgetCollectionPreset,
  loadSavedCollectionPreset,
  rememberCollectionPreset,
  searchSavedCollectionPresets,
} from "@/app/actions/collection-presets";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import type { AppLocale } from "@/i18n/routing";
import type { AllocationDraft } from "@/lib/publication-mappings/allocation-drafts";
import { collectionPresetNameSchema } from "@/lib/publication-mappings/collection-presets";
import type {
  CollectionPresetDto,
  DocumentLineAllocationDto,
} from "@/lib/publication-mappings/types";

export function CollectionPresetControls({
  documentId,
  line,
  drafts,
  locale,
  onApply,
}: {
  documentId: number;
  line: DocumentLineAllocationDto;
  drafts: AllocationDraft[];
  locale: AppLocale;
  onApply: (line: DocumentLineAllocationDto, preset: CollectionPresetDto) => void;
}) {
  const t = useTranslations("PublicationMappings");
  const [preset, setPreset] = useState(line.collectionPreset ?? null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(
    line.collectionPreset?.unavailable ? t("messages.presetUnavailable") : null,
  );
  const [message, setMessage] = useState<string | null>(null);
  const form = useForm<{ name: string }>({
    resolver: zodResolver(collectionPresetNameSchema(t("messages.presetNameRequired"))),
    defaultValues: { name: line.collectionPreset?.name ?? line.parsedPublicationName ?? "" },
  });
  const context = { documentId, specialDocumentId: line.specialDocumentId, locale };
  const remember = form.handleSubmit(({ name }) => {
    const editionIds = drafts.flatMap((draft) =>
      draft.externalEditionId === null ? [] : [draft.externalEditionId],
    );
    if (editionIds.length === 0 || editionIds.length !== drafts.length) {
      setError(t("messages.presetEditionsRequired"));
      return;
    }
    startTransition(async () => {
      setError(null);
      setMessage(null);
      try {
        const result = await rememberCollectionPreset({
          ...context,
          name,
          presetId: preset?.id,
          editionIds,
        });
        if (result.errorKey) {
          setError(t(`messages.${result.errorKey}`));
          return;
        }
        if (result.preset) setPreset(result.preset);
        setMessage(t("messages.presetSaved"));
      } catch {
        setError(t("messages.presetRequestFailed"));
      }
    });
  });

  return (
    <div className="grid gap-3 border-t border-[color:var(--line)] pt-3">
      <p className="text-sm text-[color:var(--ink-soft)]">{t("presetHelp")}</p>
      {preset ? <p className="text-sm">{t("presetSelected", { name: preset.name })}</p> : null}
      <form className="flex flex-wrap items-start gap-3" onSubmit={remember}>
        <label className="grid min-w-48 flex-1 gap-1 text-xs text-[color:var(--ink-soft)]">
          {t("presetName")}
          <Input {...form.register("name")} disabled={pending} maxLength={160} />
          {form.formState.errors.name ? (
            <span role="alert">{form.formState.errors.name.message}</span>
          ) : null}
        </label>
        <label className="grid min-w-48 flex-1 gap-1 text-xs text-[color:var(--ink-soft)]">
          {t("presetExisting")}
          <Combobox
            disabled={pending}
            initialOptions={preset ? [{ value: preset.id, label: preset.name }] : []}
            selectedOption={preset ? { value: preset.id, label: preset.name } : null}
            placeholder={t("presetChoose")}
            messages={{
              clear: t("clearSelection"),
              empty: t("presetEmpty"),
              searching: t("searchPending"),
              searchPlaceholder: t("presetSearch"),
            }}
            onSearch={async (query) => {
              try {
                const result = await searchSavedCollectionPresets({ query });
                if (result.errorKey) {
                  setError(t(`messages.${result.errorKey}`));
                  return [];
                }
                return (result.presets ?? []).map((item) => ({ value: item.id, label: item.name }));
              } catch {
                setError(t("messages.presetRequestFailed"));
                return [];
              }
            }}
            onSelect={(option) => {
              if (!option) {
                setPreset(null);
                form.setValue("name", line.parsedPublicationName ?? "");
                return;
              }
              startTransition(async () => {
                setError(null);
                setMessage(null);
                try {
                  const result = await loadSavedCollectionPreset({
                    ...context,
                    presetId: option.value,
                  });
                  if (result.errorKey) {
                    setError(t(`messages.${result.errorKey}`));
                    return;
                  }
                  if (result.preset && result.line) {
                    setPreset(result.preset);
                    form.setValue("name", result.preset.name);
                    onApply(result.line, result.preset);
                  }
                } catch {
                  setError(t("messages.presetRequestFailed"));
                }
              });
            }}
          />
        </label>
        <div className="flex flex-wrap gap-2 pt-5">
          <Button type="submit" variant="outline" disabled={pending}>
            {pending ? t("savePending") : t("presetRemember")}
          </Button>
          {preset ? (
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => {
                startTransition(async () => {
                  setError(null);
                  setMessage(null);
                  try {
                    const result = await forgetCollectionPreset({
                      ...context,
                      presetId: preset.id,
                    });
                    if (result.errorKey) {
                      setError(t(`messages.${result.errorKey}`));
                      return;
                    }
                    setPreset(null);
                    setMessage(t("messages.presetDeleted"));
                  } catch {
                    setError(t("messages.presetRequestFailed"));
                  }
                });
              }}
            >
              {t("presetForget")}
            </Button>
          ) : null}
        </div>
      </form>
      {error ? (
        <p role="alert" className="text-sm text-[color:var(--accent-strong)]">
          {error}
        </p>
      ) : null}
      {message ? <output className="text-sm text-[color:var(--success)]">{message}</output> : null}
    </div>
  );
}
