"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useGoiApi } from "@/components/ui/goi-api";
import { dinhDangNgayGio } from "@/lib/dinh-dang";

interface Muc {
  id: string;
  nhan: string;
  batBuoc: boolean;
  daTich: boolean;
  tichLuc: string | null;
  nguoiTich: string | null;
}

/**
 * Danh sách kiểm tra trước khi xong (CV-07). Mục **bắt buộc** chưa tích thì máy chủ không cho
 * đánh dấu xong. Khóa khi việc đã xong hoặc đã hủy — mở lại việc để sửa.
 */
export default function DanhSachKiemTra({
  taskId,
  muc,
  suaDuoc,
  khoaVi,
}: {
  taskId: string;
  muc: Muc[];
  suaDuoc: boolean;
  /** Lý do khóa (việc đã xong / đã hủy), null nếu đang mở. */
  khoaVi: string | null;
}) {
  const router = useRouter();
  const { goi, dangGui, loi } = useGoiApi();
  const [nhanMoi, datNhanMoi] = useState("");
  const [batBuoc, datBatBuoc] = useState(true);
  // Tích hiện ngay trên màn hình, không chờ máy chủ; máy chủ từ chối thì trả lại như cũ.
  const [tamTich, datTamTich] = useState<Record<string, boolean>>({});

  async function tich(m: Muc, daTich: boolean) {
    datTamTich((c) => ({ ...c, [m.id]: daTich }));
    const ok = await goi(`/api/v1/cong-viec/muc-kiem-tra/${m.id}`, "PATCH", { daTich });
    if (ok) router.refresh();
    else
      datTamTich((c) => {
        const { [m.id]: _bo, ...con } = c;
        void _bo;
        return con;
      });
  }
  const daTichCua = (m: Muc) => tamTich[m.id] ?? m.daTich;
  async function go(m: Muc) {
    if (await goi(`/api/v1/cong-viec/muc-kiem-tra/${m.id}`, "DELETE")) router.refresh();
  }
  async function them(e: React.FormEvent) {
    e.preventDefault();
    if (await goi(`/api/v1/cong-viec/${taskId}/muc-kiem-tra`, "POST", { nhan: nhanMoi, batBuoc })) {
      datNhanMoi("");
      router.refresh();
    }
  }

  if (!muc.length && !suaDuoc) return null;
  const conThieu = muc.filter((m) => m.batBuoc && !daTichCua(m)).length;

  return (
    <section className="the">
      <div className="dau">
        <h2>Danh sách kiểm tra trước khi xong</h2>
        {khoaVi ? (
          <span className="huy-hieu">{khoaVi} — đã khóa</span>
        ) : conThieu ? (
          <span className="huy-hieu canh-bao">Còn {conThieu} mục bắt buộc</span>
        ) : muc.length ? (
          <span className="huy-hieu tot">Đủ mục bắt buộc</span>
        ) : null}
      </div>
      {loi && (
        <div className="hop-thong-bao loi" role="alert" style={{ margin: "0 16px 12px" }}>
          {loi.thongBao}
        </div>
      )}
      {muc.length === 0 ? (
        <p className="phu" style={{ margin: 0, padding: "0 16px 12px" }}>
          Chưa có mục nào. Thêm các bước phải làm xong trước khi báo hoàn thành — ví dụ “Chụp ảnh hiện trường”, “Khách ký biên bản”.
        </p>
      ) : (
        <ul className="ds-kiem-tra">
          {muc.map((m) => (
            <li key={m.id} className={daTichCua(m) ? "da-tich" : undefined}>
              <input
                type="checkbox"
                aria-label={`Đã xong: ${m.nhan}`}
                checked={daTichCua(m)}
                disabled={!suaDuoc}
                onChange={(e) => tich(m, e.target.checked)}
              />
              <div className="nhan-muc">
                <span>{m.nhan}</span> {m.batBuoc ? <span className="huy-hieu">Bắt buộc</span> : <span className="huy-hieu">Không bắt buộc</span>}
                {m.daTich && m.tichLuc && (
                  <div className="dong-phu">
                    {m.nguoiTich ?? "—"} · {dinhDangNgayGio(m.tichLuc)}
                  </div>
                )}
              </div>
              {suaDuoc && (
                <button type="button" className="nut trong nho" disabled={dangGui} onClick={() => go(m)} aria-label={`Gỡ mục ${m.nhan}`}>
                  Gỡ
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {suaDuoc && (
        <form className="them-muc" onSubmit={them}>
          <input type="text" aria-label="Mục kiểm tra mới" value={nhanMoi} onChange={(e) => datNhanMoi(e.target.value)} placeholder="Thêm mục kiểm tra…" maxLength={300} />
          <label style={{ display: "flex", gap: 6, alignItems: "center", whiteSpace: "nowrap" }}>
            <input type="checkbox" checked={batBuoc} onChange={(e) => datBatBuoc(e.target.checked)} /> Bắt buộc
          </label>
          <button type="submit" className="nut nho" disabled={dangGui || nhanMoi.trim().length < 2}>
            Thêm
          </button>
        </form>
      )}
    </section>
  );
}
