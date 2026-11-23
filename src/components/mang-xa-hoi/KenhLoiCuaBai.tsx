"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useGoiApi } from "@/components/ui/goi-api";

export interface KenhRieng {
  id: string;
  tenKenh: string;
  tenNenTang: string;
  trangThai: string;
  tieuDeRieng: string | null;
  noiDungRieng: string | null;
  hashtags: string[];
  anhIds: string[] | null;
  coNoiDungRieng: boolean;
  choDangLai: boolean;
}
export interface QuyenKenh { suaKenhLoi: boolean; lyDoKhongSua: string | null; dangLaiKenh: boolean }

/**
 * Bài lỗi một phần (QĐ-234): sửa nội dung riêng + đăng lại TỪNG kênh lỗi; kênh đã đăng không bị đụng. Bài phải duyệt →
 * sửa xong bài chờ duyệt lại (riêng kênh lỗi). Máy chủ kiểm mọi điều (an toàn đối soát, quyền, luật nền tảng).
 */
export default function KenhLoiCuaBai({ baiId, kenh, quyenKenh, anh, guiDuyetKenhLoi, noiDungChung }: {
  baiId: string; kenh: KenhRieng[]; quyenKenh: Record<string, QuyenKenh>; anh: { id: string; tenTep: string }[]; guiDuyetKenhLoi: boolean; noiDungChung: { tieuDe: string | null; noiDung: string };
}) {
  const router = useRouter();
  const { goi, dangGui, loi } = useGoiApi();
  const [mo, datMo] = useState<string | null>(null);
  const [tieuDe, datTieuDe] = useState("");
  const [noiDung, datNoiDung] = useState("");
  const [hashtag, datHashtag] = useState("");
  const [anhChon, datAnhChon] = useState<string[] | null>(null);
  const loiKenh = kenh.filter((k) => k.trangThai === "FAILED");
  const rieng = kenh.filter((k) => k.coNoiDungRieng && k.trangThai !== "FAILED");
  if (!loiKenh.length && !rieng.length) return null;

  function moSua(k: KenhRieng) {
    datMo(k.id);
    datTieuDe(k.tieuDeRieng ?? noiDungChung.tieuDe ?? "");
    datNoiDung(k.noiDungRieng ?? noiDungChung.noiDung);
    datHashtag(k.hashtags.join(" "));
    datAnhChon(k.anhIds);
  }
  async function luu(k: KenhRieng) {
    const than = {
      tieuDe: tieuDe && tieuDe !== noiDungChung.tieuDe ? tieuDe : null,
      noiDung: noiDung && noiDung !== noiDungChung.noiDung ? noiDung : null,
      hashtags: hashtag.split(/[\s,]+/).filter(Boolean),
      anhIds: anhChon,
    };
    if (await goi(`/api/v1/mang-xa-hoi/bai/${baiId}/kenh/${k.id}`, "PUT", than)) { datMo(null); router.refresh(); }
  }
  async function lam(url: string, xacNhan: string) {
    if (!window.confirm(xacNhan)) return;
    if (await goi(url, "POST", {})) router.refresh();
  }

  return (
    <section className="the">
      <div className="dau"><h2>{loiKenh.length ? "Kênh lỗi — sửa / đăng lại riêng" : "Nội dung riêng theo kênh"}</h2></div>
      <div className="than" style={{ padding: 16, display: "grid", gap: 12 }}>
        {loi && <div className="hop-thong-bao loi" role="alert">{loi.thongBao}</div>}
        {loiKenh.length > 0 && <p className="phu nho">Kênh đã đăng giữ nguyên. Đăng lại một kênh: hệ thống ĐỐI SOÁT trước khi gửi (không đăng trùng nếu lượt trước thật ra đã lên).</p>}
        {guiDuyetKenhLoi && (
          <div className="hop-thong-bao canh-bao">Kênh lỗi đã sửa nội dung — phải được duyệt lại trước khi đăng.{" "}
            <button type="button" className="nut nho chinh" disabled={dangGui} onClick={() => lam(`/api/v1/mang-xa-hoi/bai/${baiId}/gui-duyet-kenh-loi`, "Gửi duyệt lại các kênh lỗi đã sửa?")}>Gửi duyệt lại kênh lỗi</button>
          </div>
        )}
        {[...loiKenh, ...rieng].map((k) => {
          const q = quyenKenh[k.id] ?? { suaKenhLoi: false, lyDoKhongSua: null, dangLaiKenh: false };
          return (
            <div key={k.id} style={{ borderTop: "1px solid var(--vien, #eee)", paddingTop: 8 }}>
              <strong>{k.tenKenh}</strong> <span className="phu nho">({k.tenNenTang})</span>
              {k.trangThai === "FAILED" && <span className="huy-hieu loi"> Lỗi</span>}
              {k.choDangLai && <span className="huy-hieu canh-bao"> Đã sửa — chờ đăng lại</span>}
              {k.coNoiDungRieng && mo !== k.id && (
                <div className="phu nho" style={{ whiteSpace: "pre-wrap", marginTop: 4 }}>
                  {k.tieuDeRieng && <div>Tiêu đề riêng: {k.tieuDeRieng}</div>}
                  {k.noiDungRieng && <div>Nội dung riêng: {k.noiDungRieng.slice(0, 400)}{k.noiDungRieng.length > 400 ? "…" : ""}</div>}
                  {k.hashtags.length > 0 && <div>Hashtag: {k.hashtags.join(" ")}</div>}
                  {k.anhIds && <div>Ảnh / video riêng: {k.anhIds.length ? anh.filter((a) => k.anhIds!.includes(a.id)).map((a) => a.tenTep).join(", ") : "không kèm ảnh / video"}</div>}
                </div>
              )}
              {q.lyDoKhongSua && <div className="hop-thong-bao thong-tin nho" style={{ marginTop: 4 }}>{q.lyDoKhongSua}</div>}
              <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
                {q.suaKenhLoi && mo !== k.id && <button type="button" className="nut nho" onClick={() => moSua(k)}>Sửa nội dung kênh này</button>}
                {q.dangLaiKenh && <button type="button" className="nut nho chinh" disabled={dangGui} onClick={() => lam(`/api/v1/mang-xa-hoi/bai/${baiId}/kenh/${k.id}/dang-lai`, `Đăng lại riêng kênh “${k.tenKenh}”?`)}>Đăng lại kênh này</button>}
              </div>
              {mo === k.id && (
                <div className="luoi-form" style={{ marginTop: 8 }}>
                  <div className="truong ca-dong"><label htmlFor={`kl-td-${k.id}`}>Tiêu đề cho kênh này</label><input id={`kl-td-${k.id}`} value={tieuDe} maxLength={300} onChange={(e) => datTieuDe(e.target.value)} /></div>
                  <div className="truong ca-dong"><label htmlFor={`kl-nd-${k.id}`}>Nội dung cho kênh này</label><textarea id={`kl-nd-${k.id}`} rows={8} value={noiDung} onChange={(e) => datNoiDung(e.target.value)} /></div>
                  <div className="truong ca-dong"><label htmlFor={`kl-ht-${k.id}`}>Hashtag riêng (cách nhau bằng dấu cách)</label><input id={`kl-ht-${k.id}`} value={hashtag} onChange={(e) => datHashtag(e.target.value)} placeholder="#ITW #laptop" /></div>
                  {anh.length > 0 && (
                    <fieldset className="truong ca-dong" style={{ border: 0, padding: 0 }}>
                      <legend>Ảnh / video cho kênh này</legend>
                      <label style={{ display: "flex", gap: 8 }}><input type="checkbox" checked={anhChon === null} onChange={(e) => datAnhChon(e.target.checked ? null : anh.map((a) => a.id))} /> Dùng mọi ảnh / video của bài</label>
                      {anhChon !== null && anh.map((a) => (
                        <label key={a.id} style={{ display: "flex", gap: 8 }}><input type="checkbox" checked={anhChon.includes(a.id)} onChange={(e) => datAnhChon(e.target.checked ? [...anhChon, a.id] : anhChon.filter((x) => x !== a.id))} /> {a.tenTep}</label>
                      ))}
                    </fieldset>
                  )}
                  <div style={{ display: "flex", gap: 8 }}>
                    <button type="button" className="nut chinh nho" disabled={dangGui} onClick={() => luu(k)}>Lưu nội dung kênh</button>
                    <button type="button" className="nut nho" onClick={() => datMo(null)}>Hủy</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
