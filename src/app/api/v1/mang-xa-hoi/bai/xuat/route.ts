import { NextResponse } from "next/server";
import { xuLyApi } from "@/lib/api";
import { xuatCsvBai } from "@/modules/mang-xa-hoi/bai";

export const GET = xuLyApi(async (nc) => {
  const csv = await xuatCsvBai(nc);
  return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="bai-mang-xa-hoi.csv"' } });
}, { quyen: "mxh.export" });
