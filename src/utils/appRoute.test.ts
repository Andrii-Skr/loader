import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const authMock = vi.hoisted(() => vi.fn());

vi.mock("@/auth", () => ({
  auth: authMock,
}));

vi.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) => Response.json(body, init) as unknown as Response,
  },
}));

import { apiRoute } from "@/utils/appRoute";
import { NextResponse } from "next/server";

type MockRequestInit = {
  body?: unknown;
  method?: string;
};

const createRequest = ({ body, method = "GET" }: MockRequestInit = {}) =>
  ({
    method,
    json: vi.fn(async () => {
      if (body instanceof Error) {
        throw body;
      }

      return body;
    }),
  }) as never;

describe("apiRoute", () => {
  beforeEach(() => {
    authMock.mockReset();
    authMock.mockResolvedValue(null);
  });

  it("does not call auth for public routes", async () => {
    const route = apiRoute(async () => NextResponse.json({ ok: true }));

    const response = await route(createRequest());

    expect(response.status).toBe(200);
    expect(authMock).not.toHaveBeenCalled();
  });

  it("returns the handler response for a successful request", async () => {
    const route = apiRoute(async () => NextResponse.json({ ok: true }));

    const response = await route(createRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it("returns 400 for invalid JSON body", async () => {
    const route = apiRoute(async () => NextResponse.json({ ok: true }));

    const response = await route(
      createRequest({
        method: "POST",
        body: new Error("bad json"),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      errorCode: "INVALID_JSON_BODY",
    });
  });

  it("returns 400 for schema validation failures", async () => {
    const route = apiRoute(async () => NextResponse.json({ ok: true }), {
      schema: z.object({
        name: z.string().min(1),
      }),
    });

    const response = await route(
      createRequest({
        method: "POST",
        body: { name: "" },
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      errorCode: "VALIDATION_ERROR",
    });
  });

  it("returns 401 when auth is required and session is missing", async () => {
    const route = apiRoute(async () => NextResponse.json({ ok: true }), {
      requireAuth: true,
    });

    const response = await route(createRequest());

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      errorCode: "UNAUTHORIZED",
    });
  });

  it("returns 403 when the user role is not allowed", async () => {
    authMock.mockResolvedValue({
      user: {
        id: 1,
        role: "OPERATOR",
      },
    });

    const route = apiRoute(async () => NextResponse.json({ ok: true }), {
      roles: ["ADMIN"],
    });

    const response = await route(createRequest());

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      errorCode: "FORBIDDEN",
    });
  });

  it("returns 500 for unhandled errors", async () => {
    const route = apiRoute(async () => {
      throw new Error("boom");
    });

    const response = await route(createRequest());

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      errorCode: "INTERNAL_SERVER_ERROR",
    });
  });
});
