"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { loiCua, useGoiApi } from "@/components/ui/goi-api";

type Kenh = { id: string; ten: string; tenNenTang: string; trangThai: string; nenTang?: string; oauth?: boolean };
type TuyChon = { facebookReels?: boolean; lienKet?: string | null; youtubeRiengTu?: "private" | "unlisted" | "public" };

/**
 * Soạn / sửa bài mạng xã hội. Nội dung là CHỮ THƯỜNG (không nhận HTML) — máy chủ tự dựng HTML an toàn khi đăng.
 * Tạo mới gửi kèm `Idempotency-Key` (một khóa cho mỗi lần mở form): bấm hai lần / mạng chập chờn không tạo hai bài.
 */
export default function FormSoanBai({ kenh, bai }: { kenh: Kenh[]; bai?: { id: string; tieuDe: string | null; noiDung: string; kenhIds: string[]; tuyChon?: TuyChon } }) {
  const router = useRouter();
  const { dangGui, loi, datLoi } = useGoiApi();
  const [tieuDe, datTieuDe] = useState(bai?.tieuDe ?? "");
  const [noiDung, datNoiDung] = useState(bai?.noiDung ?? "");
  const [chon, datChon] = useState<string[]>(bai?.kenhIds ?? (kenh.length === 1 ? [kenh[0].id] : []));
  const [dangLuu, datDangLuu] = useState(false);
  const [tuyChon, datTuyChon] = useState<TuyChon>({ facebookReels: false, lienKet: "", youtubeRiengTu: "private", ...(bai?.tuyChon ?? {}) });
  const nenTangChon = new Set(kenh.filter((k) => chon.includes(k.id)).map((k) => k.nenTang));
  // Khóa lặp lại sinh ở lần bấm Lưu đầu tiên và giữ cho các lần bấm sau của cùng form.
  const khoa = useRef<string | null>(null);

  async function luu(e: React.FormEvent) {
    e.preventDefault();
    datDangLuu(true);
    datLoi(null);
    if (!khoa.current) khoa.current = crypto.randomUUID();
    try {
      const ph = await fetch(bai ? `/api/v1/mang-xa-hoi/bai/${bai.id}` : "/api/v1/mang-xa-hoi/bai", {
        method: bai ? "PUT" : "POST",
        headers: { "Content-Type": "application/json", ...(bai ? {} : { "Idempotency-Key": khoa.current }) },
        body: JSON.stringify({ tieuDe: tieuDe || null, noiDung, kenhIds: chon, tuyChon: { facebookReels: Boolean(tuyChon.facebookReels), lienKet: tuyChon.lienKet || null, youtubeRiengTu: tuyChon.youtubeRiengTu ?? "private" } }),
      });
      const d = await ph.json().catch(() => ({}));
      if (!ph.ok) {
        datLoi({ thongBao: d.thongBao ?? `Lỗi ${ph.status}.`, loiTruong: d.loiTruong ?? {}, status: ph.status, ma: d.ma });
        return;
      }
      if (bai) router.refresh();
      else router.push(`/mang-xa-hoi/bai/${d.id}`);
    } catch {
      datLoi({ thongBao: "Không kết nối được máy chủ.", loiTruong: {}, status: 0 });
    } finally {
      datDangLuu(false);
    }
  }

  return (
    <form onSubmit={luu} className="the" style={{ padding: 16 }}>
      {loi && <div className="hop-thong-bao loi" role="alert">{loi.thongBao}</div>}
      <div className="luoi-form">
        <div className="truong ca-dong">
          <label htmlFor="mxh-tieu-de">Tiêu đề <span className="phu nho">(bắt buộc với WordPress và YouTube)</span></label>
          <input id="mxh-tieu-de" value={tieuDe} maxLength={300} onChange={(e) => datTieuDe(e.target.value)} />
          {loiCua(loi, "tieuDe") && <span className="loi-truong">{loiCua(loi, "tieuDe")}</span>}
        </div>
        <div className="truong ca-dong">
          <label htmlFor="mxh-noi-dung">Nội dung <span className="bat-buoc">*</span></label>
          <textarea id="mxh-noi-dung" rows={10} value={noiDung} onChange={(e) => datNoiDung(e.target.value)} />
          <span className="phu nho">Viết chữ thường. Dòng trống tách đoạn; liên kết http(s) tự thành link. Không dán HTML. {noiDung.length.toLocaleString("vi-VN")} ký tự.</span>
          {loiCua(loi, "noiDung") && <span className="loi-truong">{loiCua(loi, "noiDung")}</span>}
        </div>
        <fieldset className="truong ca-dong" style={{ border: 0, padding: 0 }}>
          <legend>Đăng lên kênh</legend>
          {kenh.length === 0 ? (
            <p className="phu">Chưa có kênh nào đang nối. Vào <a href="/mang-xa-hoi/kenh">Mạng xã hội → Kênh</a> để nối WordPress, Facebook, Instagram, YouTube.</p>
          ) : kenh.map((k) => (
            <label key={k.id} style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="checkbox" checked={chon.includes(k.id)} disabled={k.trangThai !== "ACTIVE" && !chon.includes(k.id)}
                onChange={(e) => datChon(e.target.checked ? [...chon, k.id] : chon.filter((x) => x !== k.id))} />
              {k.ten} <span className="phu nho">({k.tenNenTang}{k.trangThai !== "ACTIVE" ? (k.oauth ? " — cần kết nối lại" : " — cần nhập lại mật khẩu ứng dụng") : ""})</span>
            </label>
          ))}
        </fieldset>
        {nenTangChon.has("FACEBOOK_PAGE") && (
          <fieldset className="truong ca-dong" style={{ border: 0, padding: 0 }}>
            <legend>Facebook</legend>
            <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="checkbox" checked={Boolean(tuyChon.facebookReels)} onChange={(e) => datTuyChon({ ...tuyChon, facebookReels: e.target.checked })} />
              Bài có một video dọc 3–90 giây: đăng thành <strong>Reels</strong> (tối đa 30 Reels / 24 giờ mỗi Page)
            </label>
            <label htmlFor="mxh-lien-ket">Liên kết đính kèm (bài chữ — Facebook dựng khung xem trước)</label>
            <input id="mxh-lien-ket" value={tuyChon.lienKet ?? ""} placeholder="https://…" onChange={(e) => datTuyChon({ ...tuyChon, lienKet: e.target.value })} />
            {loiCua(loi, "tuyChon.lienKet") && <span className="loi-truong">{loiCua(loi, "tuyChon.lienKet")}</span>}
          </fieldset>
        )}
        {nenTangChon.has("YOUTUBE") && (
          <div className="truong">
            <label htmlFor="mxh-yt-rieng-tu">Quyền riêng tư video YouTube</label>
            <select id="mxh-yt-rieng-tu" value={tuyChon.youtubeRiengTu ?? "private"} onChange={(e) => datTuyChon({ ...tuyChon, youtubeRiengTu: e.target.value as TuyChon["youtubeRiengTu"] })}>
              <option value="private">Riêng tư (chỉ chủ kênh xem)</option>
              <option value="unlisted">Không công khai (ai có link mới xem)</option>
              <option value="public">Công khai</option>
            </select>
            <span className="phu nho">Video dọc ≤ 3 phút sẽ được YouTube xếp vào Shorts.</span>
          </div>
        )}
      </div>
      <div className="chan-form" style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <button type="submit" className="nut chinh" disabled={dangLuu || dangGui}>{dangLuu ? "Đang lưu…" : bai ? "Lưu thay đổi" : "Lưu nháp"}</button>
        {!bai && <span className="phu nho" style={{ alignSelf: "center" }}>Lưu nháp xong: thêm ảnh / video (tải lên hoặc chọn từ Google Drive), rồi Đăng ngay / Hẹn giờ / Gửi duyệt.</span>}
      </div>
    </form>
  );
}
