import { z, type ZodType } from "zod";
import type { NguCanh } from "@/lib/api";
import { coQuyen } from "@/lib/phan-quyen";
import { LoiNghiepVu } from "@/lib/loi";
import { locTheoPhamVi } from "@/modules/crm/chung";
import { GIAI_DOAN_LEAD, LEAD_DANG_MO } from "@/modules/crm/hang-so";
import type { UngVien } from "./tinh-toan";

/**
 * NGUỒN NGƯỜI NHẬN — giao diện cắm cho chiến dịch email (EM-12).
 *
 * Chiến dịch không tự truy vấn lead/liên hệ; nó hỏi một **nguồn** theo mã. Mỗi nguồn:
 *   - khai lược đồ tham số (Zod) — tham số lưu vào `email_campaigns.source_params`;
 *   - khai quyền cần có (một trong các mã) — kiểm ở service trước khi gọi `lay()`;
 *   - `lay(nc, thamSo)` trả danh sách {email, ten, congTy, loai, id, khachHangId, tuChoiLuc}
 *     **đã lọc theo phạm vi dữ liệu** của người gọi. Việc loại email hỏng / trùng / đã từ chối
 *     làm chung một chỗ ở `locNguoiNhan()`, nguồn không cần lo.
 *
 * Gói Marketing (phân khúc) cắm vào bằng `dangKyNguonNguoiNhan({ ma: "phan-khuc", … })`
 * gọi `danhSachTheoPhanKhuc()` của họ. Không phải sửa gì ở chiến dịch hay worker.
 */

export interface NguonNguoiNhan<T = unknown> {
  ma: string;
  nhan: string;
  /** Có ít nhất một trong các quyền này mới dùng được nguồn. */
  quyen: string[];
  luocDo: ZodType<T>;
  /** Câu tóm tắt điều kiện lọc để hiện trên chiến dịch. */
  moTa(thamSo: T): string;
  lay(nc: NguCanh, thamSo: T): Promise<UngVien[]>;
}

/** Trần kỹ thuật một chiến dịch — không phải ngưỡng nghiệp vụ; chặn truy vấn kéo cả CSDL lên bộ nhớ. */
export const TRAN_NGUOI_NHAN = 20_000;

const dsMa = z.array(z.string().trim().min(1).max(50)).max(50).default([]);

export const LuocDoLocDonGian = z.object({
  doiTuong: z.enum(["lead", "lien-he"]),
  /** Lead: giai đoạn. Rỗng = mọi lead đang mở (Lead mới, Đã liên hệ, Đủ điều kiện). */
  giaiDoan: z.array(z.enum(GIAI_DOAN_LEAD)).max(5).default([]),
  /** Mã nguồn lead (dữ liệu gốc `nguon_lead`) — áp cho lead, và cho khách của liên hệ. */
  nguon: dsMa,
  /** Liên hệ: phân khúc khách (`phan_khuc_khach_hang`). */
  phanKhuc: dsMa,
  /** Liên hệ: ngành nghề khách (`nganh_nghe`). */
  nganh: dsMa,
});
export type ThamSoLocDonGian = z.infer<typeof LuocDoLocDonGian>;

const LOC_DON_GIAN: NguonNguoiNhan<ThamSoLocDonGian> = {
  ma: "loc-don-gian",
  nhan: "Lọc lead / liên hệ theo điều kiện",
  quyen: ["crm.view", "customer.view"],
  luocDo: LuocDoLocDonGian,
  moTa(t) {
    const phan: string[] = [t.doiTuong === "lead" ? "Lead" : "Liên hệ của khách hàng"];
    if (t.doiTuong === "lead") phan.push(t.giaiDoan.length ? `giai đoạn ${t.giaiDoan.join(", ")}` : "đang mở");
    if (t.nguon.length) phan.push(`nguồn ${t.nguon.join(", ")}`);
    if (t.doiTuong === "lien-he" && t.phanKhuc.length) phan.push(`phân khúc ${t.phanKhuc.join(", ")}`);
    if (t.doiTuong === "lien-he" && t.nganh.length) phan.push(`ngành ${t.nganh.join(", ")}`);
    return phan.join(" · ");
  },
  async lay(nc, t) {
    if (t.doiTuong === "lead") {
      if (!coQuyen(nc.hoSo, "crm.view")) throw new LoiNghiepVu("Chọn người nhận là lead cần quyền xem CRM (crm.view).", 403, "thieu-quyen-nguon");
      const ds = await nc.tx.lead.findMany({
        where: {
          ...(await locTheoPhamVi(nc, "crm.view")),
          status: "hoat-dong",
          stage: { in: t.giaiDoan.length ? t.giaiDoan : LEAD_DANG_MO },
          ...(t.nguon.length && { source: { in: t.nguon } }),
        },
        select: { id: true, fullName: true, companyName: true, email: true, emailNormalized: true, marketingOptOutAt: true },
        orderBy: { createdAt: "asc" },
        take: TRAN_NGUOI_NHAN + 1,
      });
      return ds.map((l) => ({
        email: l.emailNormalized ?? l.email,
        ten: l.fullName,
        congTy: l.companyName,
        loai: "lead" as const,
        id: l.id,
        khachHangId: null,
        tuChoiLuc: l.marketingOptOutAt,
      }));
    }
    if (!coQuyen(nc.hoSo, "customer.view")) {
      throw new LoiNghiepVu("Chọn người nhận là liên hệ của khách cần quyền xem khách hàng (customer.view).", 403, "thieu-quyen-nguon");
    }
    const ds = await nc.tx.contact.findMany({
      where: {
        status: "hoat-dong",
        customer: {
          ...(await locTheoPhamVi(nc, "customer.view")),
          status: { not: "ngung-giao-dich" },
          ...(t.nguon.length && { source: { in: t.nguon } }),
          ...(t.phanKhuc.length && { segment: { in: t.phanKhuc } }),
          ...(t.nganh.length && { industry: { in: t.nganh } }),
        },
      },
      select: {
        id: true,
        fullName: true,
        email: true,
        emailNormalized: true,
        marketingOptOutAt: true,
        customer: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "asc" },
      take: TRAN_NGUOI_NHAN + 1,
    });
    return ds.map((c) => ({
      email: c.emailNormalized ?? c.email,
      ten: c.fullName,
      congTy: c.customer.name,
      loai: "contact" as const,
      id: c.id,
      khachHangId: c.customer.id,
      tuChoiLuc: c.marketingOptOutAt,
    }));
  },
};

const SO_NGUON = new Map<string, NguonNguoiNhan<unknown>>();

export function dangKyNguonNguoiNhan<T>(nguon: NguonNguoiNhan<T>): void {
  SO_NGUON.set(nguon.ma, nguon as NguonNguoiNhan<unknown>);
}
dangKyNguonNguoiNhan(LOC_DON_GIAN);

export function timNguon(ma: string): NguonNguoiNhan<unknown> {
  const n = SO_NGUON.get(ma);
  if (!n) throw new LoiNghiepVu("Nguồn người nhận không tồn tại.", 422, "nguon-khong-ton-tai");
  return n;
}

export function danhSachNguon(): { ma: string; nhan: string; quyen: string[] }[] {
  return [...SO_NGUON.values()].map((n) => ({ ma: n.ma, nhan: n.nhan, quyen: n.quyen }));
}

/** Kiểm quyền + tham số, rồi lấy ứng viên. Vượt trần kỹ thuật thì từ chối, không cắt lặng lẽ. */
export async function layUngVien(nc: NguCanh, ma: string, thamSoTho: unknown): Promise<{ ds: UngVien[]; moTa: string; thamSo: unknown }> {
  const nguon = timNguon(ma);
  if (!nguon.quyen.some((q) => coQuyen(nc.hoSo, q))) {
    throw new LoiNghiepVu("Bạn không có quyền dùng nguồn người nhận này.", 403, "thieu-quyen-nguon");
  }
  const thamSo = nguon.luocDo.parse(thamSoTho);
  const ds = await nguon.lay(nc, thamSo);
  if (ds.length > TRAN_NGUOI_NHAN) {
    throw new LoiNghiepVu(
      `Điều kiện lọc ra hơn ${TRAN_NGUOI_NHAN.toLocaleString("vi-VN")} người — chia thành nhiều chiến dịch nhỏ hơn.`,
      422,
      "qua-tran-nguoi-nhan",
    );
  }
  return { ds, moTa: nguon.moTa(thamSo), thamSo };
}
