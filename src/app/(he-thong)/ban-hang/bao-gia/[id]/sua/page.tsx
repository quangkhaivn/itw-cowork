import Link from "next/link";
import { notFound } from "next/navigation";
import DauTrang from "@/components/ui/DauTrang";
import TrongRong from "@/components/ui/TrongRong";
import { taoNguCanh } from "@/lib/api";
import { LoiKhongTimThay } from "@/lib/loi";
import { coQuyen } from "@/lib/phan-quyen";
import { docDuLieu, yeuCauQuyen } from "@/lib/trang";
import { danhSachNguoiPhuTrach, luaChonDuLieuGoc } from "@/modules/crm/chung";
import { laCoHoiDangMo } from "@/modules/crm/hang-so";
import { chiTietBaoGia, soPhienBan } from "@/modules/bao-gia/service";
import { dinhDangNhapTien } from "@/lib/dinh-dang";
import FormBaoGia from "../../FormBaoGia";
import type { DongNhap } from "@/components/bao-gia/BangDongBaoGia";

export const dynamic = "force-dynamic";

/** Số lượng lưu dạng "20.000" (Decimal) — bỏ số 0 thừa để ô nhập gọn. */
function gonSoLuong(s: string): string {
  return s.includes(".") ? s.replace(/\.?0+$/, "") : s;
}

export default async function TrangSuaBaoGia({ params }: { params: Promise<{ id: string }> }) {
  const nd = await yeuCauQuyen("quotation.update");
  const { id } = await params;

  const du = await docDuLieu(nd, async (tx) => {
    const nc = taoNguCanh(tx, nd.phien.tenantId, nd.hoSo);
    try {
      const ct = await chiTietBaoGia(nc, id);
      const [nguoi, lienHe, coHoi, dieuKhoan] = await Promise.all([
        danhSachNguoiPhuTrach(nc, "quotation.update"),
        tx.contact.findMany({ where: { customerId: ct.baoGia.khachHang.id, status: "hoat-dong" }, select: { id: true, fullName: true }, orderBy: [{ isPrimary: "desc" }, { fullName: "asc" }] }),
        coQuyen(nd.hoSo, "sales.view")
          ? tx.opportunity.findMany({ where: { customerId: ct.baoGia.khachHang.id }, select: { id: true, code: true, title: true, stage: true }, orderBy: { createdAt: "desc" }, take: 50 })
          : Promise.resolve([]),
        luaChonDuLieuGoc(nc, ["dieu_khoan_thanh_toan", "dieu_khoan_giao_hang", "don_vi_tinh"]),
      ]);
      return { ct, nguoi, lienHe, coHoi, dieuKhoan };
    } catch (loi) {
      if (loi instanceof LoiKhongTimThay) return null;
      throw loi;
    }
  });
  if (!du) notFound();

  const { ct } = du;
  const pb = ct.baoGia.phienBanHienHanh;
  const soHienThi = pb ? soPhienBan(ct.baoGia.so, pb.phienBan) : ct.baoGia.so;
  const dauTrang = (
    <DauTrang
      tieuDe={`Sửa ${soHienThi}`}
      duongDan={[{ nhan: "Bán hàng" }, { nhan: "Báo giá", href: "/ban-hang/bao-gia" }, { nhan: ct.baoGia.so, href: `/ban-hang/bao-gia/${ct.baoGia.id}` }]}
    />
  );

  if (!pb || !ct.quyen.sua) {
    return (
      <>
        {dauTrang}
        <section className="the">
          <TrongRong tieuDe="Phiên bản này không sửa trực tiếp được nữa">
            Bản đã gửi khách phải giữ nguyên để đối chiếu. Muốn đổi số liệu thì tạo phiên bản mới ở trang chi tiết.
            <div style={{ marginTop: 12 }}>
              <Link className="nut" href={`/ban-hang/bao-gia/${ct.baoGia.id}`}>
                Về trang báo giá
              </Link>
            </div>
          </TrongRong>
        </section>
      </>
    );
  }

  const dong: DongNhap[] = pb.dong.map((d, i) => ({
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
    nhaCungCapId: d.nhaCungCapId,
  }));

  return (
    <>
      {dauTrang}
      {pb.trangThai === "APPROVED" && (
        <div className="hop-thong-bao canh-bao" role="status">
          Bản này đã được duyệt. Lưu thay đổi sẽ đưa về trạng thái Nháp và phải xin duyệt lại — vì người duyệt đã duyệt cho con số cũ.
        </div>
      )}
      <FormBaoGia
        nguoiPhuTrach={du.nguoi}
        dieuKhoanThanhToan={du.dieuKhoan.dieu_khoan_thanh_toan}
        dieuKhoanGiaoHang={du.dieuKhoan.dieu_khoan_giao_hang}
        donViTinh={du.dieuKhoan.don_vi_tinh}
        lienHeBanDau={du.lienHe.map((l) => ({ id: l.id, hoTen: l.fullName }))}
        coHoiBanDau={du.coHoi.filter((c) => laCoHoiDangMo(c.stage) || c.id === ct.baoGia.coHoi?.id).map((c) => ({ id: c.id, ma: c.code, tieuDe: c.title }))}
        hienGiaVon={coQuyen(nd.hoSo, "product.view")}
        nguongBienLoiNhuan={ct.nguongBienLoiNhuan}
        banDau={{
          id: ct.baoGia.id,
          khachHang: { id: ct.baoGia.khachHang.id, ma: ct.baoGia.khachHang.ma, ten: ct.baoGia.khachHang.ten },
          lienHeId: ct.baoGia.lienHe?.id ?? "",
          coHoiId: ct.baoGia.coHoi?.id ?? "",
          nguoiPhuTrachId: ct.baoGia.nguoiPhuTrach.id,
          dieuKhoanThanhToan: pb.dieuKhoanThanhToan ?? "",
          dieuKhoanGiaoHang: pb.dieuKhoanGiaoHang ?? "",
          dieuKhoanBaoHanh: pb.dieuKhoanBaoHanh ?? "",
          hieuLucDen: pb.hieuLucDen ? new Date(pb.hieuLucDen).toISOString().slice(0, 10) : "",
          ghiChu: pb.ghiChu ?? "",
          dong,
        }}
      />
    </>
  );
}
