import { dinhDangNgayGio } from "@/lib/dinh-dang";
import { NHAN_TRANG_THAI_KENH_BAI, type TrangThaiKenhBai } from "@/modules/mang-xa-hoi/hang-so";
import type { BaiRa } from "@/modules/mang-xa-hoi/bai";

/** Trạng thái từng kênh của một bài: link CHỈ khi đã xác minh; lỗi kèm hướng dẫn. */
export default function KenhCuaBai({ kenh, gon = false }: { kenh: BaiRa["kenh"]; gon?: boolean }) {
  if (!kenh.length) return <span className="phu nho">Chưa chọn kênh</span>;
  return (
    <div style={{ display: "grid", gap: 4 }}>
      {kenh.map((k) => {
        const nhan = NHAN_TRANG_THAI_KENH_BAI[k.trangThai as TrangThaiKenhBai] ?? { nhan: k.trangThai, lop: "" };
        return (
          <div key={k.id}>
            <strong>{k.tenKenh}</strong> <span className={`huy-hieu ${nhan.lop}`}>{nhan.nhan}</span>
            {k.duongDan && <> · <a href={k.duongDan} target="_blank" rel="noopener noreferrer">Xem bài đã đăng ↗</a></>}
            {k.trangThai === "QUEUED" && k.lanThuToi && <span className="phu nho"> · {k.soLanThu > 0 ? "thử lại" : "đăng"} lúc {dinhDangNgayGio(k.lanThuToi)}</span>}
            {!gon && k.thongBaoLoi && (k.trangThai === "FAILED" || k.trangThai === "VERIFYING" || k.trangThai === "QUEUED") && (
              <div className={`hop-thong-bao ${k.trangThai === "FAILED" ? "loi" : "canh-bao"} nho`} style={{ marginTop: 4 }}>
                {k.thongBaoLoi}{k.huongDan && <div>{k.huongDan}</div>}
                {k.kenhCanNhapLai && <div><a href="/mang-xa-hoi/kenh">→ Nhập lại mật khẩu ứng dụng</a></div>}
              </div>
            )}
            {gon && k.trangThai === "FAILED" && <span className="loi-truong nho"> {k.thongBaoLoi}</span>}
          </div>
        );
      })}
    </div>
  );
}
