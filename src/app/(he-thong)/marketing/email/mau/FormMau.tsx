"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import SoanThu from "@/components/email/SoanThu";
import { useGoiApi } from "@/components/ui/goi-api";
import type { Khoi } from "@/modules/email/tinh-toan";

export default function FormMau({
  id,
  ten: tenDau,
  tieuDe: tieuDeDau,
  khoi: khoiDau,
  luuTru,
  duocSua,
  duocGuiThu,
  emailCuaToi,
}: {
  id: string | null;
  ten: string;
  tieuDe: string;
  khoi: Khoi[];
  luuTru: boolean;
  duocSua: boolean;
  duocGuiThu: boolean;
  emailCuaToi: string;
}) {
  const router = useRouter();
  const { goi, dangGui, loi } = useGoiApi();
  const [ten, datTen] = useState(tenDau);
  const [tieuDe, datTieuDe] = useState(tieuDeDau);
  const [khoi, datKhoi] = useState<Khoi[]>(khoiDau);
  const [daLuu, datDaLuu] = useState(false);

  async function luu(e: React.FormEvent) {
    e.preventDefault();
    datDaLuu(false);
    const kq = await goi<{ id: string }>(id ? `/api/v1/email/mau/${id}` : "/api/v1/email/mau", id ? "PUT" : "POST", { ten, tieuDe, khoi });
    if (!kq) return;
    datDaLuu(true);
    if (!id) router.push(`/marketing/email/mau/${kq.id}`);
    router.refresh();
  }
  async function doiLuuTru() {
    if (!id) return;
    if (await goi(`/api/v1/email/mau/${id}/luu-tru`, "POST", { luuTru: !luuTru })) router.refresh();
  }

  return (
    <form onSubmit={luu}>
      {loi && (
        <div className="hop-thong-bao loi" role="alert" style={{ marginBottom: 12 }}>
          {loi.thongBao}
          {Object.entries(loi.loiTruong).length > 0 && (
            <ul className="nho">
              {Object.entries(loi.loiTruong).map(([k, v]) => (
                <li key={k}>{v?.[0]}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      {daLuu && (
        <div className="hop-thong-bao tot" role="status" style={{ marginBottom: 12 }}>
          Đã lưu mẫu.
        </div>
      )}
      <section className="the" style={{ marginBottom: 16 }}>
        <div className="phan-form">
          <div className="truong">
            <label htmlFor="mau-ten">Tên mẫu (nội bộ)</label>
            <input type="text" id="mau-ten" value={ten} maxLength={255} disabled={!duocSua} onChange={(e) => datTen(e.target.value)} required />
          </div>
        </div>
        {duocSua && (
          <div className="chan-form">
            {id && (
              <button type="button" className="nut trong" onClick={doiLuuTru} disabled={dangGui} style={{ marginRight: "auto" }}>
                {luuTru ? "Dùng lại mẫu" : "Lưu trữ mẫu"}
              </button>
            )}
            <button type="submit" className="nut chinh" disabled={dangGui}>
              {dangGui ? "Đang lưu…" : "Lưu mẫu"}
            </button>
          </div>
        )}
      </section>
      <SoanThu
        tieuDe={tieuDe}
        khoi={khoi}
        khiDoi={(t, k) => {
          datDaLuu(false);
          datTieuDe(t);
          datKhoi(k);
        }}
        duocGuiThu={duocGuiThu}
        emailCuaToi={emailCuaToi}
      />
    </form>
  );
}
