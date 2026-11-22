import type { NextRequest } from "next/server";
import { docThan, xuLyApi, type NguCanh } from "@/lib/api";
import { LoiKhongTimThay } from "@/lib/loi";
import { dangLai, dangNgay, duyetBai, guiDuyet, henGio, huyLich, rutDuyet, traLaiBai, veNhap } from "@/modules/mang-xa-hoi/bai";
import { LuocDoGhiChu, LuocDoGuiDuyet, LuocDoHenGio, LuocDoTraLai } from "@/modules/mang-xa-hoi/luoc-do";

/** Thao tác trên bài: gửi duyệt, rút, duyệt, trả lại, đăng ngay, hẹn giờ, hủy lịch, đăng lại, về nháp. Quyền chi tiết kiểm trong service. */
const THAO_TAC: Record<string, (nc: NguCanh, req: NextRequest, id: string) => Promise<unknown>> = {
  "gui-duyet": async (nc, req, id) => guiDuyet(nc, id, await docThan(req, LuocDoGuiDuyet)),
  "rut-duyet": (nc, _req, id) => rutDuyet(nc, id),
  duyet: async (nc, req, id) => duyetBai(nc, id, (await docThan(req, LuocDoGhiChu)).ghiChu ?? null),
  "tra-lai": async (nc, req, id) => traLaiBai(nc, id, (await docThan(req, LuocDoTraLai)).lyDo),
  "dang-ngay": (nc, _req, id) => dangNgay(nc, id),
  "hen-gio": async (nc, req, id) => henGio(nc, id, (await docThan(req, LuocDoHenGio)).henLuc),
  "huy-lich": (nc, _req, id) => huyLich(nc, id),
  "dang-lai": (nc, _req, id) => dangLai(nc, id),
  "ve-nhap": (nc, _req, id) => veNhap(nc, id),
};

export const POST = xuLyApi<{ id: string; hanhDong: string }>((nc, req, { id, hanhDong }) => {
  const f = THAO_TAC[hanhDong];
  if (!f) throw new LoiKhongTimThay("Thao tác");
  return f(nc, req, id);
}, { quyen: "mxh.view" });
