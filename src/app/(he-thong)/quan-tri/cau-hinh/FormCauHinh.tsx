"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useGoiApi } from "@/components/ui/goi-api";
import { dinhDangSo } from "@/lib/dinh-dang";

interface Muc {
  khoa: string;
  nhom: string;
  nhan: string;
  moTa: string;
  donVi: string;
  toiThieu: number;
  toiDa: number;
  soNguyen: boolean;
  macDinh: number | null;
  giaTri: number | null;
  dungTuPhase: number;
}

/**
 * Form cấu hình theo nhóm. Ô để trống = dùng mặc định, hoặc "chưa cấu hình" nếu mục
 * không có mặc định (khi đó phân hệ dùng nó chọn hành vi an toàn — ví dụ bắt duyệt mọi báo giá).
 */
export default function FormCauHinh({ muc, duocSua, phaseHienTai }: { muc: Muc[]; duocSua: boolean; phaseHienTai: number }) {
  const router = useRouter();
  const { goi, dangGui, loi } = useGoiApi();
  const [ban, datBan] = useState<Record<string, string>>(() =>
    Object.fromEntries(muc.map((m) => [m.khoa, m.giaTri === null ? "" : String(m.giaTri)])),
  );
  const [daLuu, datDaLuu] = useState<number | null>(null);

  const nhom = useMemo(() => [...new Set(muc.map((m) => m.nhom))], [muc]);
  const thayDoi = muc.filter((m) => (m.giaTri === null ? "" : String(m.giaTri)) !== ban[m.khoa]);

  async function luu(e: React.FormEvent) {
    e.preventDefault();
    const giaTri = Object.fromEntries(
      thayDoi.map((m) => {
        const chuoi = ban[m.khoa].trim().replace(",", ".");
        return [m.khoa, chuoi === "" ? null : Number(chuoi)];
      }),
    );
    const kq = await goi<{ soDoi: number }>("/api/v1/cau-hinh", "PATCH", { giaTri });
    if (kq) {
      datDaLuu(kq.soDoi);
      router.refresh();
    }
  }

  return (
    <form className="the" onSubmit={luu}>
      {loi && (
        <div className="hop-thong-bao loi" role="alert" style={{ margin: 16 }}>
          {loi.thongBao}
        </div>
      )}
      {daLuu !== null && thayDoi.length === 0 && (
        <div className="hop-thong-bao tot" role="status" style={{ margin: 16 }}>
          Đã lưu {daLuu} thay đổi.
        </div>
      )}
      {nhom.map((n) => (
        <div className="phan-form" key={n}>
          <h3>{n}</h3>
          <div className="luoi-form">
            {muc
              .filter((m) => m.nhom === n)
              .map((m) => {
                const chuaDung = m.dungTuPhase > phaseHienTai;
                return (
                  <div className="truong" key={m.khoa}>
                    <label htmlFor={m.khoa}>
                      {m.nhan} ({m.donVi}){" "}
                      {chuaDung && <span className="huy-hieu">Dùng từ Phase {m.dungTuPhase}</span>}
                    </label>
                    <input
                      id={m.khoa}
                      type="number"
                      inputMode="decimal"
                      step={m.soNguyen ? 1 : "any"}
                      min={m.toiThieu}
                      max={m.toiDa}
                      value={ban[m.khoa]}
                      disabled={!duocSua}
                      placeholder={m.macDinh === null ? "Chưa cấu hình" : `Mặc định: ${dinhDangSo(m.macDinh)}`}
                      onChange={(e) => {
                        datBan({ ...ban, [m.khoa]: e.target.value });
                        datDaLuu(null);
                      }}
                    />
                    <span className="goi-y">
                      {m.moTa} Khoảng cho phép: {dinhDangSo(m.toiThieu)}–{dinhDangSo(m.toiDa)}.
                    </span>
                  </div>
                );
              })}
          </div>
        </div>
      ))}
      {duocSua && (
        <div className="chan-form">
          <span className="phu" style={{ marginRight: "auto", alignSelf: "center" }}>
            {thayDoi.length ? `${thayDoi.length} mục đã sửa, chưa lưu` : "Không có thay đổi"}
          </span>
          <button type="submit" className="nut chinh" disabled={dangGui || thayDoi.length === 0}>
            {dangGui ? "Đang lưu…" : "Lưu cấu hình"}
          </button>
        </div>
      )}
    </form>
  );
}
