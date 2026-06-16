"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { loginWithCredentials } from "@/app/actions/auth";
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
import { useRouter } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";

type LoginFormValues = {
  login: string;
  password: string;
};

export function LoginForm({ locale }: { locale: AppLocale }) {
  const router = useRouter();
  const t = useTranslations("Login");
  const [serverError, setServerError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const loginSchema = z.object({
    login: z.string().min(3, t("errors.login")).max(64, t("errors.login")),
    password: z.string().min(8, t("errors.password")),
  });
  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      login: "",
      password: "",
    },
  });

  const onSubmit = (values: LoginFormValues) => {
    setServerError(null);

    startTransition(async () => {
      const result = await loginWithCredentials(locale, values);

      if (result.errorKey) {
        setServerError(t(`errors.${result.errorKey}`));
        return;
      }

      router.push("/dashboard", { locale });
      router.refresh();
    });
  };

  return (
    <Form {...form}>
      <form className="grid gap-4" onSubmit={form.handleSubmit(onSubmit)}>
        <FormField
          control={form.control}
          name="login"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("loginLabel")}</FormLabel>
              <FormControl>
                <Input autoComplete="username" type="text" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("passwordLabel")}</FormLabel>
              <FormControl>
                <Input autoComplete="current-password" type="password" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {serverError ? (
          <p className="text-sm text-[color:var(--accent-strong)]">{serverError}</p>
        ) : null}

        <Button disabled={isPending} type="submit">
          {isPending ? <LoaderCircle className="animate-spin" /> : null}
          {isPending ? t("pending") : t("submit")}
        </Button>
      </form>
    </Form>
  );
}
