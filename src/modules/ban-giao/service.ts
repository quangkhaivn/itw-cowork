import { z } from "zod";
import type { NguCanh } from "@/lib/api";
import type { ClientTenant } from "@/lib/db";
import { batBuocQuyen } from "@/lib/phan-quyen";
import { LoiKhongTimThay, LoiNghiepVu } from "@/lib/loi";
import { SU_KIEN } from "@/lib/su-kien";
import { suaNguoiDung } from "@/modules/nguoi-dung/service";
import { layHoSoQuyen } from "@/lib/phan-quyen";

/**
 * Bàn giao khi nhân viên nghỉ việc — BUSINESS_RULES.md mục 21 (KHN-17). QĐ-53.
 *
 * Một thao tác của người quản trị người dùng (`user.update`): chuyển mọi việc ĐANG DỞ của
 * người A sang người B rồi khóa tài khoản A — cùng MỘT giao dịch. Việc đã xong (tương tác đã
 * ghi, cơ hội đã đóng, báo giá đã chốt, đơn đã giao, hóa đơn đã hủy…) giữ nguyên người làm,
 * vì đó là lịch sử: ai đã làm việc gì không được viết lại.
 *
 * Khóa A đi qua đúng `suaNguoiDung()` nên các bất biến quản trị (không tự khóa mình, luôn
 * còn một Giám đốc/Quản trị) vẫn được giữ.
 */

export const LuocDoBanGiao = z.object({
  nguoiNhanId: z.uuid("Chọn người nhận bàn giao."),
  khoaTaiKhoan: z.boolean().optional().default(true),
  ghiChu: z
    .string()
    .trim()
    .max(1000)
    .transform((s) => (s ? s : null))
    .nullable()
    .optional(),
});

interface LoaiBanGiao {
  ma: string;
  nhan: string;
  /** Người nhận phải có ít nhất một quyền xem này — không giao việc cho người không mở nổi việc đó. */
  quyenXem: string[];
  dem(tx: ClientTenant, tu: string): Promise<number>;
  chuyen(tx: ClientTenant, tu: string, sang: string, nguoi: string): Promise<number>;
}

const LEAD_MO = ["NEW_LEAD", "CONTACTED", "QUALIFIED"];
const CO_HOI_MO = ["OPPORTUNITY", "QUOTATION", "NEGOTIATION"];
const VIEC_MO = ["mo", "dang-lam"];
const BAO_GIA_CHUA_CHOT = ["DRAFT", "PENDING_APPROVAL", "APPROVED", "SENT", "VIEWED", "NEGOTIATING"];
const DON_DANG_XU_LY = ["DRAFT", "CONFIRMED", "PARTIALLY_DELIVERED"];
const PHIEU_MO = ["MOI", "DANG_XU_LY", "CHO_KHACH"];
const BAO_TRI_CON = ["hieu-luc", "tam-dung"];

/** Danh mục loại việc được bàn giao. Thêm loại mới: thêm một phần tử. */
export const LOAI_BAN_GIAO: LoaiBanGiao[] = [
  {
    ma: "khach-hang",
    nhan: "Khách hàng phụ trách",
    quyenXem: ["customer.view"],
    dem: (tx, tu) => tx.customer.count({ where: { ownerId: tu } }),
    chuyen: async (tx, tu, sang, n) => (await tx.customer.updateMany({ where: { ownerId: tu }, data: { ownerId: sang, updatedBy: n } })).count,
  },
  {
    ma: "lead",
    nhan: "Lead đang mở",
    quyenXem: ["crm.view"],
    dem: (tx, tu) => tx.lead.count({ where: { ownerId: tu, stage: { in: LEAD_MO } } }),
    chuyen: async (tx, tu, sang, n) => (await tx.lead.updateMany({ where: { ownerId: tu, stage: { in: LEAD_MO } }, data: { ownerId: sang, updatedBy: n } })).count,
  },
  {
    ma: "co-hoi",
    nhan: "Cơ hội đang mở",
    quyenXem: ["sales.view"],
    dem: (tx, tu) => tx.opportunity.count({ where: { ownerId: tu, stage: { in: CO_HOI_MO } } }),
    chuyen: async (tx, tu, sang, n) => (await tx.opportunity.updateMany({ where: { ownerId: tu, stage: { in: CO_HOI_MO } }, data: { ownerId: sang, updatedBy: n } })).count,
  },
  {
    ma: "cong-viec",
    nhan: "Công việc chưa xong",
    quyenXem: ["task.view"],
    dem: (tx, tu) => tx.task.count({ where: { ownerId: tu, status: { in: VIEC_MO } } }),
    chuyen: async (tx, tu, sang, n) => (await tx.task.updateMany({ where: { ownerId: tu, status: { in: VIEC_MO } }, data: { ownerId: sang, updatedBy: n } })).count,
  },
  {
    ma: "bao-gia",
    nhan: "Báo giá nháp / chờ duyệt / đã gửi chưa chốt",
    quyenXem: ["quotation.view"],
    dem: (tx, tu) => tx.quotation.count({ where: { ownerId: tu, status: { in: BAO_GIA_CHUA_CHOT } } }),
    chuyen: async (tx, tu, sang, n) => (await tx.quotation.updateMany({ where: { ownerId: tu, status: { in: BAO_GIA_CHUA_CHOT } }, data: { ownerId: sang, updatedBy: n } })).count,
  },
  {
    ma: "don-hang",
    nhan: "Đơn hàng chưa giao xong",
    quyenXem: ["order.view"],
    dem: (tx, tu) => tx.salesOrder.count({ where: { ownerId: tu, status: { in: DON_DANG_XU_LY } } }),
    chuyen: async (tx, tu, sang, n) => (await tx.salesOrder.updateMany({ where: { ownerId: tu, status: { in: DON_DANG_XU_LY } }, data: { ownerId: sang, updatedBy: n } })).count,
  },
  {
    ma: "hoa-don",
    nhan: "Hóa đơn nháp / đã phát hành (theo dõi thu tiền)",
    quyenXem: ["finance.view"],
    dem: (tx, tu) => tx.invoice.count({ where: { ownerId: tu, status: { in: ["DRAFT", "ISSUED"] } } }),
    chuyen: async (tx, tu, sang, n) => (await tx.invoice.updateMany({ where: { ownerId: tu, status: { in: ["DRAFT", "ISSUED"] } }, data: { ownerId: sang, updatedBy: n } })).count,
  },
  {
    ma: "phieu-ho-tro",
    nhan: "Phiếu hỗ trợ đang mở (người phụ trách)",
    quyenXem: ["service_desk.view"],
    dem: (tx, tu) => tx.supportTicket.count({ where: { ownerId: tu, status: { in: PHIEU_MO } } }),
    chuyen: async (tx, tu, sang, n) => (await tx.supportTicket.updateMany({ where: { ownerId: tu, status: { in: PHIEU_MO } }, data: { ownerId: sang, updatedBy: n } })).count,
  },
  {
    ma: "phieu-ho-tro-xu-ly",
    nhan: "Phiếu hỗ trợ đang mở (người xử lý)",
    quyenXem: ["service_desk.view"],
    dem: (tx, tu) => tx.supportTicket.count({ where: { assigneeId: tu, status: { in: PHIEU_MO } } }),
    chuyen: async (tx, tu, sang, n) => (await tx.supportTicket.updateMany({ where: { assigneeId: tu, status: { in: PHIEU_MO } }, data: { assigneeId: sang, updatedBy: n } })).count,
  },
  {
    ma: "bao-tri",
    nhan: "Hợp đồng bảo trì còn hiệu lực",
    quyenXem: ["service_desk.view"],
    dem: (tx, tu) => tx.maintenanceContract.count({ where: { ownerId: tu, status: { in: BAO_TRI_CON } } }),
    chuyen: async (tx, tu, sang, n) => (await tx.maintenanceContract.updateMany({ where: { ownerId: tu, status: { in: BAO_TRI_CON } }, data: { ownerId: sang, updatedBy: n } })).count,
  },
  {
    ma: "gia-han",
    nhan: "Gia hạn chưa xử lý",
    quyenXem: ["service_desk.view", "sales.view"],
    dem: (tx, tu) => tx.renewal.count({ where: { ownerId: tu, status: "moi" } }),
    chuyen: async (tx, tu, sang, n) => (await tx.renewal.updateMany({ where: { ownerId: tu, status: "moi" }, data: { ownerId: sang, updatedBy: n } })).count,
  },
];

async function docNguoi(tx: ClientTenant, id: string) {
  const u = await tx.user.findFirst({ where: { id }, select: { id: true, fullName: true, email: true, status: true, isSystem: true } });
  if (!u || u.isSystem) throw new LoiKhongTimThay("Người dùng");
  return u;
}

/** Xem trước: đếm từng loại việc sẽ chuyển — không ghi gì. */
export async function xemTruocBanGiao(nc: NguCanh, tuId: string) {
  batBuocQuyen(nc.hoSo, "user.update", { objectType: "user", objectId: tuId });
  const tu = await docNguoi(nc.tx, tuId);
  const loai = [];
  for (const l of LOAI_BAN_GIAO) loai.push({ ma: l.ma, nhan: l.nhan, so: await l.dem(nc.tx, tuId) });
  return { nguoi: { id: tu.id, hoTen: tu.fullName, email: tu.email, trangThai: tu.status }, loai, tong: loai.reduce((s, l) => s + l.so, 0) };
}

export async function banGiao(nc: NguCanh, tuId: string, d: z.infer<typeof LuocDoBanGiao>) {
  batBuocQuyen(nc.hoSo, "user.update", { objectType: "user", objectId: tuId });
  if (tuId === d.nguoiNhanId) throw new LoiNghiepVu("Người nhận phải khác người bàn giao.", 400, "cung-nguoi");
  const tu = await docNguoi(nc.tx, tuId);
  const nhan = await docNguoi(nc.tx, d.nguoiNhanId);
  if (nhan.status !== "hoat-dong") throw new LoiNghiepVu(`${nhan.fullName} đang ngừng hoạt động — không nhận bàn giao được.`, 422, "nguoi-nhan-ngung");

  // Người nhận không có quyền XEM một loại việc sắp nhận → vẫn chuyển (việc không thể bị bỏ lơ
  // vì người cũ đã nghỉ), nhưng báo rõ để quản trị cấp vai trò. Không chặn: quản trị có thể cố ý
  // bàn giao tạm cho chính mình hoặc cho bộ phận nhân sự rồi phân lại.
  const hoSoNhan = await layHoSoQuyen(nc.tx, nhan.id);
  const thieuQuyenXem: string[] = [];
  for (const l of LOAI_BAN_GIAO) {
    if (l.quyenXem.some((q) => hoSoNhan?.quyen.has(q))) continue;
    if ((await l.dem(nc.tx, tuId)) > 0) thieuQuyenXem.push(l.nhan);
  }

  const daChuyen: Record<string, number> = {};
  for (const l of LOAI_BAN_GIAO) daChuyen[l.ma] = await l.chuyen(nc.tx, tuId, d.nguoiNhanId, nc.hoSo.userId);

  await nc.kiemToan({
    action: "ban-giao",
    objectType: "user",
    objectId: tuId,
    before: { nguoiPhuTrach: tu.email },
    after: { nguoiNhan: nhan.email, nguoiNhanId: nhan.id, daChuyen, khoaTaiKhoan: d.khoaTaiKhoan, ghiChu: d.ghiChu ?? null, thieuQuyenXem },
  });
  await nc.suKien({ eventType: SU_KIEN.USER_HANDOVER, objectType: "user", objectId: tuId, payload: { sang: nhan.id, daChuyen } });

  let daKhoa = false;
  if (d.khoaTaiKhoan && tu.status === "hoat-dong") {
    await suaNguoiDung(nc, tuId, { trangThai: "ngung-hoat-dong" });
    daKhoa = true;
  }
  return { tu: tu.id, sang: nhan.id, daChuyen, tong: Object.values(daChuyen).reduce((s, n) => s + n, 0), daKhoa, thieuQuyenXem };
}
