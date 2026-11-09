import { z } from "zod";
import { docThan, docTruyVan, xuLyApi } from "@/lib/api";
import { LuocDoCongTayLuong } from "@/modules/luong/luoc-do";
import { nhapCongTayLuong, xoaCongTayLuong } from "@/modules/luong/service";

export const dynamic = "force-dynamic";

/** 0.22.0 (QĐ-172): PUT — nhập / sửa công tay của một người trên kỳ lương nháp. Quyền kiểm ở service (luong.create / luong.update + 2 lớp). */
export const PUT = xuLyApi<{ id: string }>(async (nc, req, { id }) => nhapCongTayLuong(nc, id, await docThan(req, LuocDoCongTayLuong)));
/** DELETE ?nguoiId= — bỏ công nhập tay (dòng quay về mặc định / bảng công). */
export const DELETE = xuLyApi<{ id: string }>(async (nc, req, { id }) => xoaCongTayLuong(nc, id, docTruyVan(req, z.object({ nguoiId: z.uuid() })).nguoiId));
