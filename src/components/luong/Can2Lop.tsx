import Link from "next/link";
import DauTrang from "@/components/ui/DauTrang";

/**
 * LU-61: người xem / tính lương của người khác bắt buộc đã bật xác thực 2 lớp. Máy chủ trả lỗi `luong-can-2-lop`;
 * trang hiện hướng dẫn bật thay vì báo lỗi chung.
 */
export default function Can2Lop({ tieuDe = "Tính lương" }: { tieuDe?: string }) {
  return (
    <>
      <DauTrang tieuDe={tieuDe} />
      <section className="the">
        <div className="than" style={{ padding: 16 }}>
          <div className="hop-thong-bao canh-bao" role="alert">
            Dữ liệu lương là dữ liệu nhạy cảm. Xem hoặc tính lương của người khác <strong>bắt buộc bật xác thực 2 lớp</strong>.
          </div>
          <ol>
            <li>Cài ứng dụng xác thực trên điện thoại (Google Authenticator, Microsoft Authenticator…).</li>
            <li>Vào <Link href="/tai-khoan">Tài khoản của tôi</Link> → <strong>Xác thực 2 lớp</strong> → Bật, quét mã QR, nhập mã 6 số đang hiện.</li>
            <li>Cất 10 mã khôi phục ở nơi an toàn, đăng nhập lại rồi mở lại trang này.</li>
          </ol>
          <p>Phiếu lương của chính bạn vẫn xem được ở <Link href="/luong/phieu-cua-toi">Phiếu lương của tôi</Link> mà không cần 2 lớp.</p>
        </div>
      </section>
    </>
  );
}
