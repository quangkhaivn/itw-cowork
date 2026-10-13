import type { Metadata } from "next";
import { thongTinHuyNhanTin } from "@/modules/email/cong-khai";
import NutHuy from "./NutHuy";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Huỷ nhận tin", robots: { index: false, follow: false } };

/**
 * Trang huỷ nhận tin công khai (EM-10). Mở trang **không** huỷ gì — trình quét liên kết của hộp
 * thư công ty hay mở sẵn mọi liên kết; huỷ chỉ xảy ra khi người nhận bấm nút (một chạm).
 * Chỉ hiện tên công ty gửi và email đã che.
 */
export default async function TrangHuyNhanTin({ params }: { params: Promise<{ ma: string }> }) {
  const { ma } = await params;
  const tt = await thongTinHuyNhanTin(ma).catch(() => null);
  return (
    <main className="giua">
      <div className="the the-don trang-cong-khai">
        <h1>Huỷ nhận tin</h1>
        {!tt ? (
          <p>Liên kết không hợp lệ hoặc đã hết hiệu lực. Nếu vẫn nhận thư không mong muốn, hãy trả lời thư đó và đề nghị ngừng gửi.</p>
        ) : tt.daHuy ? (
          <p>
            Địa chỉ <strong>{tt.emailChe}</strong> đã ngừng nhận thư giới thiệu từ <strong>{tt.tenCongTy}</strong>. Bạn không cần làm gì thêm.
          </p>
        ) : (
          <>
            <p>
              Ngừng nhận thư giới thiệu sản phẩm, khuyến mãi từ <strong>{tt.tenCongTy}</strong> gửi tới <strong>{tt.emailChe}</strong>?
            </p>
            <p className="phu nho">Thư giao dịch (báo giá, hoá đơn bạn yêu cầu) không bị ảnh hưởng.</p>
            <NutHuy ma={ma} />
          </>
        )}
      </div>
    </main>
  );
}
