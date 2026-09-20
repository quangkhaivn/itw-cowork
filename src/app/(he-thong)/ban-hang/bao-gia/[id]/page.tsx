import Link from "next/link";
import { notFound } from "next/navigation";
import DauTrang from "@/components/ui/DauTrang";
import TrongRong from "@/components/ui/TrongRong";
import { taoNguCanh } from "@/lib/api";
import { LoiKhongTimThay } from "@/lib/loi";
import { coQuyen } from "@/lib/phan-quyen";
import { dinhDangNgay, dinhDangNgayGio, dinhDangPhanTram, dinhDangTien } from "@/lib/dinh-dang";
import { docDuLieu, layMot, yeuCauQuyen, type ThamSoTrang } from "@/lib/trang";
import { banDoTenDuLieuGoc } from "@/modules/crm/chung";
import { chiTietBaoGia, soPhienBan, xemPhienBan } from "@/modules/bao-gia/service";
import { canDuyet, LOP_TRANG_THAI_BAO_GIA, NHAN_TRANG_THAI_BAO_GIA } from "@/modules/bao-gia/tinh-toan";
import TacVuBaoGia from "./TacVuBaoGia";

export const dynamic = "force-dynamic";

const LA_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const NHAN_QUYET_DINH: Record<string, string> = {
  PENDING: "Đang chờ",
  APPROVED: "Đồng ý duyệt",
  REJECTED: "Từ chối",
};

export default async function TrangChiTietBaoGia({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: ThamSoTrang }) {
  const nd = await yeuCauQuyen("quotation.view");
  const { id } = await params;
  const sp = await searchParams;
  const banId = layMot(sp.phienBan);

  const du = await docDuLieu(nd, async (tx) => {
    const nc = taoNguCanh(tx, nd.phien.tenantId, nd.hoSo);
    try {
      const ct = await chiTietBaoGia(nc, id);
      // Xem lại một bản cũ: đọc đúng bản đó, và khóa mọi hành động.
      const banCu = LA_UUID.test(banId) && banId !== ct.baoGia.phienBanHienHanh?.id ? (await xemPhienBan(nc, id, banId)).phienBan : null;
      // Điều khoản lưu bằng mã dữ liệu gốc — đổi sang tên để hiển thị.
      const tenDieuKhoan = await banDoTenDuLieuGoc(nc, ["dieu_khoan_thanh_toan", "dieu_khoan_giao_hang", "don_vi_tinh"]);
      return { ct, banCu, tenDieuKhoan };
    } catch (loi) {
      if (loi instanceof LoiKhongTimThay) return null;
      throw loi;
    }
  });
  if (!du) notFound();

  const { ct, banCu, tenDieuKhoan } = du;
  const bg = ct.baoGia;
  const pb = banCu ?? bg.phienBanHienHanh;
  const xemBanCu = banCu !== null;
  const hienGiaVon = coQuyen(nd.hoSo, "product.view");
  const moTao = layMot(sp.moTao) === "1";
  const daLuu = layMot(sp.daLuu) === "1";
  const phaiDuyet = pb ? canDuyet(pb.bienLoiNhuan, ct.nguongBienLoiNhuan) : { can: false, lyDo: null };
  const duoiNguong = ct.nguongBienLoiNhuan !== null && pb?.bienLoiNhuan !== null && pb !== null && pb.bienLoiNhuan < ct.nguongBienLoiNhuan;

  return (
    <>
      <DauTrang
        tieuDe={pb ? soPhienBan(bg.so, pb.phienBan) : bg.so}
        duongDan={[{ nhan: "Bán hàng" }, { nhan: "Báo giá", href: "/ban-hang/bao-gia" }]}
        moTa={
          <>
            <Link href={`/crm/khach-hang/${bg.khachHang.id}`}>{bg.khachHang.ten}</Link>
            {bg.coHoi && (
              <>
                {" · "}
                <Link href={`/ban-hang/co-hoi/${bg.coHoi.id}`}>{bg.coHoi.ma}</Link>
              </>
            )}
            {" · "}Người lập: {bg.nguoiPhuTrach.hoTen}
          </>
        }
        hanhDong={
          <>
            {pb && (
              <Link className="nut" href={`/bao-gia/${bg.id}/in${xemBanCu ? `?phienBan=${pb.id}` : ""}`} target="_blank" rel="noopener">
                Xem bản in
              </Link>
            )}
            {!xemBanCu && ct.quyen.sua && (
              <Link className="nut" href={`/ban-hang/bao-gia/${bg.id}/sua`}>
                Sửa
              </Link>
            )}
          </>
        }
      />

      {moTao && (
        <div className="hop-thong-bao tot" role="status">
          Đã tạo báo giá {bg.so}. Kiểm tra lại bảng hàng rồi xin duyệt hoặc gửi khách.
        </div>
      )}
      {daLuu && (
        <div className="hop-thong-bao tot" role="status">
          Đã lưu thay đổi.
        </div>
      )}
      {xemBanCu && (
        <div className="hop-thong-bao canh-bao" role="status">
          Bạn đang xem lại phiên bản V{pb?.phienBan} — bản cũ, chỉ để đối chiếu.{" "}
          <Link href={`/ban-hang/bao-gia/${bg.id}`}>Về bản hiện hành</Link>
        </div>
      )}
      {ct.donHang && (
        <div className="hop-thong-bao tot" role="status">
          Báo giá này đã thành đơn hàng <Link href={`/ban-hang/don-hang/${ct.donHang.id}`}>{ct.donHang.so}</Link>.
        </div>
      )}
      {ct.quyen.tuDuyetBiChan && !xemBanCu && (
        <div className="hop-thong-bao canh-bao" role="status">
          Bạn là người lập báo giá này nên không tự duyệt được. Chuyển cho cấp trên duyệt (BG-05).
        </div>
      )}

      {!xemBanCu && pb && (
        <section className="the" style={{ padding: 16 }}>
          <TacVuBaoGia baoGiaId={bg.id} quyen={ct.quyen} canDuyet={phaiDuyet.can} lyDoCanDuyet={phaiDuyet.lyDo} />
        </section>
      )}

      {ct.cacPhienBan.length > 1 && (
        <nav className="thanh-the" aria-label="Phiên bản báo giá">
          {ct.cacPhienBan.map((v) => {
            const dangXem = pb?.id === v.id;
            return (
              <Link key={v.id} href={dangXem ? `/ban-hang/bao-gia/${bg.id}` : `/ban-hang/bao-gia/${bg.id}?phienBan=${v.id}`} aria-current={dangXem ? "page" : undefined}>
                V{v.phienBan} · {dinhDangTien(v.tongCong)}
              </Link>
            );
          })}
        </nav>
      )}

      {!pb ? (
        <section className="the">
          <TrongRong tieuDe="Báo giá chưa có phiên bản nào">Dữ liệu bất thường — báo cho quản trị hệ thống.</TrongRong>
        </section>
      ) : (
        <div className="luoi-ben-phai">
          <div>
            <section className="the">
              <div className="dau">
                <h2>Bảng hàng</h2>
                <span className={`huy-hieu ${LOP_TRANG_THAI_BAO_GIA[pb.trangThaiHienThi] ?? ""}`}>{NHAN_TRANG_THAI_BAO_GIA[pb.trangThaiHienThi] ?? pb.trangThaiHienThi}</span>
              </div>
              <div className="cuon-ngang">
                <table className="bang">
                  <thead>
                    <tr>
                      <th className="so">#</th>
                      <th>Hàng hóa / dịch vụ</th>
                      <th className="so">SL</th>
                      <th className="so">Đơn giá</th>
                      <th className="so an-tren-dt">CK</th>
                      <th className="so an-tren-dt">VAT</th>
                      {hienGiaVon && <th className="so an-tren-dt">Giá vốn</th>}
                      <th className="so">Thành tiền</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pb.dong.map((d, i) => (
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
                        </td>
                        <td className="so">
                          {Number(d.soLuong).toLocaleString("vi-VN")} {(d.donViTinh ? tenDieuKhoan.don_vi_tinh?.[d.donViTinh] : null) ?? d.donViTinh}
                        </td>
                        <td className="so">{dinhDangTien(d.donGia)}</td>
                        <td className="so an-tren-dt nho">{Number(d.chietKhau) > 0 ? dinhDangPhanTram(d.chietKhau) : "—"}</td>
                        <td className="so an-tren-dt nho">{dinhDangPhanTram(d.vat)}</td>
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
                  <dd>{dinhDangTien(pb.tamTinh)}</dd>
                </div>
                {Number(pb.tongChietKhau) > 0 && (
                  <div>
                    <dt>Chiết khấu</dt>
                    <dd>− {dinhDangTien(pb.tongChietKhau)}</dd>
                  </div>
                )}
                <div>
                  <dt>Thuế GTGT</dt>
                  <dd>{dinhDangTien(pb.tongVat)}</dd>
                </div>
                <div className="tong-cong">
                  <dt>Tổng cộng</dt>
                  <dd>{dinhDangTien(pb.tongCong)}</dd>
                </div>
                {hienGiaVon && (
                  <div className={duoiNguong ? "canh-bao" : undefined}>
                    <dt>Biên lợi nhuận</dt>
                    <dd>
                      {pb.bienLoiNhuan === null ? "—" : dinhDangPhanTram(pb.bienLoiNhuan)}
                      <div className="dong-phu">
                        Lãi gộp {dinhDangTien(pb.loiNhuanGop)} · giá vốn {dinhDangTien(pb.tongGiaVon)}
                        {ct.nguongBienLoiNhuan === null ? " · chưa đặt ngưỡng duyệt" : ` · ngưỡng ${ct.nguongBienLoiNhuan}%`}
                      </div>
                    </dd>
                  </div>
                )}
              </dl>
            </section>

            {(pb.dieuKhoanThanhToan || pb.dieuKhoanGiaoHang || pb.dieuKhoanBaoHanh || pb.ghiChu) && (
              <section className="the">
                <div className="dau">
                  <h2>Điều khoản</h2>
                </div>
                <dl className="bang-thong-tin">
                  {pb.dieuKhoanThanhToan && (
                    <div>
                      <dt>Thanh toán</dt>
                      <dd>{tenDieuKhoan.dieu_khoan_thanh_toan?.[pb.dieuKhoanThanhToan] ?? pb.dieuKhoanThanhToan}</dd>
                    </div>
                  )}
                  {pb.dieuKhoanGiaoHang && (
                    <div>
                      <dt>Giao hàng</dt>
                      <dd>{tenDieuKhoan.dieu_khoan_giao_hang?.[pb.dieuKhoanGiaoHang] ?? pb.dieuKhoanGiaoHang}</dd>
                    </div>
                  )}
                  {pb.dieuKhoanBaoHanh && (
                    <div>
                      <dt>Bảo hành</dt>
                      <dd style={{ whiteSpace: "pre-wrap" }}>{pb.dieuKhoanBaoHanh}</dd>
                    </div>
                  )}
                  {pb.ghiChu && (
                    <div>
                      <dt>Ghi chú nội bộ</dt>
                      <dd style={{ whiteSpace: "pre-wrap" }}>{pb.ghiChu}</dd>
                    </div>
                  )}
                </dl>
              </section>
            )}
          </div>

          <div>
            <section className="the">
              <div className="dau">
                <h2>Thông tin</h2>
              </div>
              <dl className="bang-thong-tin">
                <div>
                  <dt>Khách hàng</dt>
                  <dd>
                    <Link href={`/crm/khach-hang/${bg.khachHang.id}`}>{bg.khachHang.ten}</Link>
                    <div className="dong-phu">{bg.khachHang.maSoThue ? `MST ${bg.khachHang.maSoThue}` : bg.khachHang.ma}</div>
                  </dd>
                </div>
                <div>
                  <dt>Người nhận</dt>
                  <dd>{bg.lienHe ? `${bg.lienHe.hoTen}${bg.lienHe.chucDanh ? ` — ${bg.lienHe.chucDanh}` : ""}` : <span className="mo">Chưa chọn</span>}</dd>
                </div>
                <div>
                  <dt>Hiệu lực đến</dt>
                  <dd>{pb.hieuLucDen ? dinhDangNgay(pb.hieuLucDen) : <span className="mo">Không ghi</span>}</dd>
                </div>
                <div>
                  <dt>Gửi khách</dt>
                  <dd>{pb.guiLuc ? dinhDangNgayGio(pb.guiLuc) : <span className="mo">Chưa gửi</span>}</dd>
                </div>
                <div>
                  <dt>Chốt</dt>
                  <dd>
                    {pb.chotLuc ? dinhDangNgayGio(pb.chotLuc) : <span className="mo">Chưa chốt</span>}
                    {pb.ghiChuChot && <div className="dong-phu">{pb.ghiChuChot}</div>}
                  </dd>
                </div>
                <div>
                  <dt>Tạo lúc</dt>
                  <dd>{dinhDangNgayGio(pb.taoLuc)}</dd>
                </div>
              </dl>
            </section>

            <section className="the">
              <div className="dau">
                <h2>Lịch sử duyệt</h2>
              </div>
              {pb.duyet.length === 0 ? (
                <TrongRong tieuDe="Bản này chưa qua duyệt">
                  {phaiDuyet.can ? "Biên lợi nhuận chưa đạt ngưỡng nên sẽ phải xin duyệt trước khi gửi." : "Biên lợi nhuận đạt ngưỡng — gửi thẳng cho khách được."}
                </TrongRong>
              ) : (
                <ul className="ds-tuong-tac">
                  {pb.duyet.map((d) => (
                    <li key={d.id}>
                      <div className="dau-dong">
                        <strong>{(d.quyetDinh ? NHAN_QUYET_DINH[d.quyetDinh] ?? d.quyetDinh : null) ?? "Đang chờ"}</strong>
                        <span className="phu">{dinhDangNgayGio(d.quyetLuc ?? d.xinLuc)}</span>
                      </div>
                      <div className="dong-phu">
                        {(d.nguoiXinId ? ct.tenNguoi[d.nguoiXinId] : null) ?? "—"} xin duyệt
                        {d.nguoiQuyetId ? ` · ${ct.tenNguoi[d.nguoiQuyetId] ?? "—"} quyết` : ""}
                        {d.bienLucXin !== null ? ` · biên ${dinhDangPhanTram(d.bienLucXin)}` : ""}
                        {d.nguongLucXin !== null ? ` / ngưỡng ${dinhDangPhanTram(d.nguongLucXin)}` : d.lyDo === "threshold_not_set" ? " · chưa đặt ngưỡng" : ""}
                      </div>
                      {d.ghiChu && <p>{d.ghiChu}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      )}
    </>
  );
}
