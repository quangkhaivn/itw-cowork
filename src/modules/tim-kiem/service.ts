import type { NguCanh } from "@/lib/api";
import { coMotTrongCacQuyen, coQuyen, idNguoiTrongPhamVi } from "@/lib/phan-quyen";
import { DIEU_HUONG } from "@/components/khung/dieu-huong";
import { locTheoPhamVi } from "@/modules/crm/chung";
import { chuanHoaTen } from "@/modules/crm/chuan-hoa";
import { NHAN_GIAI_DOAN } from "@/modules/crm/hang-so";
import { dieuKienXemCoHoi } from "@/modules/co-hoi/service";
import { chuanHoaTenSanPham } from "@/modules/san-pham/chuan-hoa";
import { dinhDangTien } from "@/lib/dinh-dang";

/**
 * Tìm kiếm toàn cục (Ctrl/Cmd + K) — mục 29 master prompt.
 *
 * Kiến trúc: mỗi phân hệ đăng ký một NGUỒN. Ô tìm kiếm hỏi mọi nguồn mà người dùng
 * có quyền, gộp kết quả. Phase 2 thêm nguồn Khách hàng / Liên hệ / Cơ hội; Phase 3
 * thêm Sản phẩm/SKU; Phase 4 thêm Báo giá — chỉ việc thêm phần tử vào `NGUON`.
 *
 * Mỗi nguồn tự kiểm quyền VÀ phạm vi dữ liệu: nhân viên kinh doanh tìm "Công ty A"
 * chỉ ra khách của mình, không ra khách của người khác.
 */

export interface KetQuaTimKiem {
  loai: string;
  nhanLoai: string;
  tieuDe: string;
  phu?: string;
  href: string;
}

interface NguonTimKiem {
  loai: string;
  nhanLoai: string;
  tim(nc: NguCanh, q: string, gioiHan: number): Promise<KetQuaTimKiem[]>;
}

function boDau(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase();
}

const NGUON: NguonTimKiem[] = [
  {
    loai: "trang",
    nhanLoai: "Màn hình",
    async tim(nc, q, gioiHan) {
      const khoa = boDau(q);
      return DIEU_HUONG.flatMap((nhom) => nhom.muc)
        .filter((m) => {
          const duocXem = !m.quyen
            ? true
            : Array.isArray(m.quyen)
              ? coMotTrongCacQuyen(nc.hoSo, m.quyen)
              : coQuyen(nc.hoSo, m.quyen);
          return duocXem && boDau(`${m.nhan} ${m.tuKhoa ?? ""}`).includes(khoa);
        })
        .slice(0, gioiHan)
        .map((m) => ({ loai: "trang", nhanLoai: "Màn hình", tieuDe: m.nhan, href: m.href }));
    },
  },
  {
    loai: "nguoi-dung",
    nhanLoai: "Người dùng",
    async tim(nc, q, gioiHan) {
      if (!coQuyen(nc.hoSo, "user.view")) return [];
      const pv = await idNguoiTrongPhamVi(nc.tx, nc.hoSo, "user.view");
      const ds = await nc.tx.user.findMany({
        where: {
          isSystem: false,
          ...(pv !== "tat-ca" && { id: { in: pv } }),
          OR: [
            { fullName: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
            { phone: { contains: q } },
          ],
        },
        select: { id: true, fullName: true, email: true, status: true },
        take: gioiHan,
        orderBy: { fullName: "asc" },
      });
      return ds.map((u) => ({
        loai: "nguoi-dung",
        nhanLoai: "Người dùng",
        tieuDe: u.fullName,
        phu: u.status === "hoat-dong" ? u.email : `${u.email} · đã ngừng`,
        href: `/quan-tri/nguoi-dung/${u.id}`,
      }));
    },
  },
  {
    loai: "phong-ban",
    nhanLoai: "Phòng ban",
    async tim(nc, q, gioiHan) {
      if (!coQuyen(nc.hoSo, "department.view")) return [];
      const ds = await nc.tx.department.findMany({
        where: {
          OR: [{ name: { contains: q, mode: "insensitive" } }, { code: { contains: q, mode: "insensitive" } }],
        },
        select: { id: true, name: true, code: true },
        take: gioiHan,
      });
      return ds.map((d) => ({
        loai: "phong-ban",
        nhanLoai: "Phòng ban",
        tieuDe: d.name,
        phu: d.code,
        href: `/quan-tri/phong-ban#${d.id}`,
      }));
    },
  },
];

// ---------------------------------------------------------------------------
// Phase 2 — CRM. Mỗi nguồn lọc theo phạm vi của đúng quyền xem phân hệ đó.
// ---------------------------------------------------------------------------

/** Chuỗi chữ số từ câu tìm ("0909 111 222", "0305.547.654") — để so với cột đã chuẩn hóa. */
function chuSo(q: string): string {
  return q.replace(/\D/g, "");
}

NGUON.push(
  {
    loai: "khach-hang",
    nhanLoai: "Khách hàng",
    async tim(nc, q, gioiHan) {
      if (!coQuyen(nc.hoSo, "customer.view")) return [];
      const pham = await locTheoPhamVi(nc, "customer.view");
      const so = chuSo(q);
      const ds = await nc.tx.customer.findMany({
        where: {
          ...pham,
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { nameNormalized: { contains: chuanHoaTen(q) } },
            { code: { contains: q, mode: "insensitive" } },
            { emailNormalized: { contains: q.toLowerCase() } },
            ...(so.length >= 4 ? [{ taxCodeNormalized: { contains: so } }, { phoneNormalized: { contains: so } }] : []),
          ],
        },
        select: { id: true, code: true, name: true, taxCode: true, phone: true },
        take: gioiHan,
        orderBy: { updatedAt: "desc" },
      });
      return ds.map((k) => ({
        loai: "khach-hang",
        nhanLoai: "Khách hàng",
        tieuDe: k.name,
        phu: [k.code, k.taxCode && `MST ${k.taxCode}`, k.phone].filter(Boolean).join(" · "),
        href: `/crm/khach-hang/${k.id}`,
      }));
    },
  },
  {
    loai: "lien-he",
    nhanLoai: "Liên hệ",
    async tim(nc, q, gioiHan) {
      if (!coQuyen(nc.hoSo, "customer.view")) return [];
      const pham = await locTheoPhamVi(nc, "customer.view");
      const so = chuSo(q);
      const ds = await nc.tx.contact.findMany({
        where: {
          customer: pham,
          OR: [
            { fullName: { contains: q, mode: "insensitive" } },
            { emailNormalized: { contains: q.toLowerCase() } },
            ...(so.length >= 4 ? [{ phoneNormalized: { contains: so } }] : []),
          ],
        },
        select: { id: true, fullName: true, phone: true, email: true, customer: { select: { id: true, name: true } } },
        take: gioiHan,
      });
      return ds.map((c) => ({
        loai: "lien-he",
        nhanLoai: "Liên hệ",
        tieuDe: c.fullName,
        phu: [c.customer.name, c.phone ?? c.email].filter(Boolean).join(" · "),
        href: `/crm/khach-hang/${c.customer.id}?tab=lien-he`,
      }));
    },
  },
  {
    loai: "lead",
    nhanLoai: "Lead",
    async tim(nc, q, gioiHan) {
      if (!coQuyen(nc.hoSo, "crm.view")) return [];
      const pham = await locTheoPhamVi(nc, "crm.view");
      const so = chuSo(q);
      const ds = await nc.tx.lead.findMany({
        where: {
          ...pham,
          OR: [
            { fullName: { contains: q, mode: "insensitive" } },
            { companyName: { contains: q, mode: "insensitive" } },
            { code: { contains: q, mode: "insensitive" } },
            { emailNormalized: { contains: q.toLowerCase() } },
            ...(so.length >= 4 ? [{ phoneNormalized: { contains: so } }, { taxCodeNormalized: { contains: so } }] : []),
          ],
        },
        select: { id: true, code: true, fullName: true, companyName: true, stage: true },
        take: gioiHan,
        orderBy: { createdAt: "desc" },
      });
      return ds.map((l) => ({
        loai: "lead",
        nhanLoai: "Lead",
        tieuDe: l.companyName ? `${l.fullName} — ${l.companyName}` : l.fullName,
        phu: `${l.code} · ${NHAN_GIAI_DOAN[l.stage] ?? l.stage}`,
        href: `/crm/lead/${l.id}`,
      }));
    },
  },
  {
    loai: "co-hoi",
    nhanLoai: "Cơ hội",
    async tim(nc, q, gioiHan) {
      if (!coQuyen(nc.hoSo, "sales.view")) return [];
      const ds = await nc.tx.opportunity.findMany({
        where: {
          AND: [
            await dieuKienXemCoHoi(nc),
            { OR: [{ title: { contains: q, mode: "insensitive" } }, { code: { contains: q, mode: "insensitive" } }] },
          ],
        },
        select: { id: true, code: true, title: true, stage: true, customer: { select: { name: true } } },
        take: gioiHan,
        orderBy: { updatedAt: "desc" },
      });
      return ds.map((c) => ({
        loai: "co-hoi",
        nhanLoai: "Cơ hội",
        tieuDe: c.title,
        phu: `${c.code} · ${c.customer.name} · ${NHAN_GIAI_DOAN[c.stage] ?? c.stage}`,
        href: `/ban-hang/co-hoi/${c.id}`,
      }));
    },
  },
);

// --- Phase 3: sản phẩm theo SKU, tên, model. Danh mục dùng chung, không lọc theo người. ---
NGUON.push({
  loai: "san-pham",
  nhanLoai: "Sản phẩm",
  async tim(nc, q, gioiHan) {
    if (!coQuyen(nc.hoSo, "product.view")) return [];
    const ds = await nc.tx.product.findMany({
      where: {
        OR: [
          { sku: { contains: q, mode: "insensitive" } },
          { name: { contains: q, mode: "insensitive" } },
          { nameNormalized: { contains: chuanHoaTenSanPham(q) } },
          { model: { contains: q, mode: "insensitive" } },
        ],
      },
      select: { id: true, sku: true, name: true, sellingPrice: true, status: true },
      take: gioiHan,
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
    });
    return ds.map((p) => ({
      loai: "san-pham",
      nhanLoai: "Sản phẩm",
      tieuDe: p.name,
      phu: [p.sku, p.sellingPrice ? dinhDangTien(p.sellingPrice) : "chưa có giá bán", p.status === "hoat-dong" ? null : "ngừng kinh doanh"]
        .filter(Boolean)
        .join(" · "),
      href: `/san-pham/${p.id}`,
    }));
  },
});

export async function timKiemToanCuc(nc: NguCanh, q: string, gioiHanMoiNguon = 6): Promise<KetQuaTimKiem[]> {
  const cau = q.trim();
  if (cau.length < 2) return [];
  const ketQua: KetQuaTimKiem[] = [];
  // Tuần tự, không song song: mọi nguồn dùng chung một giao dịch.
  for (const nguon of NGUON) ketQua.push(...(await nguon.tim(nc, cau.slice(0, 100), gioiHanMoiNguon)));
  return ketQua;
}
