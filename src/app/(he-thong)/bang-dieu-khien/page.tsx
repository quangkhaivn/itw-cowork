import Link from "next/link";
import DauTrang from "@/components/ui/DauTrang";
import TrongRong from "@/components/ui/TrongRong";
import { dinhDangNgayGio, dinhDangSo } from "@/lib/dinh-dang";
import { docDuLieu, yeuCauDangNhap } from "@/lib/trang";
import { NHAN_HANH_DONG, NHAN_DOI_TUONG } from "@/modules/kiem-toan/service";
import { tongQuanHeThong } from "@/modules/tong-quan/service";

export const dynamic = "force-dynamic";

export default async function BangDieuKhien() {
  const nd = await yeuCauDangNhap();
  const tq = await docDuLieu(nd, (tx) => tongQuanHeThong(tx, nd.hoSo));

  return (
    <>
      <DauTrang
        tieuDe={`Xin chào, ${nd.hoSo.hoTen}`}
        moTa="Bảng điều hành Phase 1 chỉ hiện tình trạng hệ thống. Chỉ số kinh doanh (doanh thu, pipeline, công nợ) được dựng ở Phase 7, sau khi CRM, báo giá và đơn hàng có dữ liệu thật."
      />

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
          <>
            <div className="the chi-so">
              <div className="nhan">Lượt đăng nhập hôm nay</div>
              <div className="gia-tri">{dinhDangSo(tq.anNinh.dangNhapHomNay)}</div>
            </div>
            <div className={`the chi-so ${tq.anNinh.thatBaiHomNay >= 5 ? "loi" : ""}`}>
              <div className="nhan">Đăng nhập thất bại hôm nay</div>
              <div className="gia-tri">{dinhDangSo(tq.anNinh.thatBaiHomNay)}</div>
            </div>
            <div className={`the chi-so ${tq.anNinh.tuChoi7Ngay ? "canh-bao" : ""}`}>
              <div className="nhan">Bị từ chối quyền (7 ngày)</div>
              <div className="gia-tri">{dinhDangSo(tq.anNinh.tuChoi7Ngay)}</div>
              <div className="ghi-chu">Nhiều lần liên tiếp có thể là dò quyền</div>
            </div>
          </>
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
