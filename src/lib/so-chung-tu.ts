import type { ClientTenant } from "./db";
import { MUI_GIO } from "./dinh-dang";

/**
 * Cấp số chứng từ: KH-000001, LD-000001, CH-2026-0001, QT-2026-0001, DH-2026-0001, XK-2026-0001, TH-2026-0001…
 *
 * Một câu `INSERT … ON CONFLICT DO UPDATE … RETURNING` — PostgreSQL khóa dòng bộ đếm
 * trong suốt giao dịch, nên hai người tạo cùng lúc nhận hai số khác nhau; giao dịch nào
 * cuộn ngược thì số đó bị bỏ (chấp nhận nhảy số, không chấp nhận trùng số).
 */

export interface KieuSo {
  loai: string;
  tienTo: string;
  /** Số chữ số phần đuôi. */
  doDai: number;
  /** Đánh số lại mỗi năm (theo giờ Việt Nam). */
  theoNam: boolean;
}

export const KIEU_SO = {
  khachHang: { loai: "customer", tienTo: "KH", doDai: 6, theoNam: false },
  lead: { loai: "lead", tienTo: "LD", doDai: 6, theoNam: false },
  coHoi: { loai: "opportunity", tienTo: "CH", doDai: 4, theoNam: true },
  nhaCungCap: { loai: "supplier", tienTo: "NCC", doDai: 4, theoNam: false },
  baoGia: { loai: "quotation", tienTo: "QT", doDai: 4, theoNam: true },
  donHang: { loai: "sales_order", tienTo: "DH", doDai: 4, theoNam: true },
  phieuXuat: { loai: "delivery", tienTo: "XK", doDai: 4, theoNam: true },
  duAn: { loai: "project", tienTo: "DA", doDai: 4, theoNam: true },
  phieuHoTro: { loai: "support_ticket", tienTo: "HT", doDai: 4, theoNam: true },
  hoaDon: { loai: "invoice", tienTo: "HD", doDai: 4, theoNam: true },
  phieuThu: { loai: "payment", tienTo: "PT", doDai: 4, theoNam: true },
  deNghiMua: { loai: "purchase_request", tienTo: "DN", doDai: 4, theoNam: true },
  donMua: { loai: "purchase_order", tienTo: "DM", doDai: 4, theoNam: true },
  nhanHang: { loai: "goods_receipt", tienTo: "NK", doDai: 4, theoNam: true },
  hoaDonMua: { loai: "supplier_bill", tienTo: "HM", doDai: 4, theoNam: true },
  phieuChi: { loai: "supplier_payment", tienTo: "PC", doDai: 4, theoNam: true },
  traHangBan: { loai: "sales_return", tienTo: "TH", doDai: 4, theoNam: true },
  traHangMua: { loai: "purchase_return", tienTo: "TM", doDai: 4, theoNam: true },
  chuyenKho: { loai: "stock_transfer", tienTo: "CK", doDai: 4, theoNam: true },
  chienDich: { loai: "marketing_campaign", tienTo: "CD", doDai: 4, theoNam: true },
  chienDichEmail: { loai: "email_campaign", tienTo: "EM", doDai: 4, theoNam: true },
} satisfies Record<string, KieuSo>;

/** Năm hiện tại theo giờ Việt Nam (31/12 23:30 UTC đã là năm mới ở Việt Nam). */
export function namVN(luc: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: MUI_GIO, year: "numeric" }).format(luc);
}

/** Ghép số chứng từ từ số thứ tự — hàm thuần, có kiểm thử đơn vị. */
export function dinhDangSoChungTu(kieu: KieuSo, so: number, nam: string): string {
  const duoi = String(so).padStart(kieu.doDai, "0");
  return kieu.theoNam ? `${kieu.tienTo}-${nam}-${duoi}` : `${kieu.tienTo}-${duoi}`;
}

export async function capSoChungTu(tx: ClientTenant, kieu: KieuSo, luc: Date = new Date()): Promise<string> {
  const nam = namVN(luc);
  const ky = kieu.theoNam ? nam : "";
  const [{ last_number }] = await tx.$queryRaw<{ last_number: number }[]>`
    INSERT INTO document_sequences (id, tenant_id, doc_type, period, last_number, updated_at)
    VALUES (gen_random_uuid(), current_setting('app.tenant_id')::uuid, ${kieu.loai}, ${ky}, 1, now())
    ON CONFLICT (tenant_id, doc_type, period)
    DO UPDATE SET last_number = document_sequences.last_number + 1, updated_at = now()
    RETURNING last_number
  `;
  return dinhDangSoChungTu(kieu, last_number, nam);
}
