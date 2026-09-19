import KhungUngDung from "@/components/khung/KhungUngDung";
import { DIEU_HUONG } from "@/components/khung/dieu-huong";
import { coQuyen } from "@/lib/phan-quyen";
import { yeuCauDangNhap } from "@/lib/trang";

export const dynamic = "force-dynamic";

/**
 * Bố cục chung của mọi màn hình sau đăng nhập.
 * Menu được lọc theo quyền NGAY TRÊN MÁY CHỦ rồi mới gửi xuống trình duyệt.
 */
export default async function BoCucHeThong({ children }: { children: React.ReactNode }) {
  const nd = await yeuCauDangNhap();

  const dieuHuong = DIEU_HUONG.map((nhom) => ({
    ...nhom,
    muc: nhom.muc.filter((m) => !m.quyen || coQuyen(nd.hoSo, m.quyen)),
  })).filter((nhom) => nhom.muc.length > 0);

  return (
    <KhungUngDung
      dieuHuong={dieuHuong}
      tenDoanhNghiep={nd.tenant.name}
      nguoiDung={{
        hoTen: nd.hoSo.hoTen,
        email: nd.hoSo.email,
        vaiTro: nd.hoSo.vaiTro.map((v) => v.name).join(", ") || "Chưa có vai trò",
      }}
    >
      {children}
    </KhungUngDung>
  );
}
