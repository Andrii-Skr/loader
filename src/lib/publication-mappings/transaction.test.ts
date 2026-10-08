import { Prisma } from "@/generated/prisma/client";
import { beforeEach, expect, it, vi } from "vitest";
const transaction = vi.hoisted(() => vi.fn());
vi.mock("@/lib/prisma", () => ({ prisma: { $transaction: transaction } }));
import { runMappingTransaction } from "./transaction";
beforeEach(() => {
  transaction.mockReset();
});
it("returns the result of a successful retry", async () => {
  transaction
    .mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("Conflict", { code: "P2034", clientVersion: "7" }),
    )
    .mockResolvedValueOnce(true);
  expect(await runMappingTransaction(async () => true)).toBe(true);
  expect(transaction).toHaveBeenCalledTimes(2);
});
it("limits conflicts to three attempts", async () => {
  const conflict = new Prisma.PrismaClientKnownRequestError("Conflict", {
    code: "P2034",
    clientVersion: "7",
  });
  transaction.mockRejectedValue(conflict);
  await expect(runMappingTransaction(async () => true)).rejects.toBe(conflict);
  expect(transaction).toHaveBeenCalledTimes(3);
});
it("does not retry unrelated failures", async () => {
  const error = new Error("Unavailable");
  transaction.mockRejectedValue(error);
  await expect(runMappingTransaction(async () => true)).rejects.toBe(error);
  expect(transaction).toHaveBeenCalledTimes(1);
});
