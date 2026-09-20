import DauTrang from "@/components/ui/DauTrang";
import { taoNguCanh } from "@/lib/api";
import { LoiKhongTimThay } from "@/lib/loi";
import { coQuyen } from "@/lib/phan-quyen";
import { docDuLieu, layMot, yeuCauQuyen, type ThamSoTrang } from "@/lib/trang";
import { danhSachNguoiPhuTrach, homNayVN, luaChonDuLieuGoc } from "@/modules/crm/chung";
import { batBuocThayKhach } from "@/modules/khach-hang/service";
import FormDonHang from "../FormDonHang";

export const dynamic = "force-dynamic";

const LA_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function TrangTaoDonHang({ searchParams }: { searchParams: ThamSoTrang }) {
  const nd = await yeuCauQuyen("order.create");
  const khachId = layMot((await searchParams).khachHang);

  const { nguoi, khach, lienHe, dieuKhoan } = await docDuLieu(nd, async (tx) => {
    const nc = taoNguCanh(tx, nd.phien.tenantId, nd.hoSo);
    let khach: { id: string; ma: string; ten: string; diaChi: string | null } | null = null;
    let lienHe: { id: string; hoTen: string }[] = [];
    if (LA_UUID.test(khachId)) {
      try {
        const k = await batBuocThayKhach(nc, khachId);
        khach = { id: k.id, ma: k.ma, ten: k.ten, diaChi: k.diaChi };
        lienHe = (
          await tx.contact.findMany({ where: { customerId: k.id, status: "hoat-dong" }, select: { id: true, fullName: true }, orderBy: [{ isPrimary: "desc" }, { fullName: "asc" }] })
        ).map((l) => ({ id: l.id, hoTen: l.fullName }));
      } catch (loi) {
        if (!(loi instanceof LoiKhongTimThay)) throw loi;
      }
    }
    return {
      nguoi: await danhSachNguoiPhuTrach(nc, "order.create"),
      khach,
      lienHe,
      dieuKhoan: await luaChonDuLieuGoc(nc, ["dieu_khoan_thanh_toan", "dieu_khoan_giao_hang", "don_vi_tinh"]),
    };
  });

  return (
    <>
      <DauTrang
        tieuDe="Tạo đơn hàng"
        duongDan={[{ nhan: "Bán hàng" }, { nhan: "Đơn hàng", href: "/ban-hang/don-hang" }]}
        moTa="Đơn đã có báo giá thì nên bấm “Tạo đơn hàng” ngay trên báo giá — số tiền chép sang, không phải nhập lại."
      />
      <FormDonHang
        nguoiPhuTrach={nguoi}
        lienHeBanDau={lienHe}
        dieuKhoanThanhToan={dieuKhoan.dieu_khoan_thanh_toan}
        dieuKhoanGiaoHang={dieuKhoan.dieu_khoan_giao_hang}
        donViTinh={dieuKhoan.don_vi_tinh}
        hienGiaVon={coQuyen(nd.hoSo, "product.view")}
        banDau={{
          khachHang: khach ? { id: khach.id, ma: khach.ma, ten: khach.ten } : null,
          lienHeId: lienHe[0]?.id ?? "",
          nguoiPhuTrachId: nd.hoSo.userId,
          ngayDat: homNayVN(),
          ngayGiaoDuKien: "",
          diaChiGiao: khach?.diaChi ?? "",
          dieuKhoanThanhToan: "",
          dieuKhoanGiaoHang: "",
          ghiChu: "",
          dong: [],
        }}
      />
    </>
  );
}
