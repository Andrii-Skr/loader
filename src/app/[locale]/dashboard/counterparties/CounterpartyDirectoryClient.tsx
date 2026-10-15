"use client";

import {
  addCounterpartyAlias,
  mergeCounterparties,
  removeCounterpartyAlias,
  saveCounterparty,
} from "@/app/actions/counterparties";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableShell,
} from "@/components/ui/table";
import { useRouter } from "@/i18n/navigation";
import type { DirectoryEntry } from "@/lib/counterparties/schema";
import { type PartyRole, directoryFormSchema } from "@/lib/counterparties/schema";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";

type EditState = { operation: "save" | "alias" | "merge"; entry: DirectoryEntry | null };
export function CounterpartyDirectoryClient({ entries }: { entries: DirectoryEntry[] }) {
  const t = useTranslations("Counterparties");
  const router = useRouter();
  const [role, setRole] = useState<PartyRole>("recipient");
  const [query, setQuery] = useState("");
  const [edit, setEdit] = useState<EditState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const visible = entries.filter(
    (entry) =>
      entry.role === role &&
      `${entry.name} ${entry.taxId} ${entry.aliases.map((a) => a.name).join(" ")}`
        .toLocaleLowerCase()
        .includes(query.toLocaleLowerCase()),
  );
  return (
    <div className="grid min-w-0 gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {(["recipient", "supplier"] as const).map((value) => (
          <Button
            key={value}
            onClick={() => setRole(value)}
            variant={role === value ? "default" : "outline"}
          >
            {t(value)}
          </Button>
        ))}
        <Button className="ml-auto" onClick={() => setEdit({ operation: "save", entry: null })}>
          {t("createNew")}
        </Button>
      </div>
      <Input
        aria-label={t("search")}
        placeholder={t("search")}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <TableShell className="max-w-full">
        <Table className="min-w-[850px]">
          <TableHeader>
            <TableRow>
              <TableHead>{t("name")}</TableHead>
              <TableHead>{t("taxId")}</TableHead>
              <TableHead>{t("documents")}</TableHead>
              <TableHead>{t("aliases")}</TableHead>
              <TableHead>{t("actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((entry) => (
              <TableRow key={entry.id}>
                <TableCell className="font-medium">{entry.name}</TableCell>
                <TableCell>
                  {entry.taxId.startsWith("name:") ? t("noTaxId") : entry.taxId}
                </TableCell>
                <TableCell>{entry.documentCount}</TableCell>
                <TableCell>
                  <div className="grid gap-2">
                    {entry.aliases.map((alias) => (
                      <div key={alias.id} className="flex items-center gap-2 text-xs">
                        <span className="max-w-xs break-words">
                          {alias.name} · {alias.contour} ·{" "}
                          {alias.scope
                            ? (entries.find((e) => e.role === "supplier" && e.taxId === alias.scope)
                                ?.name ?? alias.scope)
                            : t("allSuppliers")}
                        </span>
                        <Button
                          aria-label={t("removeAlias", { name: alias.name })}
                          disabled={pending}
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            startTransition(async () => {
                              const result = await removeCounterpartyAlias({ role, id: alias.id });
                              if (result.errorKey) setError(t(`errors.${result.errorKey}`));
                              else {
                                setError(null);
                                router.refresh();
                              }
                            })
                          }
                        >
                          ×
                        </Button>
                      </div>
                    ))}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setEdit({ operation: "save", entry })}
                    >
                      {t("rename")}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setEdit({ operation: "alias", entry })}
                    >
                      {t("addAlias")}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setEdit({ operation: "merge", entry })}
                    >
                      {t("merge")}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {!visible.length ? (
              <TableRow>
                <TableCell colSpan={5}>{t("empty")}</TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </TableShell>
      {edit ? (
        <DirectoryEditor
          key={`${edit.operation}:${edit.entry?.id ?? 0}:${role}`}
          role={role}
          state={edit}
          entries={entries}
          onClose={() => setEdit(null)}
          onSaved={() => {
            setEdit(null);
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}

function DirectoryEditor({
  role,
  state,
  entries,
  onClose,
  onSaved,
}: {
  role: PartyRole;
  state: EditState;
  entries: DirectoryEntry[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations("Counterparties");
  const schema = directoryFormSchema(t("errors.invalidInput"));
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      operation: state.operation,
      role,
      id: state.entry?.id ?? 0,
      name: state.operation === "save" ? (state.entry?.name ?? "") : "",
      taxId: state.entry?.taxId ?? "",
      contour: "UA",
      sourceSupplierTaxId: "",
      targetId: "",
    },
  });
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const title =
    state.operation === "save"
      ? state.entry
        ? t("rename")
        : t("createNew")
      : state.operation === "alias"
        ? t("addAlias")
        : t("merge");
  return (
    <AlertDialog open>
      <AlertDialogContent className="max-h-[90vh] overflow-auto">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>
            {state.operation === "merge"
              ? t("mergeHint", { name: state.entry?.name ?? "" })
              : t("editorHint")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Form {...form}>
          <form
            className="grid gap-4"
            onSubmit={form.handleSubmit((values) =>
              startTransition(async () => {
                setError(null);
                try {
                  const result =
                    values.operation === "save"
                      ? await saveCounterparty(values)
                      : values.operation === "alias"
                        ? await addCounterpartyAlias(values)
                        : await mergeCounterparties({
                            role: values.role,
                            sourceId: values.id,
                            targetId: Number(values.targetId),
                          });
                  if (result.errorKey) setError(t(`errors.${result.errorKey}`));
                  else onSaved();
                } catch {
                  setError(t("errors.saveFailed"));
                }
              }),
            )}
          >
            {state.operation !== "merge" ? (
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {state.operation === "alias" ? t("sourceName") : t("name")}
                    </FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : null}
            {state.operation === "save" && !state.entry ? (
              <FormField
                control={form.control}
                name="taxId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("taxIdOptional")}</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : null}
            {state.operation === "alias" ? (
              <>
                <FormField
                  control={form.control}
                  name="contour"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("contour")}</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="UA">{t("ua")}</SelectItem>
                          <SelectItem value="RU">{t("ru")}</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {role === "recipient" ? (
                  <FormField
                    control={form.control}
                    name="sourceSupplierTaxId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("sourceSupplier")}</FormLabel>
                        <Select
                          value={field.value || "global"}
                          onValueChange={(value) => field.onChange(value === "global" ? "" : value)}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="global">{t("allSuppliers")}</SelectItem>
                            {entries
                              .filter((e) => e.role === "supplier")
                              .map((entry) => (
                                <SelectItem key={entry.id} value={entry.taxId}>
                                  {entry.name}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                ) : null}
              </>
            ) : null}
            {state.operation === "merge" ? (
              <FormField
                control={form.control}
                name="targetId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("mergeTarget")}</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder={t("choose")} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {entries
                          .filter((e) => e.role === role && e.id !== state.entry?.id)
                          .map((entry) => (
                            <SelectItem key={entry.id} value={String(entry.id)}>
                              {entry.name}
                              {entry.taxId.startsWith("name:") ? "" : ` · ${entry.taxId}`}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : null}
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" disabled={pending} onClick={onClose}>
                {t("cancel")}
              </Button>
              <Button disabled={pending} type="submit">
                {pending
                  ? t("pending")
                  : state.operation === "merge"
                    ? t("mergeConfirm")
                    : t("save")}
              </Button>
            </div>
          </form>
        </Form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
