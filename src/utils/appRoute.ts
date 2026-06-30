import { Prisma, type UserRole } from "@/generated/prisma/client";
import type { Session } from "next-auth";
import { type NextRequest, NextResponse } from "next/server";
import type { ZodSchema } from "zod";

import { auth } from "@/auth";

export type RouteContext<T extends Record<string, string> = Record<string, never>> = {
  params?: Promise<T>;
};

export type ApiHandler<
  TBody = unknown,
  TParams extends Record<string, string> = Record<string, never>,
> = (
  req: NextRequest,
  body: TBody,
  params: TParams,
  user: Session["user"] | null,
) => Promise<NextResponse>;

export type ApiRouteOptions<TBody = unknown> = {
  requireAuth?: boolean;
  roles?: UserRole[];
  schema?: ZodSchema<TBody>;
};

type ApiErrorWithMeta = Error & {
  status?: unknown;
  code?: unknown;
};

function errorJson(
  status: number,
  message: string,
  errorCode: string,
  extra?: Record<string, unknown>,
): NextResponse {
  return NextResponse.json(
    {
      success: false,
      message,
      errorCode,
      ...(extra ?? {}),
    },
    { status },
  );
}

function defaultMessageForStatus(status: number): string {
  switch (status) {
    case 400:
      return "Bad request";
    case 401:
      return "Unauthorized";
    case 403:
      return "Forbidden";
    case 404:
      return "Not found";
    case 409:
      return "Conflict";
    default:
      return "Internal server error.";
  }
}

function defaultCodeForStatus(status: number): string {
  switch (status) {
    case 400:
      return "BAD_REQUEST";
    case 401:
      return "UNAUTHORIZED";
    case 403:
      return "FORBIDDEN";
    case 404:
      return "NOT_FOUND";
    case 409:
      return "CONFLICT";
    default:
      return "INTERNAL_SERVER_ERROR";
  }
}

function getErrorMeta(
  err: unknown,
): { status: number; errorCode: string | null; message: string | null } | null {
  if (!(err instanceof Error)) {
    return null;
  }

  const withMeta = err as ApiErrorWithMeta;
  const rawStatus = withMeta.status;

  if (!Number.isFinite(rawStatus as number)) {
    return null;
  }

  const status = Math.trunc(rawStatus as number);

  if (status < 400 || status > 599) {
    return null;
  }

  const errorCode =
    typeof withMeta.code === "string" && withMeta.code.trim().length > 0
      ? String(withMeta.code).trim()
      : null;
  const message =
    typeof withMeta.message === "string" && withMeta.message.trim().length > 0
      ? withMeta.message
      : null;

  return { status, errorCode, message };
}

function hasRequiredRole(userRole: UserRole | null, allowedRoles: UserRole[]): boolean {
  if (allowedRoles.length === 0) {
    return true;
  }

  return userRole !== null && allowedRoles.includes(userRole);
}

export function apiRoute<
  TBody = unknown,
  TParams extends Record<string, string> = Record<string, never>,
>(handler: ApiHandler<TBody, TParams>, options: ApiRouteOptions<TBody> = {}) {
  return async function route(
    req: NextRequest,
    context: RouteContext<TParams> = {},
  ): Promise<NextResponse> {
    let bodyRaw: unknown = undefined;

    try {
      const resolvedParams = context.params ? await context.params : ({} as TParams);
      const needsBody = !["GET", "HEAD", "OPTIONS", "DELETE"].includes(req.method);
      const requiresAuth = options.requireAuth || Boolean(options.roles?.length);

      if (needsBody) {
        try {
          bodyRaw = await req.json();
        } catch {
          return errorJson(400, "Invalid JSON body", "INVALID_JSON_BODY");
        }

        if (options.schema) {
          const parsed = options.schema.safeParse(bodyRaw);

          if (!parsed.success) {
            return errorJson(400, "Validation error", "VALIDATION_ERROR", {
              errors: parsed.error.format(),
            });
          }

          bodyRaw = parsed.data;
        }
      }

      let user: Session["user"] | null = null;

      if (requiresAuth) {
        const session = await auth();
        user = session?.user ?? null;

        if (!user) {
          return errorJson(401, "Unauthorized", "UNAUTHORIZED");
        }

        if (options.roles?.length) {
          const userRole = user.role ?? null;

          if (!hasRequiredRole(userRole, options.roles)) {
            return errorJson(403, "Forbidden", "FORBIDDEN");
          }
        }
      }

      return await handler(req, bodyRaw as TBody, resolvedParams, user);
    } catch (err: unknown) {
      console.error("API ERROR CAUGHT:", err);
      console.error("API Error:", err);

      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        if (err.code === "P2002") {
          return errorJson(409, "Duplicate entry. Resource already exists.", "DUPLICATE_ENTRY", {
            meta: err.meta,
          });
        }

        if (err.code === "P2025") {
          return errorJson(404, "Record not found.", "RECORD_NOT_FOUND", {
            meta: err.meta,
          });
        }
      }

      const meta = getErrorMeta(err);

      if (meta) {
        const errorCode = meta.errorCode ?? defaultCodeForStatus(meta.status);
        const message =
          meta.status >= 500
            ? defaultMessageForStatus(meta.status)
            : (meta.message ?? defaultMessageForStatus(meta.status));

        return errorJson(meta.status, message, errorCode);
      }

      return errorJson(500, "Internal server error.", "INTERNAL_SERVER_ERROR");
    }
  };
}

export const appRoute = apiRoute;
