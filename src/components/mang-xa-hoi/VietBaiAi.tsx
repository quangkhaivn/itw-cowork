"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useGoiApi } from "@/components/ui/goi-api";

type SanPham = { id: string; ma: string; ten: string; giaBan: number | null; giaGomVat: number | null; tinhTrangHang: string; soLuongConBan?: number };
type Kenh = { id: string; ten: string; tenNenTang: string; trangThai: string };

const NHAN_TON: Record<string, string> = { "con-hang": "Còn hàng", "sap-het": "Sắp hết", "het-hang": "Hết hàng", "khong-theo-doi": "Không theo dõi tồn" };
const tien = (n: number | null) => (n === null ? "Chưa có giá" : `${n.toLocaleString("vi-VN")} đ`);

/**
 * AI viết bài từ sản phẩm: chọn sản phẩm (giá bán + tình trạng tồn — không có giá vốn), chọn kênh, ghi yêu cầu thêm →
 * bài NHÁP do AI tạo (phải duyệt khi Cấu hình bật). Chưa cấu hình AI → nút hiện "chưa cấu hình", không gọi gì.
 */
export default function VietBaiAi({ daCauHinh, lyDo, kenh, chienDich, nganSachHet }: { daCauHinh: boolean; lyDo: string | null; kenh: Kenh[]; chienDich: { id: string; ten: string }[]; nganSachHet: boolean }) {
  const router = useRouter();
  const { goi, dangGui, loi } = useGoiApi();
  const [q, datQ] = useState("");
  const [ketQua, datKetQua] = useState<SanPham[]>([]);
  const [chon, datChon] = useState<SanPham[]>([]);
  const [kenhChon, datKenhChon] = useState<string[]>(kenh.length === 1 ? [kenh[0].id] : []);
  const [yeuCau, datYeuCau] = useState("");
  const [cd, datCd] = useState("");
  const [canhBao, datCanhBao] = useState<string[]>([]);
  const khoa = useRef<string | null>(null);

  useEffect(() => {
    const t = setTimeout(async () => {
      const r = await fetch(`/api/v1/mang-xa-hoi/ai/san-pham?q=${encodeURIComponent(q)}`).then((x) => (x.ok ? x.json() : [])).catch(() => []);
      datKetQua(Array.isArray(r) ? r : []);
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  async function viet() {
    if (!khoa.current) khoa.current = crypto.randomUUID();
    const r = await goi<{ id: string; canhBaoAi?: string[] }>("/api/v1/mang-xa-hoi/ai/viet-bai", "POST", { sanPhamIds: chon.map((s) => s.id), kenhIds: kenhChon, yeuCau: yeuCau || null, chienDichId: cd || null, khoaLapLai: khoa.current });
    if (r) {
      khoa.current = null;
      datCanhBao(r.canhBaoAi ?? []);
      router.push(`/mang-xa-hoi/bai/${r.id}`);
    }
  }

  const tat = !daCauHinh || nganSachHet;
  return (
    <section className="the">
      <div className="than" style={{ padding: 16, display: "grid", gap: 12 }}>
        {!daCauHinh && <div className="hop-thong-bao canh-bao" role="status">{lyDo ?? "AI chưa cấu hình — chưa đặt khóa API trên máy chủ."} Vẫn soạn bài tay bình thường ở “Soạn bài”.</div>}
        {loi && <div className="hop-thong-bao loi" role="alert">{loi.thongBao}</div>}
        {canhBao.map((c) => <div key={c} className="hop-thong-bao canh-bao">{c}</div>)}
        <div className="luoi-form">
          <div className="truong ca-dong">
            <label htmlFor="ai-tim-sp">Sản phẩm (tối đa 10)</label>
            <input id="ai-tim-sp" placeholder="Tìm theo tên hoặc mã…" value={q} onChange={(e) => datQ(e.target.value)} />
            <div style={{ maxHeight: 220, overflowY: "auto", border: "1px solid var(--vien, #ddd)", borderRadius: 6, marginTop: 4 }}>
              {ketQua.length === 0 ? <p className="phu nho" style={{ padding: 8 }}>Không có sản phẩm khớp.</p> : ketQua.map((s) => {
                const da = chon.some((x) => x.id === s.id);
                return (
                  <label key={s.id} style={{ display: "flex", gap: 8, padding: "4px 8px", alignItems: "center" }}>
                    <input type="checkbox" checked={da} disabled={!da && chon.length >= 10} onChange={(e) => datChon(e.target.checked ? [...chon, s] : chon.filter((x) => x.id !== s.id))} />
                    <span><strong>{s.ten}</strong> <span className="phu nho">{s.ma} · {tien(s.giaBan)} · {NHAN_TON[s.tinhTrangHang] ?? s.tinhTrangHang}{s.soLuongConBan !== undefined ? ` (${s.soLuongConBan})` : ""}</span></span>
                  </label>
                );
              })}
            </div>
            {chon.length > 0 && <span className="phu nho">Đã chọn: {chon.map((s) => s.ten).join("; ")}</span>}
            <span className="phu nho">AI chỉ nhận giá bán và tình trạng tồn hiện tại — không bao giờ nhận giá vốn, nhà cung cấp, lợi nhuận.</span>
          </div>
          <fieldset className="truong ca-dong" style={{ border: 0, padding: 0 }}>
            <legend>Kênh (AI viết biến thể theo từng nền tảng)</legend>
            {kenh.length === 0 ? <p className="phu">Chưa có kênh nào đang nối.</p> : kenh.map((k) => (
              <label key={k.id} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input type="checkbox" checked={kenhChon.includes(k.id)} onChange={(e) => datKenhChon(e.target.checked ? [...kenhChon, k.id] : kenhChon.filter((x) => x !== k.id))} />
                {k.ten} <span className="phu nho">({k.tenNenTang})</span>
              </label>
            ))}
          </fieldset>
          {chienDich.length > 0 && (
            <div className="truong"><label htmlFor="ai-cd">Chiến dịch</label>
              <select id="ai-cd" value={cd} onChange={(e) => datCd(e.target.value)}><option value="">— Không —</option>{chienDich.map((c) => <option key={c.id} value={c.id}>{c.ten}</option>)}</select></div>
          )}
          <div className="truong ca-dong">
            <label htmlFor="ai-yeu-cau">Yêu cầu thêm (tùy chọn)</label>
            <textarea id="ai-yeu-cau" rows={3} maxLength={1000} value={yeuCau} onChange={(e) => datYeuCau(e.target.value)} placeholder="Ví dụ: nhấn mạnh pin lâu cho dân văn phòng; dịp khai giảng." />
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button type="button" className="nut chinh" disabled={tat || dangGui || !chon.length || !kenhChon.length} onClick={viet}>
            {!daCauHinh ? "AI chưa cấu hình" : nganSachHet ? "Hết ngân sách AI tháng này" : dangGui ? "AI đang viết… (tới 1 phút)" : "Viết bài bằng AI"}
          </button>
          <span className="phu nho">Kết quả là bài NHÁP gắn nhãn “AI soạn” — đọc lại, sửa, rồi gửi duyệt.</span>
        </div>
      </div>
    </section>
  );
}
