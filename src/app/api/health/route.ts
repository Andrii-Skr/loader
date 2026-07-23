import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { apiRoute } from "@/utils/appRoute";

export const GET = apiRoute(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;

    return NextResponse.json({ ok: true, service: "zenit-loader" });
  } catch {
    return NextResponse.json({ ok: false, service: "zenit-loader" }, { status: 503 });
  }
});
