"use client";

import { useState } from "react";
import { KHOA_UTM, TEN_O_BAY, TRUONG_FORM } from "@/modules/marketing/hang-so";
import type { TruongFormCauHinh } from "@/modules/marketing/tinh-toan";

export interface FormCongKhaiProps {
  maDoanhNghiep: string;
  slug: string;
  tieuDe?: string | null;
  gioiThieu?: string | null;
  truong: TruongFormCauHinh[];
  nutGui: string;
  cauDongY: string | null;
  /** Gửi từ landing page: gắn lượt gửi vào trang và biến thể A/B. */
  landingId?: string | null;
  bienThe?: "A" | "B" | null;
}

/**
 * Form đăng ký công khai — dùng chung cho trang /f và khối Form của landing page (MK-11).
 * UTM đọc từ chính địa chỉ trang lúc gửi; ô bẫy chống bot ẩn với người thật.
 * Ô đồng ý nhận tin KHÔNG tích sẵn (MK-13).
 */
export default function FormDangKyCongKhai(p: FormCongKhaiProps) {
  const [gt, datGt] = useState<Record<string, string>>({});
  const [dongY, datDongY] = useState(false);
  const [bay, datBay] = useState("");
  const [dangGui, datDangGui] = useState(false);
  const [loi, datLoi] = useState<{ thongBao: string; truong: Record<string, string> } | null>(null);
  const [xong, datXong] = useState<string | null>(null);

  async function gui(e: React.FormEvent) {
    e.preventDefault();
    datDangGui(true);
    datLoi(null);
    const ts = new URLSearchParams(window.location.search);
    const utm = Object.fromEntries(KHOA_UTM.map((k) => [k, ts.get(k) ?? ""]));
    try {
      const r = await fetch(`/api/cong-khai/form/${encodeURIComponent(p.maDoanhNghiep)}/${encodeURIComponent(p.slug)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...gt,
          ...utm,
          [TEN_O_BAY]: bay,
          dongYNhanTin: p.cauDongY ? dongY : undefined,
          landingId: p.landingId ?? undefined,
          bienThe: p.bienThe ?? undefined,
          trang: window.location.href.slice(0, 300),
        }),
      });
      const kq = await r.json().catch(() => ({}));
      if (!r.ok) {
        const truong: Record<string, string> = {};
        const lt = (kq.chiTiet?.loiTruong ?? kq.loiTruong ?? {}) as Record<string, string | string[]>;
        for (const [k, v] of Object.entries(lt)) truong[k] = Array.isArray(v) ? v[0] : v;
        datLoi({ thongBao: kq.thongBao ?? "Gửi không thành công. Vui lòng thử lại.", truong });
        return;
      }
      datXong(kq.thongBao ?? "Cảm ơn bạn!");
    } catch {
      datLoi({ thongBao: "Không kết nối được máy chủ. Vui lòng thử lại.", truong: {} });
    } finally {
      datDangGui(false);
    }
  }

  if (xong) {
    return (
      <div className="hop-thong-bao tot" role="status" style={{ fontSize: 15 }}>
        {xong}
      </div>
    );
  }

  return (
    <form onSubmit={gui} noValidate className="form-cong-khai">
      {p.tieuDe && <h2 className="lp-tieu-de-form">{p.tieuDe}</h2>}
      {p.gioiThieu && <p className="phu">{p.gioiThieu}</p>}
      {loi && (
        <div className="hop-thong-bao loi" role="alert">
          {loi.thongBao}
        </div>
      )}
      {p.truong.map((t) => {
        const dn = TRUONG_FORM[t.khoa];
        const id = `f-${t.khoa}`;
        const thuocTinh = {
          id,
          name: t.khoa,
          value: gt[t.khoa] ?? "",
          maxLength: dn.toiDa,
          required: t.batBuoc,
          "aria-invalid": loi?.truong[t.khoa] ? (true as const) : undefined,
          onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => datGt((c) => ({ ...c, [t.khoa]: e.target.value })),
        };
        return (
          <div className="truong" key={t.khoa}>
            <label htmlFor={id}>
              {t.nhan} {t.batBuoc && <span className="bat-buoc">*</span>}
            </label>
            {dn.kieu === "textarea" ? <textarea rows={3} {...thuocTinh} /> : <input type={dn.kieu} autoComplete={t.khoa === "email" ? "email" : t.khoa === "dienThoai" ? "tel" : t.khoa === "hoTen" ? "name" : "on"} {...thuocTinh} />}
            {loi?.truong[t.khoa] && <span className="loi-truong">{loi.truong[t.khoa]}</span>}
          </div>
        );
      })}
      {/* Ô bẫy: người thật không thấy, không tab tới; bot điền vào thì bị loại. */}
      <div aria-hidden="true" style={{ position: "absolute", left: "-10000px", width: 1, height: 1, overflow: "hidden" }}>
        <label htmlFor={`f-${TEN_O_BAY}`}>Bỏ trống ô này</label>
        <input id={`f-${TEN_O_BAY}`} name={TEN_O_BAY} type="text" tabIndex={-1} autoComplete="off" value={bay} onChange={(e) => datBay(e.target.value)} />
      </div>
      {p.cauDongY && (
        <label className="o-chon" style={{ marginBottom: 14 }}>
          <input type="checkbox" checked={dongY} onChange={(e) => datDongY(e.target.checked)} />
          <span>{p.cauDongY}</span>
        </label>
      )}
      <button type="submit" className="nut chinh" disabled={dangGui} style={{ width: "100%", minHeight: 42, fontSize: 15 }}>
        {dangGui ? "Đang gửi…" : p.nutGui}
      </button>
    </form>
  );
}
