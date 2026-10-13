"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { loiCua, useGoiApi } from "@/components/ui/goi-api";
import type { KhoiLanding } from "@/modules/marketing/khoi-landing";
import SuaKhoi, { XemTruocKhoi } from "./SuaKhoi";

export interface GiaTriLanding {
  id?: string;
  ten: string;
  slug: string;
  tieuDe: string;
  moTa: string;
  formId: string;
  chienDichId: string;
  khoi: KhoiLanding[];
  khoiB: KhoiLanding[] | null;
}

export default function SuaLanding({
  banDau,
  forms,
  chienDich,
  trangThai,
}: {
  banDau: GiaTriLanding;
  forms: { id: string; ten: string; trangThai: string }[];
  chienDich: { id: string; ma: string; ten: string }[];
  trangThai?: string;
}) {
  const router = useRouter();
  const laMoi = !banDau.id;
  const luu = useGoiApi();
  const tt = useGoiApi();
  const [gt, datGt] = useState(banDau);
  const [dangSua, datDangSua] = useState<"A" | "B">("A");
  const [daLuu, datDaLuu] = useState(false);
  const dat = <K extends keyof GiaTriLanding>(k: K, v: GiaTriLanding[K]) => {
    datGt((c) => ({ ...c, [k]: v }));
    datDaLuu(false);
  };

  /** Bỏ dòng lợi ích trống do người dùng gõ xuống dòng thừa. */
  const gon = (ds: KhoiLanding[] | null) => ds && ds.map((k) => (k.loai === "loi-ich" ? { ...k, muc: k.muc.filter((m) => m.trim()) } : k));

  async function gui(e: React.FormEvent) {
    e.preventDefault();
    const than = { ten: gt.ten, slug: gt.slug || null, tieuDe: gt.tieuDe, moTa: gt.moTa || null, formId: gt.formId || null, chienDichId: gt.chienDichId || null, khoi: laMoi ? undefined : gon(gt.khoi), khoiB: laMoi ? undefined : gon(gt.khoiB) };
    const kq = await luu.goi<{ id: string }>(laMoi ? "/api/v1/marketing/landing" : `/api/v1/marketing/landing/${banDau.id}`, laMoi ? "POST" : "PATCH", than);
    if (kq) {
      if (laMoi) router.push(`/marketing/landing/${kq.id}`);
      else {
        datDaLuu(true);
        router.refresh();
      }
    }
  }

  async function doiTrangThai(trangThaiMoi: string) {
    if (await tt.goi(`/api/v1/marketing/landing/${banDau.id}/trang-thai`, "POST", { trangThai: trangThaiMoi })) router.refresh();
  }

  const khoiDangSua = dangSua === "A" ? gt.khoi : (gt.khoiB ?? []);
  const datKhoiDangSua = (k: KhoiLanding[]) => (dangSua === "A" ? dat("khoi", k) : dat("khoiB", k));
  const loiKhoi = luu.loi && Object.entries(luu.loi.loiTruong).find(([k]) => k.startsWith("khoi"));

  return (
    <form onSubmit={gui} noValidate>
      {!laMoi && (
        <div className="hanh-dong" style={{ marginBottom: 12 }}>
          {trangThai !== "xuat-ban" && (
            <button type="button" className="nut chinh" disabled={tt.dangGui} onClick={() => doiTrangThai("xuat-ban")}>
              Xuất bản
            </button>
          )}
          {trangThai === "xuat-ban" && (
            <button type="button" className="nut" disabled={tt.dangGui} onClick={() => doiTrangThai("an")}>
              Ẩn trang
            </button>
          )}
          {tt.loi && <span className="loi-truong">{tt.loi.thongBao}</span>}
        </div>
      )}
      <section className="the">
        <div className="phan-form">
          {luu.loi && (
            <div className="hop-thong-bao loi" role="alert">
              {luu.loi.thongBao}
              {loiKhoi ? ` — khối: ${(loiKhoi[1] ?? [])[0]}` : ""}
            </div>
          )}
          {daLuu && <div className="hop-thong-bao tot" role="status">Đã lưu.</div>}
          <div className="luoi-form">
            {(["ten", "slug", "tieuDe", "moTa"] as const).map((k) => (
              <div className="truong" key={k}>
                <label htmlFor={`lp-${k}`}>{{ ten: "Tên (nội bộ)", slug: "Đường dẫn", tieuDe: "Tiêu đề trang (thẻ title)", moTa: "Mô tả ngắn (chia sẻ mạng xã hội)" }[k]}</label>
                <input id={`lp-${k}`} type="text" value={gt[k]} onChange={(e) => dat(k, e.target.value)} aria-invalid={loiCua(luu.loi, k) ? true : undefined} />
                {loiCua(luu.loi, k) && <span className="loi-truong">{loiCua(luu.loi, k)}</span>}
              </div>
            ))}
            <div className="truong">
              <label htmlFor="lp-form">Form đăng ký trên trang</label>
              <select id="lp-form" value={gt.formId} onChange={(e) => dat("formId", e.target.value)} aria-invalid={loiCua(luu.loi, "formId") ? true : undefined}>
                <option value="">— Không có form —</option>
                {forms.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.ten}
                    {f.trangThai === "tat" ? " (đang tắt)" : ""}
                  </option>
                ))}
              </select>
              {loiCua(luu.loi, "formId") && <span className="loi-truong">{loiCua(luu.loi, "formId")}</span>}
            </div>
            <div className="truong">
              <label htmlFor="lp-cd">Chiến dịch</label>
              <select id="lp-cd" value={gt.chienDichId} onChange={(e) => dat("chienDichId", e.target.value)}>
                <option value="">— Không gắn —</option>
                {chienDich.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.ma} — {c.ten}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {laMoi && <p className="goi-y">Trang mới bắt đầu từ một mẫu khối đơn giản; sửa khối sau khi tạo.</p>}
        </div>
        {!laMoi && (
          <div className="phan-form">
            <div className="hang-nhap" style={{ marginBottom: 12, alignItems: "center" }}>
              <h3 style={{ margin: 0 }}>Khối nội dung</h3>
              <button type="button" className={`nut nho ${dangSua === "A" ? "chinh" : ""}`} onClick={() => datDangSua("A")}>
                Biến thể A
              </button>
              {gt.khoiB ? (
                <>
                  <button type="button" className={`nut nho ${dangSua === "B" ? "chinh" : ""}`} onClick={() => datDangSua("B")}>
                    Biến thể B
                  </button>
                  <button type="button" className="nut nho trong" onClick={() => { dat("khoiB", null); datDangSua("A"); }}>
                    Tắt A/B
                  </button>
                </>
              ) : (
                <button type="button" className="nut nho" onClick={() => { dat("khoiB", gt.khoi.map((k) => ({ ...k }))); datDangSua("B"); }}>
                  Bật thử nghiệm A/B (chép từ A)
                </button>
              )}
            </div>
            <div className="luoi-the">
              <SuaKhoi key={dangSua} khoi={khoiDangSua} datKhoi={datKhoiDangSua} tenBienThe={dangSua} />
              <XemTruocKhoi khoi={khoiDangSua} />
            </div>
          </div>
        )}
        <div className="chan-form">
          <button type="button" className="nut" onClick={() => router.push("/marketing/landing")}>
            Về danh sách
          </button>
          <button type="submit" className="nut chinh" disabled={luu.dangGui}>
            {luu.dangGui ? "Đang lưu…" : laMoi ? "Tạo landing page" : "Lưu"}
          </button>
        </div>
      </section>
    </form>
  );
}
