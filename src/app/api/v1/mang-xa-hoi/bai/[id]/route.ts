import { docThan, xuLyApi } from "@/lib/api";
import { chiTietBai, suaBai, xoaBai } from "@/modules/mang-xa-hoi/bai";
import { LuocDoBai } from "@/modules/mang-xa-hoi/luoc-do";

export const GET = xuLyApi<{ id: string }>((nc, _req, { id }) => chiTietBai(nc, id), { quyen: "mxh.view" });
export const PUT = xuLyApi<{ id: string }>(async (nc, req, { id }) => suaBai(nc, id, await docThan(req, LuocDoBai)), { quyen: "mxh.view" });
export const DELETE = xuLyApi<{ id: string }>((nc, _req, { id }) => xoaBai(nc, id), { quyen: "mxh.view" });
