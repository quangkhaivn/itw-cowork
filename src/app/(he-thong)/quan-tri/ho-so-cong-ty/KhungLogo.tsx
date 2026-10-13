"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useGoiApi } from "@/components/ui/goi-api";

/** Logo in trên đầu báo giá. Ảnh gửi lên dạng base64; máy chủ kiểm byte đầu, không tin đuôi tên. */
export default function KhungLogo({ logo, duocSua }: { logo: { mime: string; duLieu: string; kichThuoc: number } | null; duocSua: boolean }) {
  const router = useRouter();
  const { goi, dangGui, loi, datLoi } = useGoiApi();
  const [daLuu, datDaLuu] = useState(false);

  async function chon(e: React.ChangeEvent<HTMLInputElement>) {
    const tep = e.target.files?.[0];
    e.target.value = "";
    if (!tep) return;
    datLoi(null);
    datDaLuu(false);
    const b = new Uint8Array(await tep.arrayBuffer());
    let nhiPhan = "";
    for (let i = 0; i < b.length; i += 0x8000) nhiPhan += String.fromCharCode(...b.subarray(i, i + 0x8000));
    if (await goi("/api/v1/ho-so-cong-ty/logo", "PUT", { tenTep: tep.name, duLieuBase64: btoa(nhiPhan) })) {
      datDaLuu(true);
      router.refresh();
    }
  }

  async function xoa() {
    if (await goi("/api/v1/ho-so-cong-ty/logo", "DELETE")) router.refresh();
  }

  return (
    <section className="the" style={{ marginBottom: 16 }}>
      <div className="dau">
        <h2>Logo công ty</h2>
      </div>
      <div className="than">
        {loi && (
          <div className="hop-thong-bao loi" role="alert">
            {loi.thongBao}
          </div>
        )}
        {daLuu && (
          <div className="hop-thong-bao tot" role="status">
            Đã lưu logo.
          </div>
        )}
        <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element -- ảnh nhúng data: URI, không qua bộ tối ưu ảnh
            <img src={`data:${logo.mime};base64,${logo.duLieu}`} alt="Logo công ty" className="logo-ho-so" />
          ) : (
            <span className="phu">Chưa có logo — bản in báo giá chỉ có tên công ty.</span>
          )}
          {duocSua && (
            <>
              <label className="nut">
                {dangGui ? "Đang tải lên…" : logo ? "Đổi logo" : "Chọn ảnh logo"}
                <input type="file" accept="image/png,image/jpeg,image/webp" onChange={chon} disabled={dangGui} hidden />
              </label>
              {logo && (
                <button type="button" className="nut trong" onClick={xoa} disabled={dangGui}>
                  Gỡ logo
                </button>
              )}
            </>
          )}
        </div>
        <p className="goi-y" style={{ marginTop: 8 }}>
          PNG, JPEG hoặc WebP, tối đa 512 KB. Nên dùng ảnh nền trong suốt, rộng khoảng 400 điểm ảnh.
        </p>
      </div>
    </section>
  );
}
