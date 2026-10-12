import type { NguCanh } from "@/lib/api";
import { coQuyen } from "@/lib/phan-quyen";
import { banDoTenDuLieuGoc, homNayVN } from "@/modules/crm/chung";
import { dauVaoChiSo } from "./chien-dich";
import { congChiSo, tinhChiSoChienDich } from "./tinh-toan";

/**
 * Phân hệ Marketing — cửa vào chung. Luật: BUSINESS_RULES.md mục 21 (MK).
 *
 * Nghiệp vụ tách theo việc cho dễ đọc, tất cả xuất lại ở đây để giao diện, API, worker và
 * trợ lý AI (cũng như các gói khác — ví dụ Email marketing) chỉ cần nhớ một đường import:
 *   - `chien-dich.ts`  chiến dịch, duyệt ngân sách, chi phí, chỉ số
 *   - `nhan-lead.ts`   một cửa nhận lead `nhanLead()`, danh sách chia lead, đồng ý nhận tin
 *   - `form.ts`        form đăng ký công khai
 *   - `webhook.ts`     nguồn webhook + khóa bí mật
 *   - `phan-khuc.ts`   phân khúc + `danhSachTheoPhanKhuc()`
 *   - `landing.ts`     landing page dựng từ khối an toàn
 *   - `cong-khai.ts`   đường chạy chung cho yêu cầu không đăng nhập
 */

export * from "./chien-dich";
export * from "./nhan-lead";
export * from "./form";
export * from "./webhook";
export * from "./phan-khuc";
export * from "./landing";

/**
 * Khối Marketing trên Bảng điều hành (tháng này, giờ Việt Nam). Không có `marketing.view`
 * → `null`, màn hình bỏ hẳn khối (cùng luật các khối khác — ARCHITECTURE 7g).
 */
export async function khoiMarketingBangDieuKhien(nc: NguCanh) {
  if (!coQuyen(nc.hoSo, "marketing.view")) return null;
  const homNay = homNayVN();
  const dauThang = `${homNay.slice(0, 7)}-01`;
  const tuLuc = new Date(`${dauThang}T00:00:00+07:00`);
  const [theoNguon, chienDich, tenNguon] = await Promise.all([
    nc.tx.lead.groupBy({ by: ["source"], where: { createdAt: { gte: tuLuc } }, _count: { _all: true } }),
    nc.tx.marketingCampaign.findMany({ where: { status: { not: "huy" } }, select: { id: true, code: true, name: true } }),
    banDoTenDuLieuGoc(nc, ["nguon_lead"]),
  ]);
  const vao = await dauVaoChiSo(nc, chienDich.map((c) => c.id), { tuNgay: dauThang, denNgay: homNay });
  const tong = congChiSo([...vao.values()]);
  const theoChienDich = chienDich
    .map((c) => ({ id: c.id, ma: c.code, ten: c.name, ...tinhChiSoChienDich(vao.get(c.id)!) }))
    .filter((c) => c.soLead > 0 || c.chiPhi > 0)
    .sort((a, b) => b.soLead - a.soLead)
    .slice(0, 5);
  return {
    tuNgay: dauThang,
    soLeadThang: theoNguon.reduce((s, n) => s + n._count._all, 0),
    theoNguon: theoNguon
      .map((n) => ({ nguon: n.source ? (tenNguon.nguon_lead[n.source] ?? n.source) : "Chưa ghi nguồn", soLead: n._count._all }))
      .sort((a, b) => b.soLead - a.soLead)
      .slice(0, 6),
    theoChienDich,
    chiPhiThang: tong.chiPhi,
    soLeadChienDichThang: tong.soLead,
    cplThang: tong.cpl,
  };
}
