"use client";

import { LoaderCircle, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { deleteDocument } from "@/app/actions/documents";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";

type DeleteDocumentButtonProps = {
  documentId: number;
  locale: string;
};

export function DeleteDocumentButton({ documentId, locale }: DeleteDocumentButtonProps) {
  const router = useRouter();
  const t = useTranslations("Dashboard");
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="grid gap-2">
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={isPending}
            onClick={() => {
              setError(null);
            }}
          >
            {isPending ? <LoaderCircle className="animate-spin" /> : <Trash2 />}
            {t("deleteAction")}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent
          className="rounded-[28px] border-[color:var(--line)] bg-[color:var(--panel-strong)] shadow-[var(--shadow)]"
          size="sm"
        >
          <AlertDialogHeader className="place-items-start text-left">
            <AlertDialogTitle className="font-[var(--font-display)] text-[1.5rem] leading-tight tracking-[-0.03em] text-[color:var(--ink)]">
              {t("deleteTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-[color:var(--ink-soft)]">
              {t("deleteConfirm")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel variant="secondary">{t("deleteCancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={isPending}
              onClick={(event) => {
                event.preventDefault();
                startTransition(async () => {
                  const result = await deleteDocument({ documentId, locale });

                  if (result.errorKey) {
                    setError(t(`messages.${result.errorKey}`));
                    return;
                  }

                  setOpen(false);
                  router.refresh();
                });
              }}
            >
              {isPending ? <LoaderCircle className="animate-spin" /> : <Trash2 />}
              {t("deleteAction")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {error ? <p className="text-sm text-[color:var(--accent-strong)]">{error}</p> : null}
    </div>
  );
}
