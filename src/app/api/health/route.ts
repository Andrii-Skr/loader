import { NextResponse } from "next/server";

import { apiRoute } from "@/utils/appRoute";

export const GET = apiRoute(async () => NextResponse.json({ ok: true, service: "zenit-loader" }));
