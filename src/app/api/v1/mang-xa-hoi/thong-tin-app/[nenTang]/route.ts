import { docThan, xuLyApi } from "@/lib/api";
import { LuocDoThongTinApp } from "@/modules/mang-xa-hoi/luoc-do";
import { luuThongTinApp, xoaBiMatApp } from "@/modules/mang-xa-hoi/nen-tang-app";

export const PUT = xuLyApi<{ nenTang: string }>(async (nc, req, { nenTang }) => luuThongTinApp(nc, nenTang.toUpperCase(), await docThan(req, LuocDoThongTinApp)), { quyen: "setting.update" });
export const DELETE = xuLyApi<{ nenTang: string }>((nc, _req, { nenTang }) => xoaBiMatApp(nc, nenTang.toUpperCase()), { quyen: "setting.update" });
