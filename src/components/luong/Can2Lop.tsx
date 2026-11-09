import Link from "next/link";
import DauTrang from "@/components/ui/DauTrang";

/**
 * LU-61: người xem / tính lương của người khác bắt buộc đã bật xác thực 2 lớp. Máy chủ trả lỗi `luong-can-2-lop`;
 * trang hiện hướng dẫn bật TỪNG BƯỚC kèm nút đi tới trang bật — không chỉ báo lỗi 403 khô (0.22.0, QĐ-177).
 * Cấu hình `luong.bat_buoc_2_lop` (mặc định 1) do người có quyền sửa Cấu hình đổi; mỗi lần đổi ghi kiểm toán.
 */
export default function Can2Lop({ tieuDe = "Tính lương" }: { tieuDe?: string }) {
  return (
    <>
      <DauTrang tieuDe={tieuDe} />
      <section className="the">
        <div className="than" style={{ padding: 16 }}>
          <div className="hop-thong-bao canh-bao" role="alert">
            Dữ liệu lương là dữ liệu nhạy cảm. Xem hoặc tính lương của người khác <strong>bắt buộc bật xác thực 2 lớp</strong> — mất khoảng 2 phút.
          </div>
          <h2 style={{ fontSize: 16 }}>Bật 2 lớp từng bước</h2>
          <ol>
            <li><strong>Cài ứng dụng xác thực</strong> trên điện thoại: Google Authenticator, Microsoft Authenticator hoặc ứng dụng tương tự (miễn phí).</li>
            <li>Bấm nút <strong>“Đi tới trang bật 2 lớp”</strong> bên dưới (Tài khoản của tôi → Xác thực 2 lớp), bấm <strong>Bật</strong>.</li>
            <li><strong>Nhập lại mật khẩu</strong> hiện tại của bạn (bắt buộc khi bật 2 lớp).</li>
            <li>Mở ứng dụng trên điện thoại → <strong>quét mã QR</strong> hiện trên màn hình (hoặc gõ khóa bí mật).</li>
            <li><strong>Nhập mã 6 số</strong> ứng dụng đang hiện để xác nhận.</li>
            <li><strong>Cất 10 mã khôi phục</strong> ở nơi an toàn (dùng khi mất điện thoại).</li>
            <li><strong>Đăng nhập lại</strong> rồi mở lại trang này.</li>
          </ol>
          <p style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Link className="nut chinh" href="/tai-khoan#xac-thuc-2-lop">Đi tới trang bật 2 lớp</Link>
            <Link className="nut" href="/luong/phieu-cua-toi">Phiếu lương của tôi (không cần 2 lớp)</Link>
          </p>
          <p className="phu nho">Mới triển khai, chưa ai bật được 2 lớp? Người có quyền sửa Cấu hình (Giám đốc / Quản trị) có thể tạm tắt “Bắt buộc xác thực 2 lớp khi xem / tính lương người khác” ở Cấu hình → Tính lương (ghi nhật ký kiểm toán). Khuyến nghị bật lại ngay khi mọi người đã cài xong.</p>
        </div>
      </section>
    </>
  );
}
