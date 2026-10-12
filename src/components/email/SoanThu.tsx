"use client";

import { useEffect, useRef, useState } from "react";
import { useGoiApi } from "@/components/ui/goi-api";
import { BIEN_CA_NHAN, NHAN_KHOI, type Khoi } from "@/modules/email/tinh-toan";
import KhungXemThu from "./KhungXemThu";

type LoaiKhoi = Khoi["loai"];

const KHOI_MOI: Record<LoaiKhoi, Khoi> = {
  "tieu-de": { loai: "tieu-de", noiDung: "" },
  "doan-van": { loai: "doan-van", noiDung: "" },
  nut: { loai: "nut", nhan: "", url: "https://" },
  anh: { loai: "anh", url: "https://", moTa: "", lienKet: "" },
  "danh-sach": { loai: "danh-sach", muc: [""] },
  "ngan-cach": { loai: "ngan-cach" },
};

/**
 * Soạn thư bằng **khối an toàn** (EM-03): người soạn chỉ nhập chữ và địa chỉ https, không có ô
 * nào nhận HTML. Xem trước gọi máy chủ dựng HTML thật (cùng hàm `dungThu()` mà worker dùng).
 */
export default function SoanThu({
  tieuDe,
  khoi,
  khiDoi,
  duocGuiThu,
  emailCuaToi,
}: {
  tieuDe: string;
  khoi: Khoi[];
  khiDoi: (tieuDe: string, khoi: Khoi[]) => void;
  duocGuiThu: boolean;
  emailCuaToi: string;
}) {
  const xem = useGoiApi();
  const thu = useGoiApi();
  const [ban, datBan] = useState<{ html: string; tieuDe: string; thieuChanThu: string[] } | null>(null);
  const [daGuiThu, datDaGuiThu] = useState(false);
  const hen = useRef<ReturnType<typeof setTimeout> | null>(null);
  const goiXem = xem.goi;

  // Xem trước tự cập nhật sau khi ngừng gõ 0,6 giây.
  useEffect(() => {
    if (hen.current) clearTimeout(hen.current);
    hen.current = setTimeout(async () => {
      if (!tieuDe.trim() || khoi.length === 0) return;
      const kq = await goiXem<{ html: string; tieuDe: string; thieuChanThu: string[] }>("/api/v1/email/xem-truoc", "POST", { tieuDe, khoi });
      if (kq) datBan(kq);
    }, 600);
    return () => {
      if (hen.current) clearTimeout(hen.current);
    };
  }, [tieuDe, khoi, goiXem]);

  const sua = (i: number, k: Khoi) => khiDoi(tieuDe, khoi.map((x, j) => (j === i ? k : x)));
  const doiCho = (i: number, d: number) => {
    const ds = [...khoi];
    const [x] = ds.splice(i, 1);
    ds.splice(i + d, 0, x);
    khiDoi(tieuDe, ds);
  };

  async function guiThu() {
    datDaGuiThu(false);
    const kq = await thu.goi("/api/v1/email/gui-thu", "POST", { tieuDe, khoi });
    if (kq) datDaGuiThu(true);
  }

  return (
    <div className="luoi-ben-phai">
      <div>
        <section className="the">
          <div className="phan-form">
            <div className="truong">
              <label htmlFor="st-tieu-de">Tiêu đề thư</label>
              <input type="text" id="st-tieu-de" value={tieuDe} maxLength={200} onChange={(e) => khiDoi(e.target.value, khoi)} placeholder="Ưu đãi tháng 10 cho {{cong_ty}}" required />
              <span className="goi-y">
                Biến được dùng: {Object.entries(BIEN_CA_NHAN).map(([b, m]) => `{{${b}}} = ${m.toLowerCase()}`).join(" · ")}
              </span>
            </div>
          </div>
          <div className="phan-form">
            <h3>Nội dung ({khoi.length} khối)</h3>
            {khoi.map((k, i) => (
              <div className="khoi-email" key={i}>
                <div className="dau-khoi">
                  <strong>{NHAN_KHOI[k.loai]}</strong>
                  <button type="button" className="nut trong nho" disabled={i === 0} onClick={() => doiCho(i, -1)} aria-label="Lên">↑</button>
                  <button type="button" className="nut trong nho" disabled={i === khoi.length - 1} onClick={() => doiCho(i, 1)} aria-label="Xuống">↓</button>
                  <button type="button" className="nut trong nho" onClick={() => khiDoi(tieuDe, khoi.filter((_, j) => j !== i))}>Bỏ</button>
                </div>
                {k.loai === "tieu-de" && <input type="text" aria-label="Tiêu đề" value={k.noiDung} maxLength={200} onChange={(e) => sua(i, { ...k, noiDung: e.target.value })} />}
                {k.loai === "doan-van" && <textarea aria-label="Đoạn văn" rows={4} value={k.noiDung} maxLength={5000} onChange={(e) => sua(i, { ...k, noiDung: e.target.value })} />}
                {k.loai === "nut" && (
                  <div className="luoi-form">
                    <div className="truong">
                      <label>Chữ trên nút</label>
                      <input type="text" value={k.nhan} maxLength={80} onChange={(e) => sua(i, { ...k, nhan: e.target.value })} />
                    </div>
                    <div className="truong">
                      <label>Liên kết (https://)</label>
                      <input type="text" inputMode="url" value={k.url} onChange={(e) => sua(i, { ...k, url: e.target.value })} />
                    </div>
                  </div>
                )}
                {k.loai === "anh" && (
                  <div className="luoi-form">
                    <div className="truong">
                      <label>Địa chỉ ảnh (https://)</label>
                      <input type="text" inputMode="url" value={k.url} onChange={(e) => sua(i, { ...k, url: e.target.value })} />
                    </div>
                    <div className="truong">
                      <label>Mô tả ảnh</label>
                      <input type="text" value={k.moTa} maxLength={200} onChange={(e) => sua(i, { ...k, moTa: e.target.value })} />
                    </div>
                    <div className="truong ca-dong">
                      <label>Bấm vào ảnh thì mở (https://, để trống nếu không)</label>
                      <input type="text" inputMode="url" value={k.lienKet} onChange={(e) => sua(i, { ...k, lienKet: e.target.value })} />
                    </div>
                  </div>
                )}
                {k.loai === "danh-sach" && (
                  <>
                    {k.muc.map((m, j) => (
                      <div key={j} style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                        <input type="text" aria-label={`Mục ${j + 1}`} value={m} maxLength={500} onChange={(e) => sua(i, { ...k, muc: k.muc.map((x, t) => (t === j ? e.target.value : x)) })} />
                        <button type="button" className="nut trong nho" disabled={k.muc.length === 1} onClick={() => sua(i, { ...k, muc: k.muc.filter((_, t) => t !== j) })}>
                          Bỏ
                        </button>
                      </div>
                    ))}
                    <button type="button" className="nut trong nho" onClick={() => sua(i, { ...k, muc: [...k.muc, ""] })}>
                      + Thêm mục
                    </button>
                  </>
                )}
                {k.loai === "ngan-cach" && <p className="phu nho">Một đường kẻ ngang.</p>}
              </div>
            ))}
            <div className="them-khoi">
              {(Object.keys(KHOI_MOI) as LoaiKhoi[]).map((l) => (
                <button key={l} type="button" className="nut nho" onClick={() => khiDoi(tieuDe, [...khoi, structuredClone(KHOI_MOI[l])])}>
                  + {NHAN_KHOI[l]}
                </button>
              ))}
            </div>
            <p className="goi-y" style={{ marginTop: 10 }}>
              Chân thư (tên + địa chỉ công ty từ Hồ sơ công ty, liên kết huỷ nhận tin) luôn được máy tự thêm — không bỏ được.
            </p>
          </div>
        </section>
      </div>
      <div>
        <section className="the">
          <div className="dau">
            <h2>Xem trước</h2>
          </div>
          <div className="than">
            {xem.loi && (
              <div className="hop-thong-bao loi" role="alert">
                {xem.loi.thongBao}
                {Object.entries(xem.loi.loiTruong).length > 0 && (
                  <ul className="nho">
                    {Object.entries(xem.loi.loiTruong).map(([k, v]) => (
                      <li key={k}>{v?.[0]}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            {ban?.thieuChanThu.length ? (
              <div className="hop-thong-bao canh-bao" role="status">
                Hồ sơ công ty chưa khai {ban.thieuChanThu.join(" và ")} — chưa gửi chiến dịch được.
              </div>
            ) : null}
            {ban ? (
              <>
                <p className="nho">
                  <strong>Tiêu đề:</strong> {ban.tieuDe}
                </p>
                <KhungXemThu html={ban.html} tieuDe={ban.tieuDe} />
              </>
            ) : (
              <p className="phu">Nhập tiêu đề và ít nhất một khối để xem trước.</p>
            )}
            {duocGuiThu && (
              <div style={{ marginTop: 12 }}>
                {thu.loi && (
                  <div className="hop-thong-bao loi" role="alert">
                    {thu.loi.thongBao}
                  </div>
                )}
                {daGuiThu && (
                  <div className="hop-thong-bao tot" role="status">
                    Đã gửi thư thử tới {emailCuaToi}.
                  </div>
                )}
                <button type="button" className="nut" onClick={guiThu} disabled={thu.dangGui || !ban}>
                  {thu.dangGui ? "Đang gửi…" : `Gửi thử tới ${emailCuaToi}`}
                </button>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
