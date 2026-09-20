import KhungUngDung from "@/components/khung/KhungUngDung";
import { DIEU_HUONG } from "@/components/khung/dieu-huong";
import { coMotTrongCacQuyen, coQuyen } from "@/lib/phan-quyen";
import { yeuCauDangNhap } from "@/lib/trang";

export const dynamic = "force-dynamic";

/** Nút "+ Tạo mới": chỉ loại bản ghi đã có màn hình tạo, lọc theo quyền trên máy chủ. */
const TAO_NHANH = [
  { nhan: "Khách hàng", href: "/crm/khach-hang/moi", quyen: "customer.create" },
  { nhan: "Lead", href: "/crm/lead/moi", quyen: "crm.create" },
  { nhan: "Cơ hội", href: "/ban-hang/co-hoi/moi", quyen: "sales.create" },
  { nhan: "Báo giá", href: "/ban-hang/bao-gia/moi", quyen: "quotation.create" },
  { nhan: "Đơn hàng", href: "/ban-hang/don-hang/moi", quyen: "order.create" },
  { nhan: "Phiếu hỗ trợ", href: "/dich-vu/ho-tro/moi", quyen: "service_desk.create" },
  { nhan: "Hóa đơn", href: "/tai-chinh/hoa-don/moi", quyen: "finance.create" },
  { nhan: "Hợp đồng bảo trì", href: "/dich-vu/bao-tri/moi", quyen: "service_desk.create" },
  { nhan: "Dự án", href: "/du-an/moi", quyen: "project.create" },
  { nhan: "Công việc", href: "/cong-viec?tao=1", quyen: "task.create" },
  { nhan: "Sản phẩm", href: "/san-pham/moi", quyen: "product.create" },
  { nhan: "Nhà cung cấp", href: "/san-pham/nha-cung-cap?tao=1", quyen: "supplier.create" },
];

/**
 * Bố cục chung của mọi màn hình sau đăng nhập.
 * Menu được lọc theo quyền NGAY TRÊN MÁY CHỦ rồi mới gửi xuống trình duyệt.
 */
export default async function BoCucHeThong({ children }: { children: React.ReactNode }) {
  const nd = await yeuCauDangNhap();

  const dieuHuong = DIEU_HUONG.map((nhom) => ({
    ...nhom,
    muc: nhom.muc.filter((m) =>
      !m.quyen ? true : Array.isArray(m.quyen) ? coMotTrongCacQuyen(nd.hoSo, m.quyen) : coQuyen(nd.hoSo, m.quyen),
    ),
  })).filter((nhom) => nhom.muc.length > 0);

  return (
    <KhungUngDung
      dieuHuong={dieuHuong}
      tenDoanhNghiep={nd.tenant.name}
      taoNhanh={TAO_NHANH.filter((m) => coQuyen(nd.hoSo, m.quyen)).map(({ nhan, href }) => ({ nhan, href }))}
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
