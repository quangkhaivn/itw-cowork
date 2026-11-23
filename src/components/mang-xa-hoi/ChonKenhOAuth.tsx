"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useGoiApi } from "@/components/ui/goi-api";

type UngVien = { id: string; nenTang: string; tenNenTang: string; ten: string; ma: string; daNoi: boolean; ghiChu: string | null; chonSan: boolean };
type TrangThai = { trangThai: string; loi: string | null; taiKhoan: string | null; quyenThieu: string[]; ten: string; ungVien: UngVien[] };

/** Hỏi trạng thái mỗi 2 giây tới khi máy nền đổi mã xong; rồi cho chọn kênh. */
export default function ChonKenhOAuth({ id }: { id: string }) {
  const router = useRouter();
  const { goi, dangGui, loi } = useGoiApi();
  const [tt, datTt] = useState<TrangThai | null>(null);
  const [chon, datChon] = useState<string[]>([]);

  useEffect(() => {
    let dung = false;
    let hen: ReturnType<typeof setTimeout> | null = null;
    const hoi = async () => {
      const ph = await fetch(`/api/v1/mang-xa-hoi/oauth/yeu-cau/${id}`);
      const d = (await ph.json().catch(() => null)) as (TrangThai & { thongBao?: string }) | null;
      if (dung) return;
      if (!ph.ok || !d) {
        datTt({ trangThai: "LOI", loi: d?.thongBao ?? `Lỗi ${ph.status}.`, taiKhoan: null, quyenThieu: [], ten: "", ungVien: [] });
        return;
      }
      datTt(d);
      if (d.trangThai === "DA_SAN_SANG") datChon(d.ungVien.filter((u) => u.chonSan).map((u) => u.id));
      if (d.trangThai === "CHO_DOI_MA" || d.trangThai === "CHO_DONG_Y") hen = setTimeout(hoi, 2000);
    };
    void hoi();
    return () => {
      dung = true;
      if (hen) clearTimeout(hen);
    };
  }, [id]);

  async function luu() {
    const r = await goi<{ kenh: unknown[] }>(`/api/v1/mang-xa-hoi/oauth/yeu-cau/${id}/chon`, "POST", { ungVienIds: chon });
    if (r) router.push("/mang-xa-hoi/kenh");
  }

  if (!tt || tt.trangThai === "CHO_DOI_MA" || tt.trangThai === "CHO_DONG_Y") return <div className="hop-thong-bao thong-tin" role="status">Đang nhận quyền từ nền tảng và lấy danh sách kênh (thường dưới 15 giây)…</div>;
  if (tt.trangThai !== "DA_SAN_SANG") {
    return (
      <div className={`hop-thong-bao ${tt.trangThai === "HOAN_TAT" ? "tot" : "loi"}`} role="alert">
        {tt.trangThai === "HOAN_TAT" ? "Lần kết nối này đã lưu xong." : tt.trangThai === "HET_HAN" ? "Lần kết nối đã hết hạn." : `Chưa kết nối được: ${tt.loi ?? ""}`} <a href="/mang-xa-hoi/kenh">← Về màn hình Kênh</a>
      </div>
    );
  }
  return (
    <section className="the">
      <div className="dau"><h2>{tt.ten}{tt.taiKhoan ? ` — tài khoản ${tt.taiKhoan}` : ""}</h2></div>
      <div className="than" style={{ padding: 16, display: "grid", gap: 8 }}>
        {tt.quyenThieu.length > 0 && <div className="hop-thong-bao canh-bao">Bạn chưa cấp đủ quyền: {tt.quyenThieu.join(", ")}. Kênh vẫn nối được nhưng có thể không đăng được — kết nối lại và tích đủ quyền.</div>}
        {loi && <div className="hop-thong-bao loi" role="alert">{loi.thongBao}</div>}
        {tt.ungVien.map((u) => (
          <label key={u.id} style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input type="checkbox" checked={chon.includes(u.id)} onChange={(e) => datChon(e.target.checked ? [...chon, u.id] : chon.filter((x) => x !== u.id))} />
            <span><strong>{u.ten}</strong> <span className="phu nho">{u.tenNenTang} · mã {u.ma}{u.daNoi ? " · đã nối — chọn để cập nhật quyền" : ""}</span>{u.ghiChu && <span className="loi-truong nho"> {u.ghiChu}</span>}</span>
          </label>
        ))}
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" className="nut chinh" disabled={dangGui || chon.length === 0} onClick={luu}>{dangGui ? "Đang lưu…" : `Lưu ${chon.length} kênh đã chọn`}</button>
          <a className="nut" href="/mang-xa-hoi/kenh">Hủy</a>
        </div>
      </div>
    </section>
  );
}
