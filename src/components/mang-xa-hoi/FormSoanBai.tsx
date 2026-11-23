"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { loiCua, useGoiApi } from "@/components/ui/goi-api";
import { gioVietNamSangIso } from "@/modules/mang-xa-hoi/tinh-toan";

type Kenh = { id: string; ten: string; tenNenTang: string; trangThai: string; nenTang?: string; oauth?: boolean };
type TuyChon = { facebookReels?: boolean; lienKet?: string | null; youtubeRiengTu?: "private" | "unlisted" | "public" };

/**
 * Soạn / sửa bài mạng xã hội. Nội dung là CHỮ THƯỜNG (không nhận HTML) — máy chủ tự dựng HTML an toàn khi đăng.
 * Tạo mới gửi kèm `Idempotency-Key` (một khóa cho mỗi lần mở form): bấm hai lần / mạng chập chờn không tạo hai bài.
 */
/** 0.25.0 (QĐ-233): nội dung riêng của một kênh. */
type BienThe = { kenhId: string; tieuDe: string | null; noiDung: string | null; hashtags: string[]; anhIds: string[] | null };

/** ISO → giá trị ô datetime-local theo giờ Việt Nam. */
const sangOGio = (iso: string | null | undefined) => (iso ? new Date(new Date(iso).getTime() + 7 * 3_600_000).toISOString().slice(0, 16) : "");

export default function FormSoanBai({ kenh, bai, chienDich = [], anh = [] }: {
  kenh: Kenh[];
  bai?: { id: string; tieuDe: string | null; noiDung: string; kenhIds: string[]; tuyChon?: TuyChon; chienDichId?: string | null; henDuKien?: string | null; bienThe?: BienThe[] };
  chienDich?: { id: string; ten: string }[];
  anh?: { id: string; tenTep: string }[];
}) {
  const router = useRouter();
  const { dangGui, loi, datLoi } = useGoiApi();
  const [tieuDe, datTieuDe] = useState(bai?.tieuDe ?? "");
  const [noiDung, datNoiDung] = useState(bai?.noiDung ?? "");
  const [chon, datChon] = useState<string[]>(bai?.kenhIds ?? (kenh.length === 1 ? [kenh[0].id] : []));
  const [dangLuu, datDangLuu] = useState(false);
  const [tuyChon, datTuyChon] = useState<TuyChon>({ facebookReels: false, lienKet: "", youtubeRiengTu: "private", ...(bai?.tuyChon ?? {}) });
  const nenTangChon = new Set(kenh.filter((k) => chon.includes(k.id)).map((k) => k.nenTang));
  const [chienDichId, datChienDichId] = useState(bai?.chienDichId ?? "");
  const [henDuKien, datHenDuKien] = useState(sangOGio(bai?.henDuKien));
  const [bienThe, datBienThe] = useState<BienThe[]>(bai?.bienThe ?? []);
  const [htChu, datHtChu] = useState<Record<string, string>>({});
  const btCua = (kenhId: string): BienThe => bienThe.find((b) => b.kenhId === kenhId) ?? { kenhId, tieuDe: null, noiDung: null, hashtags: [], anhIds: null };
  const suaBt = (kenhId: string, doi: Partial<BienThe>) => datBienThe([...bienThe.filter((b) => b.kenhId !== kenhId), { ...btCua(kenhId), ...doi }]);
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
        body: JSON.stringify({
          tieuDe: tieuDe || null, noiDung, kenhIds: chon, tuyChon: { facebookReels: Boolean(tuyChon.facebookReels), lienKet: tuyChon.lienKet || null, youtubeRiengTu: tuyChon.youtubeRiengTu ?? "private" },
          chienDichId: chienDichId || null, henDuKien: henDuKien ? gioVietNamSangIso(henDuKien) : null,
          bienThe: bienThe.filter((b) => chon.includes(b.kenhId) && (b.tieuDe || b.noiDung || b.hashtags.length || b.anhIds !== null)),
        }),
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
        {chon.length > 0 && (
          <fieldset className="truong ca-dong" style={{ border: 0, padding: 0 }}>
            <legend>Nội dung riêng theo kênh <span className="phu nho">(tùy chọn — bỏ trống = dùng nội dung chung)</span></legend>
            {kenh.filter((k) => chon.includes(k.id)).map((k) => {
              const bt = btCua(k.id);
              const co = Boolean(bt.tieuDe || bt.noiDung || bt.hashtags.length || bt.anhIds !== null);
              return (
                <details key={k.id} open={co} style={{ marginBottom: 6 }}>
                  <summary style={{ cursor: "pointer" }}>{k.ten} <span className="phu nho">({k.tenNenTang}){co ? " — có nội dung riêng" : ""}</span></summary>
                  <div className="luoi-form" style={{ marginTop: 6 }}>
                    <div className="truong ca-dong"><label htmlFor={`bt-td-${k.id}`}>Tiêu đề riêng</label><input id={`bt-td-${k.id}`} maxLength={300} value={bt.tieuDe ?? ""} onChange={(e) => suaBt(k.id, { tieuDe: e.target.value || null })} /></div>
                    <div className="truong ca-dong"><label htmlFor={`bt-nd-${k.id}`}>Nội dung riêng</label><textarea id={`bt-nd-${k.id}`} rows={5} value={bt.noiDung ?? ""} onChange={(e) => suaBt(k.id, { noiDung: e.target.value || null })} /></div>
                    <div className="truong ca-dong"><label htmlFor={`bt-ht-${k.id}`}>Hashtag riêng (cách nhau bằng dấu cách, thêm cuối bài khi đăng)</label>
                      <input id={`bt-ht-${k.id}`} value={htChu[k.id] ?? bt.hashtags.join(" ")} placeholder="#ITW #khuyenmai" onChange={(e) => { datHtChu({ ...htChu, [k.id]: e.target.value }); suaBt(k.id, { hashtags: e.target.value.split(/[\s,]+/).filter(Boolean) }); }} /></div>
                    {anh.length > 0 && (
                      <div className="truong ca-dong">
                        <label style={{ display: "flex", gap: 8 }}><input type="checkbox" checked={bt.anhIds === null} onChange={(e) => suaBt(k.id, { anhIds: e.target.checked ? null : anh.map((a) => a.id) })} /> Dùng mọi ảnh / video của bài</label>
                        {bt.anhIds !== null && anh.map((a) => (
                          <label key={a.id} style={{ display: "flex", gap: 8 }}><input type="checkbox" checked={bt.anhIds!.includes(a.id)} onChange={(e) => suaBt(k.id, { anhIds: e.target.checked ? [...bt.anhIds!, a.id] : bt.anhIds!.filter((x) => x !== a.id) })} /> {a.tenTep}</label>
                        ))}
                      </div>
                    )}
                  </div>
                </details>
              );
            })}
            <span className="phu nho">Cowork kiểm nội dung riêng theo giới hạn của từng nền tảng khi gửi duyệt / đăng.</span>
          </fieldset>
        )}
        {chienDich.length > 0 && (
          <div className="truong">
            <label htmlFor="mxh-chien-dich">Chiến dịch</label>
            <select id="mxh-chien-dich" value={chienDichId} onChange={(e) => datChienDichId(e.target.value)}>
              <option value="">— Không —</option>
              {chienDich.map((c) => <option key={c.id} value={c.id}>{c.ten}</option>)}
            </select>
          </div>
        )}
        <div className="truong">
          <label htmlFor="mxh-du-kien">Ngày dự kiến trên lịch (giờ Việt Nam)</label>
          <input id="mxh-du-kien" type="datetime-local" value={henDuKien} onChange={(e) => datHenDuKien(e.target.value)} />
          <span className="phu nho">Chỉ để lên kế hoạch — muốn đăng đúng giờ thì dùng Hẹn giờ.</span>
        </div>
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
