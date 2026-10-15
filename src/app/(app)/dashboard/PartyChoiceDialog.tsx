"use client";

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  type PartyChoices,
  type PartySelection,
  partySelectionFormSchema,
} from "@/lib/counterparties/schema";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import type { z } from "zod";

export function PartyChoiceDialog({
  selection,
  fileName,
  pending,
  error,
  onConfirm,
  onCancel,
}: {
  selection: PartySelection;
  fileName: string;
  pending: boolean;
  error: string | null;
  onConfirm: (choices: PartyChoices) => void;
  onCancel: () => void;
}) {
  const t = useTranslations("Counterparties");
  const schema = partySelectionFormSchema(selection.questions, t("errors.invalidInput"));
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      supplierSelection: "",
      supplierName: selection.questions.find((q) => q.role === "supplier")?.suggestedName ?? "",
      recipientSelection: "",
      recipientName: selection.questions.find((q) => q.role === "recipient")?.suggestedName ?? "",
    },
  });
  return (
    <AlertDialog open>
      <AlertDialogContent className="max-h-[90vh] overflow-auto sm:max-w-xl">
        <AlertDialogHeader>
          <AlertDialogTitle>{t("confirmTitle")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("confirmDescription", { file: fileName })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Form {...form}>
          <form
            className="grid gap-5"
            onSubmit={form.handleSubmit((values) => {
              const choices: PartyChoices = {};
              for (const question of selection.questions) {
                const value = values[`${question.role}Selection`];
                choices[question.role] =
                  value === "create"
                    ? { mode: "create", name: values[`${question.role}Name`] }
                    : { mode: "existing", id: Number(value) };
              }
              onConfirm(choices);
            })}
          >
            {selection.questions.map((question) => (
              <section className="grid gap-3 rounded-xl border p-4" key={question.role}>
                <div>
                  <strong>{t(question.role)}</strong>
                  <p className="break-words text-sm">{question.sourceName}</p>
                  {question.sourceTaxId ? (
                    <p className="text-sm text-muted-foreground">
                      {t("taxId")}: {question.sourceTaxId}
                    </p>
                  ) : null}
                </div>
                <FormField
                  control={form.control}
                  name={`${question.role}Selection`}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("choose")}</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder={t("choose")} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {question.options.map((option) => (
                            <SelectItem key={option.id} value={String(option.id)}>
                              {option.name}
                              {option.taxId.startsWith("name:") ? "" : ` · ${option.taxId}`}
                            </SelectItem>
                          ))}
                          <SelectItem value="create">{t("createNew")}</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {form.watch(`${question.role}Selection`) === "create" ? (
                  <FormField
                    control={form.control}
                    name={`${question.role}Name`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("name")}</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                ) : null}
              </section>
            ))}
            <p className="text-sm text-muted-foreground">{t("rememberHint")}</p>
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button disabled={pending} variant="outline" type="button" onClick={onCancel}>
                {t("cancelUpload")}
              </Button>
              <Button disabled={pending} type="submit">
                {pending ? t("pending") : t("confirm")}
              </Button>
            </div>
          </form>
        </Form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
