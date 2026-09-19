import type { NguCanh } from "@/lib/api";
import { coQuyen, idNguoiTrongPhamVi } from "@/lib/phan-quyen";
import { DIEU_HUONG } from "@/components/khung/dieu-huong";

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
        .filter((m) => (!m.quyen || coQuyen(nc.hoSo, m.quyen)) && boDau(`${m.nhan} ${m.tuKhoa ?? ""}`).includes(khoa))
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

export async function timKiemToanCuc(nc: NguCanh, q: string, gioiHanMoiNguon = 6): Promise<KetQuaTimKiem[]> {
  const cau = q.trim();
  if (cau.length < 2) return [];
  const ketQua: KetQuaTimKiem[] = [];
  // Tuần tự, không song song: mọi nguồn dùng chung một giao dịch.
  for (const nguon of NGUON) ketQua.push(...(await nguon.tim(nc, cau.slice(0, 100), gioiHanMoiNguon)));
  return ketQua;
}
