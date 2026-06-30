import type { UserRole } from "@/generated/prisma/client";
import type { Session } from "next-auth";
import type { SafeParseReturnType } from "zod";

import { auth } from "@/auth";

type ActionContext = {
  session: Session | null;
  user: Session["user"] | null;
};

export type AppActionSchema<TInput, TParsed> = {
  safeParse: (input: TInput) => SafeParseReturnType<TInput, TParsed>;
};

export type AppActionAbort<TResult> = {
  ok: false;
  result: TResult;
};

export type AppActionPrepared<TValue, TResult> =
  | {
      ok: true;
      value: TValue;
    }
  | AppActionAbort<TResult>;

type AppActionOptions<TInput, TParsed, TResult> = {
  schema?: AppActionSchema<TInput, TParsed>;
  requireAuth?: boolean;
  roles?: UserRole[];
  onForbidden?: () => TResult;
  onInvalidInput?: () => TResult;
  onUnauthorized?: () => TResult;
};

type AppFormDataActionOptions<TPrepared, TParsed, TResult> = {
  prepareInput?: (
    formData: FormData,
  ) => Promise<AppActionPrepared<TPrepared, TResult>> | AppActionPrepared<TPrepared, TResult>;
  schema?: AppActionSchema<TPrepared, TParsed>;
  requireAuth?: boolean;
  roles?: UserRole[];
  onForbidden?: () => TResult;
  onInvalidInput?: () => TResult;
  onUnauthorized?: () => TResult;
};

type ActionHandler<TParsed, TResult> = (input: TParsed, context: ActionContext) => Promise<TResult>;

const hasRequiredRole = (userRole: UserRole | null, roles: UserRole[]) =>
  roles.length === 0 || (userRole !== null && roles.includes(userRole));

const getActionContext = async <TResult>(
  options: Pick<
    AppActionOptions<unknown, unknown, TResult>,
    "onForbidden" | "onUnauthorized" | "requireAuth" | "roles"
  >,
): Promise<{ context: ActionContext } | AppActionAbort<TResult>> => {
  const session = await auth();
  const user = session?.user ?? null;
  const requiresAuth = options.requireAuth || Boolean(options.roles?.length);

  if (requiresAuth && !user) {
    if (options.onUnauthorized) {
      return {
        ok: false,
        result: options.onUnauthorized(),
      };
    }

    throw new Error("Unauthorized server action invocation.");
  }

  if (options.roles?.length) {
    const userRole = user?.role ?? null;

    if (!hasRequiredRole(userRole, options.roles)) {
      if (options.onForbidden) {
        return {
          ok: false,
          result: options.onForbidden(),
        };
      }

      throw new Error("Forbidden server action invocation.");
    }
  }

  return {
    context: { session, user },
  };
};

export const abortAction = <TResult>(result: TResult): AppActionAbort<TResult> => ({
  ok: false,
  result,
});

export const continueAction = <TValue, TResult>(
  value: TValue,
): AppActionPrepared<TValue, TResult> => ({
  ok: true,
  value,
});

export function appAction<TInput, TParsed = TInput, TResult = void>(
  handler: ActionHandler<TParsed, TResult>,
  options: AppActionOptions<TInput, TParsed, TResult> = {},
) {
  return async (input: TInput): Promise<TResult> => {
    const actionContext = await getActionContext(options);

    if (!("context" in actionContext)) {
      return actionContext.result;
    }

    let parsedInput = input as unknown as TParsed;

    if (options.schema) {
      const parsed = options.schema.safeParse(input);

      if (!parsed.success) {
        if (options.onInvalidInput) {
          return options.onInvalidInput();
        }

        throw parsed.error;
      }

      parsedInput = parsed.data;
    }

    return handler(parsedInput, actionContext.context);
  };
}

export function appFormDataAction<TPrepared, TParsed = TPrepared, TResult = void>(
  handler: ActionHandler<TParsed, TResult>,
  options: AppFormDataActionOptions<TPrepared, TParsed, TResult> = {},
) {
  return async (formData: FormData): Promise<TResult> => {
    const actionContext = await getActionContext(options);

    if (!("context" in actionContext)) {
      return actionContext.result;
    }

    let preparedInput = continueAction<TPrepared, TResult>(formData as unknown as TPrepared);

    if (options.prepareInput) {
      preparedInput = await options.prepareInput(formData);
    }

    if (preparedInput.ok === false) {
      return preparedInput.result;
    }

    let parsedInput = preparedInput.value as unknown as TParsed;

    if (options.schema) {
      const parsed = options.schema.safeParse(preparedInput.value);

      if (!parsed.success) {
        if (options.onInvalidInput) {
          return options.onInvalidInput();
        }

        throw parsed.error;
      }

      parsedInput = parsed.data;
    }

    return handler(parsedInput, actionContext.context);
  };
}
