"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Nút "Chọn từ Google Drive" (0.24.0, QĐ-213). Google Identity Services xin access token NGẮN HẠN quyền `drive.file` cho
 * OAuth client của doanh nghiệp → Google Picker (API key của doanh nghiệp, App ID = số project) → người dùng tự chọn tệp →
 * gửi mã tệp + token lên Cowork; máy chủ kiểm token, tải tệp vào bài. Token không lưu ở đâu cả. Quyền chia sẻ trên Drive
 * không đổi. CHƯA KIỂM VỚI GOOGLE THẬT (tên hàm gsi / picker theo tài liệu công khai).
 */

type CauHinh = { clientId: string; apiKey: string; appId: string; scope: string };
type KetQua = { daThem: { tenTep: string }[]; loi: { tepId: string; thongBao: string }[] };

interface TokenClient { requestAccessToken(o?: { prompt?: string }): void }
interface PickerBuilder {
  addView(v: unknown): PickerBuilder;
  enableFeature(f: unknown): PickerBuilder;
  setOAuthToken(t: string): PickerBuilder;
  setDeveloperKey(k: string): PickerBuilder;
  setAppId(a: string): PickerBuilder;
  setLocale(l: string): PickerBuilder;
  setCallback(cb: (d: { action: string; docs?: { id: string }[] }) => void): PickerBuilder;
  build(): { setVisible(v: boolean): void };
}
interface GoogleToanCuc {
  accounts: { oauth2: { initTokenClient(o: { client_id: string; scope: string; callback: (r: { access_token?: string; error?: string }) => void }): TokenClient } };
  picker: {
    PickerBuilder: new () => PickerBuilder;
    DocsView: new (id?: unknown) => { setMimeTypes(m: string): unknown; setIncludeFolders(b: boolean): unknown };
    ViewId: { DOCS: unknown };
    Feature: { MULTISELECT_ENABLED: unknown };
    Action: { PICKED: string; CANCEL: string };
  };
}
type CuaSo = Window & { google?: GoogleToanCuc; gapi?: { load(ten: string, cb: () => void): void } };

function napScript(src: string): Promise<void> {
  return new Promise((ok, hong) => {
    if (document.querySelector(`script[src="${src}"]`)) return ok();
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.onload = () => ok();
    s.onerror = () => hong(new Error(`Không tải được ${src}`));
    document.head.appendChild(s);
  });
}

const MIME = "image/jpeg,image/png,image/gif,image/webp,video/mp4,video/quicktime";

export default function ChonTuDrive({ baiId }: { baiId: string }) {
  const router = useRouter();
  const [dang, datDang] = useState(false);
  const [thongBao, datThongBao] = useState<{ lop: string; chu: string } | null>(null);

  async function guiLen(token: string, ids: string[]) {
    datThongBao({ lop: "thong-tin", chu: `Đang tải ${ids.length} tệp từ Google Drive…` });
    const ph = await fetch(`/api/v1/mang-xa-hoi/bai/${baiId}/drive`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accessToken: token, tepIds: ids }) });
    const d = (await ph.json().catch(() => ({}))) as Partial<KetQua> & { thongBao?: string };
    if (!ph.ok) {
      datThongBao({ lop: "loi", chu: d.thongBao ?? `Lỗi ${ph.status}.` });
      return;
    }
    const loi = d.loi ?? [];
    datThongBao({ lop: loi.length ? "canh-bao" : "tot", chu: `Đã thêm ${d.daThem?.length ?? 0} tệp.${loi.length ? ` ${loi.map((l) => l.thongBao).join(" ")}` : ""}` });
    router.refresh();
  }

  async function mo() {
    datDang(true);
    datThongBao(null);
    try {
      const ph = await fetch("/api/v1/mang-xa-hoi/drive/cau-hinh");
      const ch = (await ph.json().catch(() => ({}))) as CauHinh & { thongBao?: string };
      if (!ph.ok) {
        datThongBao({ lop: "canh-bao", chu: ch.thongBao ?? "Chưa cấu hình Google Picker." });
        return;
      }
      await Promise.all([napScript("https://accounts.google.com/gsi/client"), napScript("https://apis.google.com/js/api.js")]);
      const w = window as CuaSo;
      await new Promise<void>((ok) => w.gapi!.load("picker", ok));
      const g = w.google!;
      const tc = g.accounts.oauth2.initTokenClient({
        client_id: ch.clientId,
        scope: ch.scope,
        callback: (r) => {
          if (!r.access_token) {
            datThongBao({ lop: "canh-bao", chu: "Bạn chưa cho phép Cowork mở hộp chọn tệp Google Drive." });
            datDang(false);
            return;
          }
          const token = r.access_token;
          const view = new g.picker.DocsView(g.picker.ViewId.DOCS);
          view.setMimeTypes(MIME);
          view.setIncludeFolders(true);
          new g.picker.PickerBuilder()
            .addView(view)
            .enableFeature(g.picker.Feature.MULTISELECT_ENABLED)
            .setOAuthToken(token)
            .setDeveloperKey(ch.apiKey)
            .setAppId(ch.appId)
            .setLocale("vi")
            .setCallback((d) => {
              if (d.action === g.picker.Action.PICKED && d.docs?.length) void guiLen(token, d.docs.slice(0, 10).map((x) => x.id)).finally(() => datDang(false));
              else if (d.action === g.picker.Action.CANCEL) datDang(false);
            })
            .build()
            .setVisible(true);
        },
      });
      tc.requestAccessToken({ prompt: "" });
    } catch (e) {
      datThongBao({ lop: "loi", chu: e instanceof Error ? e.message : "Không mở được Google Drive." });
      datDang(false);
    }
  }

  return (
    <section className="the">
      <div className="dau"><h2>Google Drive</h2><span className="phu nho">Kho media của công ty — tệp vẫn riêng tư trên Drive</span></div>
      <div className="than" style={{ padding: 16, display: "grid", gap: 8 }}>
        <div><button type="button" className="nut" onClick={mo} disabled={dang}>{dang ? "Đang mở…" : "Chọn từ Google Drive"}</button></div>
        <span className="phu nho">Chọn tối đa 10 ảnh / video mỗi lần (ảnh ≤ 20 MB, video MP4 / MOV ≤ 200 MB). Cowork chỉ đọc được đúng tệp bạn chọn.</span>
        {thongBao && <div className={`hop-thong-bao ${thongBao.lop}`} role="status">{thongBao.chu}</div>}
      </div>
    </section>
  );
}
