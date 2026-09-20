import Link from "next/link";
import { notFound } from "next/navigation";
import DauTrang from "@/components/ui/DauTrang";
import TrongRong from "@/components/ui/TrongRong";
import { taoNguCanh } from "@/lib/api";
import { LoiKhongTimThay } from "@/lib/loi";
import { coQuyen } from "@/lib/phan-quyen";
import { dinhDangNgay, dinhDangNgayGio, dinhDangSo, dinhDangTien } from "@/lib/dinh-dang";
import { docDuLieu, layMot, yeuCauQuyen, type ThamSoTrang } from "@/lib/trang";
import { banDoTenDuLieuGoc, homNayVN } from "@/modules/crm/chung";
import { docCauHinh } from "@/modules/cau-hinh/service";
import { chiTietHoaDon } from "@/modules/tai-chinh/service";
import { hanThanhToanGoiY, NHAN_NHOM_TUOI_NO, NHAN_PHUONG_THUC_THU, NHAN_TINH_TRANG_THU, NHAN_TRANG_THAI_HOA_DON } from "@/modules/tai-chinh/tinh-toan";
import TacVuHoaDon from "./TacVuHoaDon";

export const dynamic = "force-dynamic";

export default async function TrangChiTietHoaDon({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: ThamSoTrang }) {
  const nd = await yeuCauQuyen("finance.view");
  const { id } = await params;
  const moTao = layMot((await searchParams).moTao) === "1";

  const du = await docDuLieu(nd, async (tx) => {
    const nc = taoNguCanh(tx, nd.phien.tenantId, nd.hoSo);
    try {
      const ct = await chiTietHoaDon(nc, id);
      const [tenDieuKhoan, soNgayCongNo] = await Promise.all([
        banDoTenDuLieuGoc(nc, ["dieu_khoan_thanh_toan", "don_vi_tinh"]),
        docCauHinh(tx, "tai_chinh.so_ngay_cong_no_mac_dinh"),
      ]);
      return { ct, tenDieuKhoan, soNgayCongNo };
    } catch (loi) {
      if (loi instanceof LoiKhongTimThay) return null;
      throw loi;
    }
  });
  if (!du) notFound();

  const { ct, tenDieuKhoan, soNgayCongNo } = du;
  const hd = ct.hoaDon;
  const thu = NHAN_TINH_TRANG_THU[hd.tinhTrangThu];
  const tuoi = NHAN_NHOM_TUOI_NO[hd.nhomTuoiNo as keyof typeof NHAN_NHOM_TUOI_NO];
  const tenDonVi = (ma: string | null) => (ma ? (tenDieuKhoan.don_vi_tinh?.[ma] ?? ma) : "");

  return (
    <>
      <DauTrang
        tieuDe={hd.so}
        duongDan={[{ nhan: "Tài chính" }, { nhan: "Hóa đơn", href: "/tai-chinh/hoa-don" }]}
        moTa={
          <>
            <Link href={`/crm/khach-hang/${hd.khachHang.id}`}>{hd.khachHang.ten}</Link>
            {hd.khachHang.maSoThue && ` · MST ${hd.khachHang.maSoThue}`}
            {hd.donHang && coQuyen(nd.hoSo, "order.view") && (
              <>
                {" · từ đơn "}
                <Link href={`/ban-hang/don-hang/${hd.donHang.id}`}>{hd.donHang.so}</Link>
              </>
            )}
          </>
        }
      />

      {moTao && (
        <div className="hop-thong-bao tot" role="status">
          Đã lập hóa đơn {hd.so}. Kiểm tra lại rồi phát hành — phát hành xong mới tính công nợ.
        </div>
      )}
      {hd.trangThai === "CANCELLED" && (
        <div className="hop-thong-bao loi" role="status">
          Hóa đơn đã hủy {hd.huyLuc ? `lúc ${dinhDangNgayGio(hd.huyLuc)}` : ""}. Lý do: {hd.lyDoHuy}
        </div>
      )}
      {hd.trangThai === "ISSUED" && hd.conNo > 0 && hd.soNgayQuaHan > 0 && (
        <div className="hop-thong-bao canh-bao" role="status">
          Hóa đơn quá hạn {dinhDangSo(hd.soNgayQuaHan)} ngày ({tuoi.nhan}), còn nợ {dinhDangTien(hd.conNo)}.
        </div>
      )}

      {(ct.quyen.phatHanh || ct.quyen.thuTien || ct.quyen.huy) && (
        <section className="the" style={{ padding: 16 }}>
          <TacVuHoaDon
            hoaDonId={hd.id}
            khachHangId={hd.khachHang.id}
            conNo={hd.conNo}
            hanGoiY={hanThanhToanGoiY(homNayVN(), soNgayCongNo)}
            quyen={ct.quyen}
          />
        </section>
      )}

      <div className="luoi-ben-phai">
        <div>
          <section className="the">
            <div className="dau">
              <h2>Nội dung hóa đơn</h2>
              <span className={`huy-hieu ${hd.trangThai === "ISSUED" ? "chinh" : hd.trangThai === "CANCELLED" ? "loi" : ""}`}>
                {NHAN_TRANG_THAI_HOA_DON[hd.trangThai] ?? hd.trangThai}
              </span>
            </div>
            <div className="cuon-ngang">
              <table className="bang">
                <thead>
                  <tr>
                    <th className="so">#</th>
                    <th>Hàng hóa / dịch vụ</th>
                    <th className="so">SL</th>
                    <th className="so">Đơn giá</th>
                    <th className="so an-tren-dt">VAT</th>
                    <th className="so">Thành tiền</th>
                  </tr>
                </thead>
                <tbody>
                  {hd.dong.map((d, i) => (
                    <tr key={d.id}>
                      <td className="so nho">{i + 1}</td>
                      <td>
                        {d.sanPhamId && coQuyen(nd.hoSo, "product.view") ? <Link href={`/san-pham/${d.sanPhamId}`}>{d.ten}</Link> : d.ten}
                        {d.sku && <div className="dong-phu">{d.sku}</div>}
                      </td>
                      <td className="so">
                        {dinhDangSo(d.soLuong)} {tenDonVi(d.donViTinh)}
                      </td>
                      <td className="so">{dinhDangTien(d.donGia)}</td>
                      <td className="so an-tren-dt nho">{Number(d.vat)}%</td>
                      <td className="so">{dinhDangTien(d.thanhTien)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <dl className="tong-bao-gia">
              <div>
                <dt>Tạm tính</dt>
                <dd>{dinhDangTien(hd.tamTinh)}</dd>
              </div>
              {Number(hd.tongChietKhau) > 0 && (
                <div>
                  <dt>Chiết khấu</dt>
                  <dd>− {dinhDangTien(hd.tongChietKhau)}</dd>
                </div>
              )}
              <div>
                <dt>Thuế GTGT</dt>
                <dd>{dinhDangTien(hd.tongVat)}</dd>
              </div>
              <div className="tong-cong">
                <dt>Tổng cộng</dt>
                <dd>{dinhDangTien(hd.tongCong)}</dd>
              </div>
              {hd.trangThai === "ISSUED" && (
                <>
                  <div>
                    <dt>Đã thu</dt>
                    <dd>{dinhDangTien(hd.daThu)}</dd>
                  </div>
                  <div className={hd.conNo > 0 ? "canh-bao" : undefined}>
                    <dt>Còn nợ</dt>
                    <dd>{dinhDangTien(hd.conNo)}</dd>
                  </div>
                </>
              )}
            </dl>
          </section>

          <section className="the">
            <div className="dau">
              <h2>Tiền đã thu</h2>
            </div>
            {hd.phieuThu.length === 0 ? (
              <TrongRong tieuDe="Chưa thu đồng nào">
                {hd.trangThai === "DRAFT" ? "Phát hành hóa đơn trước, rồi mới ghi nhận tiền khách trả." : "Bấm “Thu tiền” ở trên khi khách chuyển khoản hoặc trả tiền mặt."}
              </TrongRong>
            ) : (
              <table className="bang">
                <thead>
                  <tr>
                    <th>Phiếu thu</th>
                    <th>Hình thức</th>
                    <th className="an-tren-dt">Ngày</th>
                    <th className="so">Số tiền</th>
                  </tr>
                </thead>
                <tbody>
                  {hd.phieuThu.map((p) => (
                    <tr key={p.id} className={p.trangThai === "huy" ? "mo" : undefined}>
                      <td>
                        <Link href={`/tai-chinh/phieu-thu?q=${encodeURIComponent(p.so)}`}>{p.so}</Link>
                        {p.trangThai === "huy" && <div className="dong-phu chu-loi">đã hủy — không trừ nợ</div>}
                      </td>
                      <td className="nho">{NHAN_PHUONG_THUC_THU[p.phuongThuc] ?? p.phuongThuc}</td>
                      <td className="an-tren-dt so nho">{dinhDangNgay(p.ngayThu)}</td>
                      <td className="so">{dinhDangTien(p.soTien)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>

        <div>
          <section className="the">
            <div className="dau">
              <h2>Thông tin</h2>
            </div>
            <dl className="bang-thong-tin">
              <div>
                <dt>Tình trạng thu</dt>
                <dd>
                  <span className={`huy-hieu ${thu.lop}`}>{thu.nhan}</span>
                </dd>
              </div>
              <div>
                <dt>Ngày phát hành</dt>
                <dd>{hd.ngayPhatHanh ? dinhDangNgay(hd.ngayPhatHanh) : <span className="mo">Chưa phát hành</span>}</dd>
              </div>
              <div>
                <dt>Hạn thanh toán</dt>
                <dd>
                  {hd.hanThanhToan ? dinhDangNgay(hd.hanThanhToan) : <span className="mo">—</span>}
                  {hd.conNo > 0 && hd.soNgayQuaHan > 0 && <div className="dong-phu chu-loi">quá hạn {dinhDangSo(hd.soNgayQuaHan)} ngày</div>}
                </dd>
              </div>
              <div>
                <dt>Điều khoản</dt>
                <dd>{hd.dieuKhoanThanhToan ? (tenDieuKhoan.dieu_khoan_thanh_toan?.[hd.dieuKhoanThanhToan] ?? hd.dieuKhoanThanhToan) : <span className="mo">—</span>}</dd>
              </div>
              <div>
                <dt>Dự án</dt>
                <dd>{hd.duAn && coQuyen(nd.hoSo, "project.view") ? <Link href={`/du-an/${hd.duAn.id}`}>{hd.duAn.ma}</Link> : <span className="mo">—</span>}</dd>
              </div>
              <div>
                <dt>Người lập</dt>
                <dd>{hd.nguoiPhuTrach.hoTen}</dd>
              </div>
              <div>
                <dt>Lập lúc</dt>
                <dd>{dinhDangNgayGio(hd.taoLuc)}</dd>
              </div>
              {hd.ghiChu && (
                <div>
                  <dt>Ghi chú</dt>
                  <dd style={{ whiteSpace: "pre-wrap" }}>{hd.ghiChu}</dd>
                </div>
              )}
            </dl>
          </section>
        </div>
      </div>
    </>
  );
}
