import { beforeEach, describe, expect, it, vi } from "vitest";

const queryRawMock = vi.hoisted(() => vi.fn());
const authMock = vi.hoisted(() => vi.fn());

vi.mock("@/auth", () => ({
  auth: authMock,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRaw: queryRawMock,
  },
}));

vi.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) => Response.json(body, init) as unknown as Response,
  },
}));

import { GET } from "@/app/api/health/route";

describe("GET /api/health", () => {
  beforeEach(() => {
    authMock.mockReset();
    queryRawMock.mockReset();
  });

  it("returns ready when the primary database responds", async () => {
    queryRawMock.mockResolvedValue([{ "?column?": 1 }]);

    const response = await GET({ method: "GET" } as never);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, service: "zenit-loader" });
    expect(queryRawMock).toHaveBeenCalledOnce();
    expect(authMock).not.toHaveBeenCalled();
  });

  it("returns unavailable when the primary database cannot be reached", async () => {
    queryRawMock.mockRejectedValue(new Error("connection refused"));

    const response = await GET({ method: "GET" } as never);

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ ok: false, service: "zenit-loader" });
  });
});
