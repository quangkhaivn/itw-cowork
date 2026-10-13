import { z } from "zod";
import { khiCoSuKienKhach } from "@/modules/khach-hang/su-kien-khach";
import type { NguCanh } from "@/lib/api";
import { batBuocQuyen } from "@/lib/phan-quyen";
import { LoiDinhDang, LoiKhongTimThay, LoiNghiepVu } from "@/lib/loi";
import { SU_KIEN } from "@/lib/su-kien";
import { chuoiTuyChon, thoiDiemTuyChon, uuidTuyChon } from "@/modules/crm/chung";
import { LOAI_TUONG_TAC } from "@/modules/crm/hang-so";
import { batBuocThayKhach } from "@/modules/khach-hang/service";
import { batBuocThayCoHoi } from "@/modules/co-hoi/service";
import { batBuocThayLead } from "@/modules/lead/service";

/**
 * Tương tác — việc ĐÃ xảy ra với khách: gọi, email, Zalo, gặp, thăm, ghi chú.
 * Luật TT-01 → TT-04. Quyền `crm.create` để ghi; xem theo bản ghi mà tương tác gắn vào.
 */

export const LuocDoGhiTuongTac = z
  .object({
    loai: z.enum(LOAI_TUONG_TAC),
    tieuDe: z.string().trim().min(2, "Nhập tóm tắt (tối thiểu 2 ký tự).").max(255),
    noiDung: chuoiTuyChon(10_000),
    ketQua: chuoiTuyChon(255),
    luc: thoiDiemTuyChon,
    khachHangId: uuidTuyChon,
    lienHeId: uuidTuyChon,
    leadId: uuidTuyChon,
    coHoiId: uuidTuyChon,
  })
  .refine((d) => d.khachHangId || d.leadId || d.coHoiId, { message: "Tương tác phải gắn với khách hàng, lead hoặc cơ hội.", path: ["khachHangId"] });
export type DuLieuGhiTuongTac = z.infer<typeof LuocDoGhiTuongTac>;

export async function ghiTuongTac(nc: NguCanh, d: DuLieuGhiTuongTac) {
  batBuocQuyen(nc.hoSo, "crm.create", { objectType: "interaction" });

  let khachId = d.khachHangId ?? null;
  // TT-03: gắn cơ hội thì tự gắn khách của cơ hội.
  if (d.coHoiId) {
    const ch = await batBuocThayCoHoi(nc, d.coHoiId);
    if (khachId && khachId !== ch.khachHang.id) throw new LoiDinhDang("coHoiId", "Cơ hội không thuộc khách hàng này.");
    khachId = ch.khachHang.id;
  } else if (khachId) {
    await batBuocThayKhach(nc, khachId);
  }

  let leadMoiLienHe = false;
  if (d.leadId) {
    const lead = await batBuocThayLead(nc, d.leadId);
    if (lead.giaiDoan === "CONVERTED") {
      throw new LoiNghiepVu("Lead đã chuyển đổi — ghi tương tác trên khách hàng hoặc cơ hội.", 409, "da-chuyen-doi");
    }
    leadMoiLienHe = lead.giaiDoan === "NEW_LEAD";
  }

  if (d.lienHeId) {
    const lh = await nc.tx.contact.findFirst({ where: { id: d.lienHeId, ...(khachId && { customerId: khachId }) }, select: { id: true } });
    if (!lh || !khachId) throw new LoiDinhDang("lienHeId", "Liên hệ không thuộc khách hàng này.");
  }

  const luc = d.luc ?? new Date();
  if (luc.getTime() > Date.now() + 5 * 60 * 1000) {
    throw new LoiDinhDang("luc", "Tương tác là việc đã xảy ra — không chọn thời điểm trong tương lai. Việc sắp làm hãy tạo Công việc.");
  }

  const t = await nc.tx.interaction.create({
    data: {
      tenantId: nc.tenantId,
      type: d.loai,
      subject: d.tieuDe,
      content: d.noiDung ?? null,
      outcome: d.ketQua ?? null,
      occurredAt: luc,
      customerId: khachId,
      contactId: d.lienHeId ?? null,
      leadId: d.leadId ?? null,
      opportunityId: d.coHoiId ?? null,
      ownerId: nc.hoSo.userId,
      createdBy: nc.hoSo.userId,
      updatedBy: nc.hoSo.userId,
    },
    select: { id: true, type: true, subject: true, occurredAt: true, customerId: true, leadId: true, opportunityId: true },
  });
  await nc.kiemToan({ action: "tao", objectType: "interaction", objectId: t.id, after: { ...t, occurredAt: t.occurredAt.toISOString() } });
  await nc.suKien({
    eventType: SU_KIEN.INTERACTION_LOGGED,
    objectType: "interaction",
    objectId: t.id,
    payload: { loai: d.loai, khachHangId: khachId, leadId: d.leadId ?? null, coHoiId: d.coHoiId ?? null },
  });

  // LD-04: tương tác đầu tiên trên lead mới → "Đã liên hệ".
  if (d.leadId && leadMoiLienHe) {
    await nc.tx.lead.update({ where: { id: d.leadId }, data: { stage: "CONTACTED", updatedBy: nc.hoSo.userId } });
    await nc.kiemToan({ action: "doi-giai-doan", objectType: "lead", objectId: d.leadId, before: { giaiDoan: "NEW_LEAD" }, after: { giaiDoan: "CONTACTED" } });
    await nc.suKien({ eventType: SU_KIEN.LEAD_CONTACTED, objectType: "lead", objectId: d.leadId, payload: { tuongTacId: t.id } });
  }
  // 0.16.0: tương tác mới làm đổi điểm khách (KHN-09).
  await khiCoSuKienKhach(nc, khachId);
  return t;
}

/** TT-04: chỉ người ghi mới ẩn được tương tác của mình (sửa sai). Không xóa cứng. */
export async function anTuongTac(nc: NguCanh, id: string) {
  batBuocQuyen(nc.hoSo, "crm.update", { objectType: "interaction", objectId: id });
  const t = await nc.tx.interaction.findFirst({ where: { id, status: "hoat-dong" }, select: { id: true, ownerId: true, subject: true } });
  if (!t) throw new LoiKhongTimThay("Tương tác");
  if (t.ownerId !== nc.hoSo.userId) throw new LoiNghiepVu("Chỉ người ghi tương tác mới ẩn được nó.", 403, "khong-phai-nguoi-ghi");
  await nc.tx.interaction.update({ where: { id }, data: { status: "ngung-hoat-dong", updatedBy: nc.hoSo.userId } });
  await nc.kiemToan({ action: "sua", objectType: "interaction", objectId: id, before: { trangThai: "hoat-dong" }, after: { trangThai: "ngung-hoat-dong" } });
  return { ok: true };
}
