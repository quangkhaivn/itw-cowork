import Link from "next/link";
import DauTrang from "@/components/ui/DauTrang";
import TrongRong from "@/components/ui/TrongRong";
import { taoNguCanh } from "@/lib/api";
import { dinhDangNgayGio, dinhDangPhanTram, dinhDangSo, dinhDangTien } from "@/lib/dinh-dang";
import { docDuLieu, yeuCauDangNhap } from "@/lib/trang";
import { NHAN_HANH_DONG, NHAN_DOI_TUONG } from "@/modules/kiem-toan/service";
import { tongQuanHeThong } from "@/modules/tong-quan/service";
import { bangDieuKhien } from "@/modules/bang-dieu-khien/service";

export const dynamic = "force-dynamic";

/**
 * Bảng điều hành — mục 20 prompt 20/09.
 *
 * Chỉ **số liệu thật**, tính ngay lúc mở trang, và chỉ những khối người đang xem có quyền:
 * Giám đốc thấy doanh thu và công nợ toàn công ty, trưởng phòng thấy nhóm, nhân viên kinh
 * doanh thấy pipeline của mình. Khối không có quyền thì không vẽ ô trống.
 */
export default async function BangDieuKhien() {
  const nd = await yeuCauDangNhap();
  const { bdk, tq } = await docDuLieu(nd, async (tx) => ({
    bdk: await bangDieuKhien(taoNguCanh(tx, nd.phien.tenantId, nd.hoSo)),
    tq: await tongQuanHeThong(tx, nd.hoSo),
  }));

  const khongCoKhoiNao = !bdk.banHang && !bdk.pipeline && !bdk.baoGia && !bdk.donHang && !bdk.kho && !bdk.dichVu && !bdk.duAn && !bdk.marketing;

  return (
    <>
      <DauTrang
        tieuDe={`Xin chào, ${nd.hoSo.hoTen}`}
        moTa="Số liệu thật, tính ngay lúc mở trang. Mỗi người chỉ thấy phần thuộc phạm vi của mình — không có con số minh họa."
      />

      {bdk.banHang && (
        <>
          <h2 className="tieu-de-khoi">Bán hàng tháng này</h2>
          <div className="luoi-chi-so">
            <div className="the chi-so">
              <div className="nhan">Doanh thu (hóa đơn đã phát hành)</div>
              <div className="gia-tri">{dinhDangTien(bdk.banHang.doanhThuThangNay)}</div>
              <div className="ghi-chu">
                {dinhDangSo(bdk.banHang.soHoaDonThangNay)} hóa đơn
                {bdk.banHang.tangTruong !== null && (
                  <>
                    {" · "}
                    <span className={bdk.banHang.tangTruong < 0 ? "chu-loi" : undefined}>
                      {bdk.banHang.tangTruong > 0 ? "+" : ""}
                      {dinhDangPhanTram(bdk.banHang.tangTruong)} so với tháng trước
                    </span>
                  </>
                )}
              </div>
            </div>
            <div className="the chi-so">
              <div className="nhan">Lợi nhuận gộp</div>
              <div className="gia-tri">{dinhDangTien(bdk.banHang.loiNhuanGop)}</div>
              <div className="ghi-chu">
                {bdk.banHang.bienLoiNhuan === null ? "chưa có doanh thu để tính biên" : `biên ${dinhDangPhanTram(bdk.banHang.bienLoiNhuan)}`} · giá vốn{" "}
                {dinhDangTien(bdk.banHang.giaVonThangNay)}
              </div>
            </div>
            {bdk.congNo && (
              <>
                <div className="the chi-so">
                  <div className="nhan">Còn phải thu</div>
                  <div className="gia-tri">{dinhDangTien(bdk.congNo.tongConNo)}</div>
                  <div className="ghi-chu">
                    <Link href="/tai-chinh/cong-no">Xem công nợ theo khách</Link>
                  </div>
                </div>
                <div className={`the chi-so ${bdk.congNo.tongQuaHan > 0 ? "loi" : ""}`}>
                  <div className="nhan">Nợ quá hạn</div>
                  <div className="gia-tri">{dinhDangTien(bdk.congNo.tongQuaHan)}</div>
                  <div className="ghi-chu">
                    {bdk.congNo.soHoaDonQuaHan > 0 ? (
                      <Link href="/tai-chinh/hoa-don?trangThai=qua-han">{dinhDangSo(bdk.congNo.soHoaDonQuaHan)} hóa đơn cần đòi</Link>
                    ) : (
                      "Không có hóa đơn quá hạn"
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </>
      )}

      {(bdk.pipeline || bdk.baoGia || bdk.donHang) && (
        <>
          <h2 className="tieu-de-khoi">Đường ống bán hàng</h2>
          <div className="luoi-chi-so">
            {bdk.pipeline && (
              <div className="the chi-so">
                <div className="nhan">Cơ hội đang mở</div>
                <div className="gia-tri">{dinhDangTien(bdk.pipeline.tongGiaTri)}</div>
                <div className="ghi-chu">
                  {dinhDangSo(bdk.pipeline.soCoHoi)} cơ hội · có trọng số {dinhDangTien(bdk.pipeline.coTrongSo)}
                  {bdk.pipeline.quaHanHanhDong > 0 && (
                    <>
                      {" · "}
                      <Link href="/ban-hang/co-hoi?quaHan=1" className="chu-loi">
                        {dinhDangSo(bdk.pipeline.quaHanHanhDong)} quá hạn hành động
                      </Link>
                    </>
                  )}
                </div>
              </div>
            )}
            {bdk.baoGia && (
              <div className={`the chi-so ${bdk.baoGia.choDuyet > 0 ? "canh-bao" : ""}`}>
                <div className="nhan">Báo giá đang chạy</div>
                <div className="gia-tri">{dinhDangTien(bdk.baoGia.giaTriDangChay)}</div>
                <div className="ghi-chu">
                  {bdk.baoGia.choDuyet > 0 ? (
                    <Link href="/ban-hang/bao-gia?choDuyet=1">{dinhDangSo(bdk.baoGia.choDuyet)} chờ duyệt</Link>
                  ) : (
                    "không có bản chờ duyệt"
                  )}
                  {` · ${dinhDangSo(bdk.baoGia.dangChoKhach)} đang chờ khách trả lời`}
                </div>
              </div>
            )}
            {bdk.donHang && (
              <div className="the chi-so">
                <div className="nhan">Đơn chờ giao</div>
                <div className="gia-tri">{dinhDangSo(bdk.donHang.choGiao)}</div>
                <div className="ghi-chu">
                  {dinhDangTien(bdk.donHang.giaTriChoGiao)} · đã giao xong {dinhDangSo(bdk.donHang.daGiaoThangNay)} đơn trong tháng
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {(bdk.kho || bdk.dichVu || bdk.duAn) && (
        <>
          <h2 className="tieu-de-khoi">Vận hành</h2>
          <div className="luoi-chi-so">
            {bdk.kho && (
              <div className={`the chi-so ${bdk.kho.hetHang > 0 ? "loi" : bdk.kho.sapHet > 0 ? "canh-bao" : ""}`}>
                <div className="nhan">Hết hàng / sắp hết</div>
                <div className="gia-tri">
                  {dinhDangSo(bdk.kho.hetHang)} / {dinhDangSo(bdk.kho.sapHet)}
                </div>
                <div className="ghi-chu">
                  <Link href="/kho?canhBao=1">Xem tồn kho cảnh báo</Link> · {dinhDangSo(bdk.kho.tongMatHang)} dòng tồn
                </div>
              </div>
            )}
            {bdk.dichVu && (
              <div className={`the chi-so ${bdk.dichVu.treHan > 0 ? "loi" : ""}`}>
                <div className="nhan">Phiếu hỗ trợ đang mở</div>
                <div className="gia-tri">{dinhDangSo(bdk.dichVu.dangMo)}</div>
                <div className="ghi-chu">
                  {bdk.dichVu.treHan > 0 ? (
                    <Link href="/dich-vu/ho-tro?treHan=1" className="chu-loi">
                      {dinhDangSo(bdk.dichVu.treHan)} trễ hạn cam kết
                    </Link>
                  ) : (
                    "đang trong hạn"
                  )}
                  {bdk.dichVu.baoHanhSapHet !== null && ` · ${dinhDangSo(bdk.dichVu.baoHanhSapHet)} máy sắp hết bảo hành`}
                </div>
              </div>
            )}
            {bdk.duAn && (
              <div className={`the chi-so ${bdk.duAn.quaHan > 0 ? "canh-bao" : ""}`}>
                <div className="nhan">Dự án đang chạy</div>
                <div className="gia-tri">{dinhDangSo(bdk.duAn.dangChay)}</div>
                <div className="ghi-chu">
                  {bdk.duAn.quaHan > 0 ? <Link href="/du-an?quaHan=1">{dinhDangSo(bdk.duAn.quaHan)} quá hạn dự kiến</Link> : "đúng tiến độ"}
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {bdk.marketing && (
        <>
          <h2 className="tieu-de-khoi">Marketing tháng này</h2>
          <div className="luoi-chi-so">
            <div className="the chi-so">
              <div className="nhan">Lead mới trong tháng</div>
              <div className="gia-tri">{dinhDangSo(bdk.marketing.soLeadThang)}</div>
              <div className="ghi-chu">
                {bdk.marketing.theoNguon.length === 0
                  ? "chưa có lead nào"
                  : bdk.marketing.theoNguon.map((n) => `${n.nguon} ${dinhDangSo(n.soLead)}`).join(" · ")}
              </div>
            </div>
            <div className="the chi-so">
              <div className="nhan">Chi phí / lead (CPL)</div>
              <div className="gia-tri">{bdk.marketing.cplThang === null ? "—" : dinhDangTien(bdk.marketing.cplThang)}</div>
              <div className="ghi-chu">
                {bdk.marketing.cplThang === null
                  ? "chưa có lead gắn chiến dịch trong tháng"
                  : `${dinhDangTien(bdk.marketing.chiPhiThang)} cho ${dinhDangSo(bdk.marketing.soLeadChienDichThang)} lead từ chiến dịch`}
              </div>
            </div>
            <div className="the chi-so">
              <div className="nhan">Chiến dịch nhiều lead nhất</div>
              <div className="gia-tri">{bdk.marketing.theoChienDich[0] ? dinhDangSo(bdk.marketing.theoChienDich[0].soLead) : "—"}</div>
              <div className="ghi-chu">
                {bdk.marketing.theoChienDich[0] ? (
                  <Link href={`/marketing/chien-dich/${bdk.marketing.theoChienDich[0].id}`}>{bdk.marketing.theoChienDich[0].ten}</Link>
                ) : (
                  <Link href="/marketing/chien-dich">Chưa có chiến dịch nào có lead trong tháng</Link>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      <h2 className="tieu-de-khoi">Việc của tôi</h2>
      <div className="luoi-chi-so">
        <div className="the chi-so">
          <div className="nhan">Việc đang mở của tôi</div>
          <div className="gia-tri">{dinhDangSo(bdk.viec.cuaToi)}</div>
          <div className="ghi-chu">
            <Link href="/cong-viec">Xem danh sách việc</Link>
          </div>
        </div>
        <div className={`the chi-so ${bdk.viec.quaHan > 0 ? "canh-bao" : ""}`}>
          <div className="nhan">Việc quá hạn trong phạm vi</div>
          <div className="gia-tri">{dinhDangSo(bdk.viec.quaHan)}</div>
          <div className="ghi-chu">{bdk.viec.quaHan > 0 ? <Link href="/cong-viec?cheDo=qua-han">Xử lý ngay</Link> : "không có việc quá hạn"}</div>
        </div>
      </div>

      {khongCoKhoiNao && (
        <section className="the">
          <TrongRong tieuDe="Chưa có khối chỉ số nào cho vai trò của bạn">
            Bảng điều hành chỉ hiện phần bạn có quyền xem. Nếu cần thêm, đề nghị quản trị hệ thống cấp quyền ở màn hình Vai trò.
          </TrongRong>
        </section>
      )}

      <h2 className="tieu-de-khoi">Tài khoản và hệ thống</h2>
      <div className="luoi-chi-so">
        <div className="the chi-so">
          <div className="nhan">Người dùng đang hoạt động</div>
          <div className="gia-tri">{dinhDangSo(tq.nguoiHoatDong)}</div>
        </div>
        <div className={`the chi-so ${tq.nguoiBiKhoa ? "canh-bao" : ""}`}>
          <div className="nhan">Tài khoản đang bị khóa tạm</div>
          <div className="gia-tri">{dinhDangSo(tq.nguoiBiKhoa)}</div>
          <div className="ghi-chu">Do sai mật khẩu nhiều lần</div>
        </div>
        <div className="the chi-so">
          <div className="nhan">Chưa đổi mật khẩu khởi tạo</div>
          <div className="gia-tri">{dinhDangSo(tq.phaiDoiMatKhau)}</div>
        </div>
        {tq.anNinh && (
          <div className={`the chi-so ${tq.anNinh.tuChoi7Ngay ? "canh-bao" : ""}`}>
            <div className="nhan">Bị từ chối quyền (7 ngày)</div>
            <div className="gia-tri">{dinhDangSo(tq.anNinh.tuChoi7Ngay)}</div>
            <div className="ghi-chu">Nhiều lần liên tiếp có thể là dò quyền</div>
          </div>
        )}
      </div>

      <div className="luoi-the">
        <section className="the">
          <div className="dau">
            <h2>Vai trò của bạn</h2>
            <Link href="/tai-khoan" className="nho">
              Xem quyền chi tiết
            </Link>
          </div>
          <div className="than">
            {nd.hoSo.vaiTro.length === 0 ? (
              <p className="phu">Bạn chưa được gán vai trò nào. Liên hệ quản trị hệ thống.</p>
            ) : (
              <div className="chuoi-huy-hieu">
                {nd.hoSo.vaiTro.map((v) => (
                  <span className="huy-hieu chinh" key={v.code}>
                    {v.name}
                  </span>
                ))}
              </div>
            )}
            <p className="phu" style={{ marginTop: 12, marginBottom: 0 }}>
              Bạn có {dinhDangSo(nd.hoSo.quyen.size)} quyền. Nhấn Ctrl + K để tìm nhanh màn hình và người dùng.
            </p>
          </div>
        </section>

        {tq.xemQuanTri && (
          <section className="the">
            <div className="dau">
              <h2>Thay đổi quản trị gần đây</h2>
              <Link href="/quan-tri/nhat-ky-kiem-toan" className="nho">
                Toàn bộ nhật ký
              </Link>
            </div>
            {tq.ganDay.length === 0 ? (
              <TrongRong tieuDe="Chưa có thay đổi nào">Tạo người dùng hoặc sửa cấu hình sẽ hiện ở đây.</TrongRong>
            ) : (
              <div className="cuon-ngang">
                <table className="bang">
                  <tbody>
                    {tq.ganDay.map((d) => (
                      <tr key={d.id}>
                        <td className="so nho" style={{ whiteSpace: "nowrap" }}>
                          {dinhDangNgayGio(d.createdAt)}
                        </td>
                        <td>
                          {NHAN_HANH_DONG[d.action] ?? d.action} · {NHAN_DOI_TUONG[d.objectType] ?? d.objectType}
                          <div className="dong-phu">{d.actorEmail ?? "hệ thống"}</div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}
      </div>
    </>
  );
}
