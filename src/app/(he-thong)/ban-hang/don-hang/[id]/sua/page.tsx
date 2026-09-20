import Link from "next/link";
import { notFound } from "next/navigation";
import DauTrang from "@/components/ui/DauTrang";
import TrongRong from "@/components/ui/TrongRong";
import { taoNguCanh } from "@/lib/api";
import { LoiKhongTimThay } from "@/lib/loi";
import { coQuyen } from "@/lib/phan-quyen";
import { dinhDangNhapTien } from "@/lib/dinh-dang";
import { docDuLieu, yeuCauQuyen } from "@/lib/trang";
import { danhSachNguoiPhuTrach, dateVeNgay, luaChonDuLieuGoc } from "@/modules/crm/chung";
import { chiTietDonHang } from "@/modules/don-hang/service";
import FormDonHang from "../../FormDonHang";
import type { DongNhap } from "@/components/bao-gia/BangDongBaoGia";

export const dynamic = "force-dynamic";

/** Số lượng lưu dạng "20.000" (Decimal) — bỏ số 0 thừa cho ô nhập gọn. */
function gonSoLuong(s: string): string {
  return s.includes(".") ? s.replace(/\.?0+$/, "") : s;
}

export default async function TrangSuaDonHang({ params }: { params: Promise<{ id: string }> }) {
  const nd = await yeuCauQuyen("order.update");
  const { id } = await params;

  const du = await docDuLieu(nd, async (tx) => {
    const nc = taoNguCanh(tx, nd.phien.tenantId, nd.hoSo);
    try {
      const ct = await chiTietDonHang(nc, id);
      const [nguoi, lienHe, dieuKhoan] = await Promise.all([
        danhSachNguoiPhuTrach(nc, "order.update"),
        tx.contact.findMany({ where: { customerId: ct.don.khachHang.id, status: "hoat-dong" }, select: { id: true, fullName: true }, orderBy: [{ isPrimary: "desc" }, { fullName: "asc" }] }),
        luaChonDuLieuGoc(nc, ["dieu_khoan_thanh_toan", "dieu_khoan_giao_hang", "don_vi_tinh"]),
      ]);
      return { ct, nguoi, lienHe, dieuKhoan };
    } catch (loi) {
      if (loi instanceof LoiKhongTimThay) return null;
      throw loi;
    }
  });
  if (!du) notFound();

  const { ct } = du;
  const don = ct.don;
  const dauTrang = (
    <DauTrang tieuDe={`Sửa ${don.so}`} duongDan={[{ nhan: "Bán hàng" }, { nhan: "Đơn hàng", href: "/ban-hang/don-hang" }, { nhan: don.so, href: `/ban-hang/don-hang/${don.id}` }]} />
  );

  if (!ct.quyen.sua) {
    return (
      <>
        {dauTrang}
        <section className="the">
          <TrongRong tieuDe="Đơn này không sửa được nữa">
            Đơn đã xác nhận là cam kết với khách và đã giữ hàng trong kho. Muốn đổi thì hủy đơn rồi lập đơn mới.
            <div style={{ marginTop: 12 }}>
              <Link className="nut" href={`/ban-hang/don-hang/${don.id}`}>
                Về trang đơn hàng
              </Link>
            </div>
          </TrongRong>
        </section>
      </>
    );
  }

  const dong: DongNhap[] = don.dong.map((d, i) => ({
    khoa: d.id ?? `d${i}`,
    sanPhamId: d.sanPhamId,
    sku: d.sku,
    ten: d.ten,
    moTa: d.moTa ?? "",
    soLuong: gonSoLuong(d.soLuong),
    donViTinh: d.donViTinh ?? "",
    donGia: dinhDangNhapTien(d.donGia),
    chietKhau: String(Number(d.chietKhau)),
    vat: String(Number(d.vat)),
    giaVon: dinhDangNhapTien(d.giaVon),
    nhaCungCapId: null,
  }));

  return (
    <>
      {dauTrang}
      <FormDonHang
        nguoiPhuTrach={du.nguoi}
        lienHeBanDau={du.lienHe.map((l) => ({ id: l.id, hoTen: l.fullName }))}
        dieuKhoanThanhToan={du.dieuKhoan.dieu_khoan_thanh_toan}
        dieuKhoanGiaoHang={du.dieuKhoan.dieu_khoan_giao_hang}
        donViTinh={du.dieuKhoan.don_vi_tinh}
        hienGiaVon={coQuyen(nd.hoSo, "product.view")}
        banDau={{
          id: don.id,
          khachHang: { id: don.khachHang.id, ma: don.khachHang.ma, ten: don.khachHang.ten },
          lienHeId: don.lienHe?.id ?? "",
          nguoiPhuTrachId: don.nguoiPhuTrach.id,
          ngayDat: dateVeNgay(don.ngayDat),
          ngayGiaoDuKien: dateVeNgay(don.ngayGiaoDuKien),
          diaChiGiao: don.diaChiGiao ?? "",
          dieuKhoanThanhToan: don.dieuKhoanThanhToan ?? "",
          dieuKhoanGiaoHang: don.dieuKhoanGiaoHang ?? "",
          ghiChu: don.ghiChu ?? "",
          dong,
        }}
      />
    </>
  );
}
