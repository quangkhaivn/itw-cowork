"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useGoiApi } from "@/components/ui/goi-api";
import { COT_NGAN_HANG, NHAN_COT_NGAN_HANG, type CotNganHang } from "@/modules/luong/tinh-toan";

/** Mẫu file chi lương ngân hàng (LU-51): chọn cột + thứ tự, mẫu nội dung chuyển khoản, bỏ dấu. */
export default function FormMauNganHang({ dau }: { dau: { cot: CotNganHang[]; noiDung: string; boDau: boolean } }) {
  const router = useRouter();
  const { goi, dangGui, loi } = useGoiApi();
  const [cot, datCot] = useState<CotNganHang[]>(dau.cot);
  const [noiDung, datNoiDung] = useState(dau.noiDung);
  const [boDau, datBoDau] = useState(dau.boDau);
  const [daLuu, datDaLuu] = useState(false);
  const doi = (c: CotNganHang) => datCot((x) => (x.includes(c) ? x.filter((y) => y !== c) : [...x, c]));
  async function luu() {
    datDaLuu(false);
    if (await goi("/api/v1/luong/mau-ngan-hang", "PUT", { cot, noiDung, boDau })) {
      datDaLuu(true);
      router.refresh();
    }
  }
  return (
    <div className="than" style={{ padding: 16 }}>
      {loi && <div className="hop-thong-bao loi" role="alert">{loi.thongBao}</div>}
      {daLuu && <div className="hop-thong-bao tot" role="status">Đã lưu mẫu.</div>}
      <p className="goi-y">Bấm để thêm / bỏ cột; thứ tự cột trong tệp = thứ tự bấm chọn. Hiện tại: {cot.map((c) => NHAN_COT_NGAN_HANG[c]).join(" → ") || "—"}</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
        {COT_NGAN_HANG.map((c) => (
          <label key={c} style={{ display: "flex", gap: 4 }}><input type="checkbox" checked={cot.includes(c)} onChange={() => doi(c)} /> {NHAN_COT_NGAN_HANG[c]}</label>
        ))}
      </div>
      <div className="truong">
        <label htmlFor="mau-nd">Mẫu nội dung chuyển khoản</label>
        <input id="mau-nd" value={noiDung} onChange={(e) => datNoiDung(e.target.value)} />
        <span className="goi-y">Dùng {"{ho_ten}"}, {"{thang}"}, {"{nam}"}, {"{ma_nv}"}.</span>
      </div>
      <label style={{ display: "flex", gap: 8, margin: "8px 0" }}><input type="checkbox" checked={boDau} onChange={(e) => datBoDau(e.target.checked)} /> Bỏ dấu tiếng Việt (nhiều ngân hàng yêu cầu)</label>
      <button type="button" className="nut chinh" disabled={dangGui} onClick={luu}>{dangGui ? "Đang lưu…" : "Lưu mẫu"}</button>
    </div>
  );
}
