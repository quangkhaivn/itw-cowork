"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useGoiApi } from "@/components/ui/goi-api";
import { dinhDangNgayGio } from "@/lib/dinh-dang";

interface BanGhi {
  ma: string;
  phan: "lam-ngay" | "sau-aws";
  loai: string;
  ten: string;
  giaTri: string;
  moTa: string;
  traDuoc: boolean;
  trangThai?: "dat" | "sai" | "thieu" | "loi" | "chua-khai";
  thayDuoc?: string;
  ghiChu?: string;
}

const NHAN: Record<string, { chu: string; lop: string }> = {
  dat: { chu: "✓ Đúng", lop: "tot" },
  sai: { chu: "✗ Sai giá trị", lop: "loi" },
  thieu: { chu: "✗ Chưa có", lop: "loi" },
  loi: { chu: "? Không tra được", lop: "canh-bao" },
  "chua-khai": { chu: "— Chưa khai", lop: "" },
};

const PHAN: { ma: BanGhi["phan"]; tieuDe: string; moTa: string }[] = [
  {
    ma: "lam-ngay",
    tieuDe: "Làm ngay (không cần AWS)",
    moTa: "Chủ tên miền tự thêm tại nhà đăng ký tên miền / nơi quản lý DNS. DMARC p=none chỉ để quan sát — không làm thư bị chặn.",
  },
  {
    ma: "sau-aws",
    tieuDe: "Sau khi có tài khoản AWS",
    moTa: "Mã DKIM và MAIL FROM lấy từ trang xác minh tên miền trong Amazon SES. Bản ghi chưa đủ dữ liệu hiện \"Chưa khai\".",
  },
];

/** Khu "Tên miền gửi": bản ghi DNS cần có, chia hai phần, nút Kiểm tra (EG-12). */
export default function TenMienGui({
  tenMien,
  duocSua,
}: {
  tenMien: { banGhi: BanGhi[]; daKiem: boolean; kiemLuc: string | null; mailFrom: string } | null;
  duocSua: boolean;
}) {
  const router = useRouter();
  const { goi, dangGui, loi } = useGoiApi();
  const [kq, datKq] = useState<{ banGhi: BanGhi[]; kiemLuc: string } | null>(null);
  if (!tenMien) {
    return (
      <section className="the" style={{ marginTop: 16 }}>
        <div className="dau">
          <h2>Bản ghi DNS của tên miền gửi</h2>
        </div>
        <div className="than">
          <p className="phu">Khai “Tên miền gửi” ở trên (vd tin.itwonline.com) rồi lưu để xem các bản ghi DNS cần thêm.</p>
        </div>
      </section>
    );
  }
  const banGhi = kq?.banGhi ?? tenMien.banGhi;
  const kiemLuc = kq?.kiemLuc ?? tenMien.kiemLuc;
  const coKetQua = Boolean(kq) || tenMien.daKiem;

  async function kiemTra() {
    const r = await goi<{ banGhi: BanGhi[]; kiemLuc: string }>("/api/v1/email/ket-noi/kiem-tra-dns", "POST");
    if (r) {
      datKq(r);
      router.refresh();
    }
  }

  return (
    <section className="the" style={{ marginTop: 16 }}>
      <div className="dau">
        <h2>Bản ghi DNS của tên miền gửi</h2>
        {duocSua && (
          <button type="button" className="nut" onClick={kiemTra} disabled={dangGui}>
            {dangGui ? "Đang tra DNS…" : "Kiểm tra"}
          </button>
        )}
      </div>
      <div className="than">
        {loi && (
          <div className="hop-thong-bao loi" role="alert">
            {loi.thongBao}
          </div>
        )}
        <p className="nho phu">{kiemLuc ? `Kiểm lần gần nhất ${dinhDangNgayGio(kiemLuc)}.` : "Chưa kiểm lần nào."} Bản ghi mới thêm có thể mất từ vài phút tới vài giờ mới tra thấy.</p>
        {PHAN.map((p) => (
          <div key={p.ma} style={{ marginBottom: 16 }}>
            <h3 style={{ margin: "8px 0 4px" }}>{p.tieuDe}</h3>
            <p className="nho phu">{p.moTa}</p>
            <div className="cuon-ngang">
              <table className="bang">
                <thead>
                  <tr>
                    <th>Loại</th>
                    <th>Tên (host)</th>
                    <th>Giá trị cần đặt</th>
                    <th>Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  {banGhi
                    .filter((b) => b.phan === p.ma)
                    .map((b) => {
                      const tt = coKetQua && b.trangThai ? NHAN[b.trangThai] : b.traDuoc ? null : NHAN["chua-khai"];
                      return (
                        <tr key={b.ma}>
                          <td>{b.loai}</td>
                          <td>
                            <code style={{ wordBreak: "break-all" }}>{b.ten}</code>
                          </td>
                          <td>
                            <code style={{ wordBreak: "break-all" }}>{b.giaTri}</code>
                            <div className="dong-phu">{b.moTa}</div>
                          </td>
                          <td>
                            {tt ? <span className={`huy-hieu ${tt.lop}`}>{tt.chu}</span> : <span className="huy-hieu">Chưa kiểm</span>}
                            {coKetQua && b.thayDuoc && <div className="dong-phu">Đang thấy: {b.thayDuoc}</div>}
                            {coKetQua && b.ghiChu && <div className="dong-phu">{b.ghiChu}</div>}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
        ))}
        <p className="nho phu">
          Một số nơi quản lý DNS tự thêm tên miền vào cuối ô “Tên” — khi đó chỉ nhập phần trước tên miền gốc (vd <code>_dmarc.tin</code> thay cho <code>_dmarc.tin.itwonline.com</code>).
        </p>
      </div>
    </section>
  );
}
