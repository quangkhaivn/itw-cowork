import Link from "next/link";
import { notFound } from "next/navigation";
import DauTrang from "@/components/ui/DauTrang";
import TrongRong from "@/components/ui/TrongRong";
import { taoNguCanh } from "@/lib/api";
import { LoiKhongTimThay } from "@/lib/loi";
import { coQuyen } from "@/lib/phan-quyen";
import { dinhDangNgay, dinhDangNgayGio, dinhDangPhanTram, dinhDangSo, dinhDangTien } from "@/lib/dinh-dang";
import { docDuLieu, layMot, yeuCauQuyen, type ThamSoTrang } from "@/lib/trang";
import { banDoTenDuLieuGoc } from "@/modules/crm/chung";
import { chiTietDonHang } from "@/modules/don-hang/service";
import { LOP_TRANG_THAI_DON, NHAN_TRANG_THAI_DON } from "@/modules/don-hang/tinh-toan";
import { danhSachKho } from "@/modules/kho/service";
import TacVuDonHang from "./TacVuDonHang";

export const dynamic = "force-dynamic";

export default async function TrangChiTietDon({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: ThamSoTrang }) {
  const nd = await yeuCauQuyen("order.view");
  const { id } = await params;
  const sp = await searchParams;

  const du = await docDuLieu(nd, async (tx) => {
    const nc = taoNguCanh(tx, nd.phien.tenantId, nd.hoSo);
    try {
      const ct = await chiTietDonHang(nc, id);
      const [tenDieuKhoan, kho] = await Promise.all([
        banDoTenDuLieuGoc(nc, ["dieu_khoan_thanh_toan", "dieu_khoan_giao_hang", "don_vi_tinh"]),
        coQuyen(nd.hoSo, "inventory.view") ? danhSachKho(nc, true) : Promise.resolve([]),
      ]);
      return { ct, tenDieuKhoan, kho };
    } catch (loi) {
      if (loi instanceof LoiKhongTimThay) return null;
      throw loi;
    }
  });
  if (!du) notFound();

  const { ct, tenDieuKhoan, kho } = du;
  const don = ct.don;
  const hienGiaVon = coQuyen(nd.hoSo, "product.view");
  const moTao = layMot(sp.moTao) === "1";
  const tenDonVi = (ma: string | null) => (ma ? (tenDieuKhoan.don_vi_tinh?.[ma] ?? ma) : "");

  return (
    <>
      <DauTrang
        tieuDe={don.so}
        duongDan={[{ nhan: "Bán hàng" }, { nhan: "Đơn hàng", href: "/ban-hang/don-hang" }]}
        moTa={
          <>
            <Link href={`/crm/khach-hang/${don.khachHang.id}`}>{don.khachHang.ten}</Link>
            {don.baoGia && (
              <>
                {" · từ báo giá "}
                <Link href={`/ban-hang/bao-gia/${don.baoGia.id}`}>{don.baoGia.so}</Link>
              </>
            )}
            {" · Phụ trách: "}
            {don.nguoiPhuTrach.hoTen}
          </>
        }
        hanhDong={
          ct.quyen.sua && (
            <Link className="nut" href={`/ban-hang/don-hang/${don.id}/sua`}>
              Sửa
            </Link>
          )
        }
      />

      {moTao && (
        <div className="hop-thong-bao tot" role="status">
          Đã tạo đơn {don.so}. Kiểm tra lại rồi xác nhận để giữ hàng trong kho.
        </div>
      )}
      {don.trangThai === "CANCELLED" && (
        <div className="hop-thong-bao loi" role="status">
          Đơn đã hủy {don.huyLuc ? `lúc ${dinhDangNgayGio(don.huyLuc)}` : ""}. Lý do: {don.lyDoHuy}
        </div>
      )}

      {(ct.quyen.xacNhan || ct.quyen.huy || ct.quyen.xuatHang) && (
        <section className="the" style={{ padding: 16 }}>
          <TacVuDonHang
            donId={don.id}
            quyen={ct.quyen}
            kho={kho.map((k) => ({ id: k.id, ma: k.ma, ten: k.ten, macDinh: k.macDinh }))}
            dong={don.dong
              .filter((d) => d.conPhaiGiao > 0)
              .map((d) => ({ id: d.id, ten: d.ten, sku: d.sku, donViTinh: tenDonVi(d.donViTinh), conPhaiGiao: d.conPhaiGiao, theoSerial: d.theoSerial }))}
          />
        </section>
      )}

      <div className="luoi-ben-phai">
        <div>
          <section className="the">
            <div className="dau">
              <h2>Bảng hàng</h2>
              <span className={`huy-hieu ${LOP_TRANG_THAI_DON[don.trangThai] ?? ""}`}>{NHAN_TRANG_THAI_DON[don.trangThai] ?? don.trangThai}</span>
            </div>
            <div className="cuon-ngang">
              <table className="bang">
                <thead>
                  <tr>
                    <th className="so">#</th>
                    <th>Hàng hóa / dịch vụ</th>
                    <th className="so">SL đặt</th>
                    <th className="so">Đã giao</th>
                    <th className="so">Đơn giá</th>
                    {hienGiaVon && <th className="so an-tren-dt">Giá vốn</th>}
                    <th className="so">Thành tiền</th>
                  </tr>
                </thead>
                <tbody>
                  {don.dong.map((d, i) => (
                    <tr key={d.id}>
                      <td className="so nho">{i + 1}</td>
                      <td>
                        {d.sanPhamId && coQuyen(nd.hoSo, "product.view") ? <Link href={`/san-pham/${d.sanPhamId}`}>{d.ten}</Link> : d.ten}
                        {(d.sku || d.moTa) && (
                          <div className="dong-phu">
                            {d.sku}
                            {d.sku && d.moTa ? " · " : ""}
                            {d.moTa}
                          </div>
                        )}
                        {d.theoSerial && <div className="dong-phu">Quản lý theo số sê-ri</div>}
                      </td>
                      <td className="so">
                        {dinhDangSo(d.soLuong)} {tenDonVi(d.donViTinh)}
                      </td>
                      <td className="so">
                        {dinhDangSo(d.daGiao)}
                        {d.conPhaiGiao > 0 && don.trangThai !== "CANCELLED" && <div className="dong-phu">còn {dinhDangSo(d.conPhaiGiao)}</div>}
                      </td>
                      <td className="so">{dinhDangTien(d.donGia)}</td>
                      {hienGiaVon && <td className="so an-tren-dt nho">{dinhDangTien(d.giaVon)}</td>}
                      <td className="so">{dinhDangTien(d.thanhTien)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <dl className="tong-bao-gia">
              <div>
                <dt>Tạm tính</dt>
                <dd>{dinhDangTien(don.tamTinh)}</dd>
              </div>
              {Number(don.tongChietKhau) > 0 && (
                <div>
                  <dt>Chiết khấu</dt>
                  <dd>− {dinhDangTien(don.tongChietKhau)}</dd>
                </div>
              )}
              <div>
                <dt>Thuế GTGT</dt>
                <dd>{dinhDangTien(don.tongVat)}</dd>
              </div>
              <div className="tong-cong">
                <dt>Tổng cộng</dt>
                <dd>{dinhDangTien(don.tongCong)}</dd>
              </div>
              {hienGiaVon && (
                <div>
                  <dt>Biên lợi nhuận</dt>
                  <dd>
                    {don.bienLoiNhuan === null ? "—" : dinhDangPhanTram(don.bienLoiNhuan)}
                    <div className="dong-phu">Lãi gộp {dinhDangTien(don.loiNhuanGop)}</div>
                  </dd>
                </div>
              )}
            </dl>
          </section>

          <section className="the">
            <div className="dau">
              <h2>Phiếu xuất kho</h2>
            </div>
            {ct.phieuXuat.length === 0 ? (
              <TrongRong tieuDe="Chưa xuất hàng lần nào">
                {don.trangThai === "DRAFT" ? "Xác nhận đơn trước, rồi mới xuất hàng được." : "Bấm “Xuất hàng” ở trên để lập phiếu xuất."}
              </TrongRong>
            ) : (
              <ul className="ds-tuong-tac">
                {ct.phieuXuat.map((p) => (
                  <li key={p.id}>
                    <div className="dau-dong">
                      <strong>{p.so}</strong>
                      <span className="phu">{dinhDangNgayGio(p.luc)}</span>
                      <span className="huy-hieu">{p.kho.ten}</span>
                    </div>
                    <div className="dong-phu">
                      {p.dong.map((x) => `${x.sanPham?.ten ?? "—"} × ${dinhDangSo(x.soLuong)}`).join(" · ")}
                      {p.nguoiNhan ? ` · Người nhận: ${p.nguoiNhan}` : ""}
                    </div>
                    {p.ghiChu && <p>{p.ghiChu}</p>}
                  </li>
                ))}
              </ul>
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
                <dt>Tiến độ giao</dt>
                <dd>
                  {don.trangThai === "CANCELLED" ? (
                    <span className="mo">Đã hủy</span>
                  ) : (
                    <>
                      {don.tienDo.phanTram}%
                      <div className="dong-phu">
                        {dinhDangSo(don.tienDo.tongDaGiao)} / {dinhDangSo(don.tienDo.tongDat)} đơn vị hàng
                      </div>
                    </>
                  )}
                </dd>
              </div>
              <div>
                <dt>Ngày đặt</dt>
                <dd>{dinhDangNgay(don.ngayDat)}</dd>
              </div>
              <div>
                <dt>Giao dự kiến</dt>
                <dd>{don.ngayGiaoDuKien ? dinhDangNgay(don.ngayGiaoDuKien) : <span className="mo">Chưa hẹn</span>}</dd>
              </div>
              <div>
                <dt>Địa chỉ giao</dt>
                <dd>{don.diaChiGiao ?? <span className="mo">Chưa ghi</span>}</dd>
              </div>
              <div>
                <dt>Người nhận</dt>
                <dd>{don.lienHe ? `${don.lienHe.hoTen}${don.lienHe.dienThoai ? ` · ${don.lienHe.dienThoai}` : ""}` : <span className="mo">Chưa chọn</span>}</dd>
              </div>
              <div>
                <dt>Thanh toán</dt>
                <dd>{don.dieuKhoanThanhToan ? (tenDieuKhoan.dieu_khoan_thanh_toan?.[don.dieuKhoanThanhToan] ?? don.dieuKhoanThanhToan) : <span className="mo">—</span>}</dd>
              </div>
              <div>
                <dt>Giao hàng</dt>
                <dd>{don.dieuKhoanGiaoHang ? (tenDieuKhoan.dieu_khoan_giao_hang?.[don.dieuKhoanGiaoHang] ?? don.dieuKhoanGiaoHang) : <span className="mo">—</span>}</dd>
              </div>
              <div>
                <dt>Xác nhận</dt>
                <dd>{don.xacNhanLuc ? dinhDangNgayGio(don.xacNhanLuc) : <span className="mo">Chưa xác nhận</span>}</dd>
              </div>
              <div>
                <dt>Hoàn thành</dt>
                <dd>{don.hoanThanhLuc ? dinhDangNgayGio(don.hoanThanhLuc) : <span className="mo">Chưa xong</span>}</dd>
              </div>
              {don.ghiChu && (
                <div>
                  <dt>Ghi chú</dt>
                  <dd style={{ whiteSpace: "pre-wrap" }}>{don.ghiChu}</dd>
                </div>
              )}
            </dl>
          </section>

          {ct.giuCho.length > 0 && (
            <section className="the">
              <div className="dau">
                <h2>Hàng đang giữ chỗ</h2>
              </div>
              <dl className="bang-thong-tin">
                {ct.giuCho.map((g) => {
                  const dong = don.dong.find((d) => d.sanPhamId === g.sanPhamId);
                  const k = kho.find((x) => x.id === g.khoId);
                  return (
                    <div key={`${g.khoId}-${g.sanPhamId}`}>
                      <dt>{dong?.ten ?? "Sản phẩm"}</dt>
                      <dd>
                        {dinhDangSo(g.soLuong)}
                        {k && <div className="dong-phu">tại {k.ten}</div>}
                      </dd>
                    </div>
                  );
                })}
              </dl>
            </section>
          )}
        </div>
      </div>
    </>
  );
}
