"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import HopThoai from "@/components/ui/HopThoai";
import { loiCua, useGoiApi } from "@/components/ui/goi-api";

/**
 * Form trong hộp thoại cho các danh mục thiết lập nhân sự (địa điểm, ca, lịch, ngày lễ, loại nghỉ, máy
 * chấm công, hợp đồng…). Mỗi trường khai kiểu; giá trị gửi lên đúng kiểu lược đồ Zod của API. Kiểm tra
 * thật nằm ở máy chủ — form chỉ gom dữ liệu và hiện lỗi từng trường.
 */

export type KieuTruong = "text" | "number" | "time" | "date" | "select" | "checkbox" | "textarea" | "tuan" | "nhieu" | "dong-ip";

export interface TruongForm {
  ten: string;
  nhan: string;
  kieu: KieuTruong;
  luaChon?: { giaTri: string; nhan: string }[];
  goiY?: string;
  batBuoc?: boolean;
  /** Ô số trống gửi null (để "dùng mặc định Cấu hình"). */
  trongLaNull?: boolean;
  caDong?: boolean;
}

const NGAY_TUAN = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
const PHAN_TUAN = [
  { giaTri: "ca", nhan: "Cả ca" },
  { giaTri: "sang", nhan: "Sáng" },
  { giaTri: "chieu", nhan: "Chiều" },
  { giaTri: "nghi", nhan: "Nghỉ" },
];

type GiaTri = string | number | boolean | null | string[];

export default function FormNhanh({
  nhanNut,
  tieuDe,
  url,
  phuongThuc = "POST",
  truong,
  giaTriDau = {},
  lopNut = "nut",
  rong = 520,
  bocTrong,
  themVaoThan,
}: {
  nhanNut: string;
  tieuDe: string;
  url: string;
  phuongThuc?: "POST" | "PUT";
  truong: TruongForm[];
  giaTriDau?: Record<string, GiaTri>;
  lopNut?: string;
  rong?: number;
  /** Gói các trường vào một khóa con, ví dụ `{ thucTap: {...} }`. */
  bocTrong?: string;
  /** Trường cố định gửi kèm (không hiện trên form), ví dụ id người. */
  themVaoThan?: Record<string, unknown>;
}) {
  const router = useRouter();
  const hop = useRef<HTMLDialogElement | null>(null);
  const { goi, dangGui, loi, datLoi } = useGoiApi();
  const [gt, datGt] = useState<Record<string, GiaTri>>(giaTriDau);
  const doi = (k: string, v: GiaTri) => datGt((x) => ({ ...x, [k]: v }));

  function mo() {
    datGt(giaTriDau);
    datLoi(null);
    hop.current?.showModal();
  }

  async function gui() {
    const than: Record<string, unknown> = {};
    for (const t of truong) {
      const v = gt[t.ten];
      if (t.kieu === "number") than[t.ten] = v === "" || v === null || v === undefined ? (t.trongLaNull ? null : undefined) : Number(String(v).replace(",", "."));
      else if (t.kieu === "checkbox") than[t.ten] = Boolean(v);
      else if (t.kieu === "dong-ip") than[t.ten] = String(v ?? "").split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
      else if (t.kieu === "tuan" || t.kieu === "nhieu") than[t.ten] = v ?? [];
      else than[t.ten] = v ?? "";
    }
    const gui = { ...(themVaoThan ?? {}), ...(bocTrong ? { [bocTrong]: than } : than) };
    if (await goi(url, phuongThuc, gui)) {
      hop.current?.close();
      router.refresh();
    }
  }

  return (
    <>
      <button type="button" className={lopNut} onClick={mo}>{nhanNut}</button>
      <HopThoai ref={hop} tieuDe={tieuDe} rong={rong}>
        <div className="than">
          {loi && <div className="hop-thong-bao loi" role="alert">{loi.thongBao}</div>}
          <div className="luoi-form">
            {truong.map((t) => {
              const id = `fn-${t.ten}`;
              const v = gt[t.ten];
              const loiT = loiCua(loi, t.ten);
              return (
                <div key={t.ten} className={`truong${t.caDong || ["textarea", "tuan", "nhieu", "checkbox"].includes(t.kieu) ? " ca-dong" : ""}`}>
                  {t.kieu !== "checkbox" && (
                    <label htmlFor={id}>
                      {t.nhan} {t.batBuoc && <span className="bat-buoc">*</span>}
                    </label>
                  )}
                  {t.kieu === "select" ? (
                    <select id={id} value={String(v ?? "")} onChange={(e) => doi(t.ten, e.target.value)}>
                      {t.luaChon?.map((l) => <option key={l.giaTri} value={l.giaTri}>{l.nhan}</option>)}
                    </select>
                  ) : t.kieu === "textarea" ? (
                    <textarea id={id} rows={3} value={String(v ?? "")} onChange={(e) => doi(t.ten, e.target.value)} />
                  ) : t.kieu === "checkbox" ? (
                    <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <input id={id} type="checkbox" checked={Boolean(v)} onChange={(e) => doi(t.ten, e.target.checked)} /> {t.nhan}
                    </label>
                  ) : t.kieu === "tuan" ? (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 4 }}>
                      {NGAY_TUAN.map((n, i) => (
                        <label key={n} style={{ display: "flex", flexDirection: "column", fontSize: 12 }}>
                          {n}
                          <select
                            value={(Array.isArray(v) ? v[i] : undefined) ?? "nghi"}
                            onChange={(e) => {
                              const m = Array.isArray(v) ? [...v] : Array(7).fill("nghi");
                              m[i] = e.target.value;
                              doi(t.ten, m);
                            }}
                          >
                            {PHAN_TUAN.map((p) => <option key={p.giaTri} value={p.giaTri}>{p.nhan}</option>)}
                          </select>
                        </label>
                      ))}
                    </div>
                  ) : t.kieu === "nhieu" ? (
                    <select
                      id={id}
                      multiple
                      size={Math.min(10, t.luaChon?.length ?? 4)}
                      value={Array.isArray(v) ? v : []}
                      onChange={(e) => doi(t.ten, [...e.target.selectedOptions].map((o) => o.value))}
                    >
                      {t.luaChon?.map((l) => <option key={l.giaTri} value={l.giaTri}>{l.nhan}</option>)}
                    </select>
                  ) : (
                    <input
                      id={id}
                      type={t.kieu === "dong-ip" ? "text" : t.kieu}
                      step={t.kieu === "number" ? "any" : undefined}
                      value={Array.isArray(v) ? v.join(", ") : String(v ?? "")}
                      onChange={(e) => doi(t.ten, e.target.value)}
                    />
                  )}
                  {t.goiY && <span className="goi-y">{t.goiY}</span>}
                  {loiT && <span className="loi-truong">{loiT}</span>}
                </div>
              );
            })}
          </div>
        </div>
        <div className="chan-form">
          <button type="button" className="nut" onClick={() => hop.current?.close()} disabled={dangGui}>Đóng</button>
          <button type="button" className="nut chinh" onClick={gui} disabled={dangGui}>{dangGui ? "Đang lưu…" : "Lưu"}</button>
        </div>
      </HopThoai>
    </>
  );
}
