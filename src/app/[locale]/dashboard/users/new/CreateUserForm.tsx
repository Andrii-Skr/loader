"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2, LoaderCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState, useTransition } from "react";
import { useForm } from "react-hook-form";

import { createUser } from "@/app/actions/users";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
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
  type CreatableUserRole,
  type CreateUserInput,
  createUserInputSchema,
} from "@/lib/auth/user-creation";

const defaultValues: CreateUserInput = {
  name: "",
  login: "",
  password: "",
  passwordConfirmation: "",
  role: "OPERATOR",
};

export function CreateUserForm() {
  const t = useTranslations("UserCreation");
  const [serverError, setServerError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const schema = useMemo(
    () =>
      createUserInputSchema({
        name: t("errors.name"),
        login: t("errors.login"),
        password: t("errors.password"),
        passwordConfirmation: t("errors.passwordConfirmation"),
      }),
    [t],
  );
  const form = useForm<CreateUserInput>({
    resolver: zodResolver(schema),
    defaultValues,
  });

  const onSubmit = (values: CreateUserInput) => {
    setServerError(null);
    setSuccessMessage(null);

    startTransition(async () => {
      const result = await createUser(values);

      if (result.errorKey) {
        setServerError(t(`errors.${result.errorKey}`));
        return;
      }

      form.reset(defaultValues);
      setSuccessMessage(t("success"));
    });
  };

  return (
    <Form {...form}>
      <form className="grid gap-5" onSubmit={form.handleSubmit(onSubmit)}>
        <div className="grid gap-5 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("nameLabel")}</FormLabel>
                <FormControl>
                  <Input autoComplete="name" disabled={isPending} type="text" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="login"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("loginLabel")}</FormLabel>
                <FormControl>
                  <Input autoComplete="username" disabled={isPending} type="text" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="role"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("roleLabel")}</FormLabel>
              <Select
                disabled={isPending}
                onValueChange={(value) => field.onChange(value as CreatableUserRole)}
                value={field.value}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="OPERATOR">{t("roles.OPERATOR")}</SelectItem>
                  <SelectItem value="ADMIN">{t("roles.ADMIN")}</SelectItem>
                </SelectContent>
              </Select>
              <FormDescription>{t("roleDescription")}</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid gap-5 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("passwordLabel")}</FormLabel>
                <FormControl>
                  <Input
                    autoComplete="new-password"
                    disabled={isPending}
                    type="password"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="passwordConfirmation"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("passwordConfirmationLabel")}</FormLabel>
                <FormControl>
                  <Input
                    autoComplete="new-password"
                    disabled={isPending}
                    type="password"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div aria-live="polite" className="min-h-6">
          {serverError ? (
            <p className="m-0 text-sm text-[color:var(--accent-strong)]">{serverError}</p>
          ) : null}
          {successMessage ? (
            <p className="m-0 flex items-center gap-2 text-sm text-[color:var(--success)]">
              <CheckCircle2 className="size-4" />
              {successMessage}
            </p>
          ) : null}
        </div>

        <Button className="w-full sm:w-auto" disabled={isPending} size="lg" type="submit">
          {isPending ? <LoaderCircle className="animate-spin" /> : null}
          {isPending ? t("pending") : t("submit")}
        </Button>
      </form>
    </Form>
  );
}
