"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useGoiApi } from "@/components/ui/goi-api";
import { dinhDangSo } from "@/lib/dinh-dang";

/** Nút "Tính lại toàn bộ" — quản lý (`customer.approve`). */
export function NutTinhLai() {
  const router = useRouter();
  const { goi, dangGui, loi } = useGoiApi();
  const [kq, datKq] = useState<{ soKhach: number; soDoi: number } | null>(null);
  return (
    <>
      <button
        type="button"
        className="nut chinh"
        disabled={dangGui}
        onClick={async () => {
          const r = await goi<{ soKhach: number; soDoi: number }>("/api/v1/cham-diem/tinh-lai", "POST");
          if (r) {
            datKq(r);
            router.refresh();
          }
        }}
      >
        {dangGui ? "Đang tính…" : "Tính lại toàn bộ"}
      </button>
      {kq && <span className="phu nho" role="status">Đã tính {dinhDangSo(kq.soKhach)} khách, {dinhDangSo(kq.soDoi)} khách đổi điểm.</span>}
      {loi && <span className="chu-loi nho">{loi.thongBao}</span>}
    </>
  );
}

/** Bảng điểm theo nguồn khách (Dữ liệu gốc "nguồn lead"). Để trống = nguồn đó 0 điểm. */
export function DiemNguon({ nguon, duocSua }: { nguon: { ma: string; ten: string; dangDung: boolean; diem: number | null }[]; duocSua: boolean }) {
  const router = useRouter();
  const { goi, dangGui, loi } = useGoiApi();
  const [gt, datGt] = useState<Record<string, string>>(Object.fromEntries(nguon.map((n) => [n.ma, n.diem === null ? "" : String(n.diem)])));
  const [daLuu, datDaLuu] = useState(false);

  if (nguon.length === 0) return <p className="phu" style={{ padding: 16 }}>Chưa có nguồn khách nào trong Dữ liệu gốc.</p>;
  return (
    <div className="than">
      <p className="phu nho" style={{ marginTop: 0 }}>Chưa đặt điểm cho nguồn nào thì nguồn đó cộng 0 điểm — hệ thống không tự đoán nguồn nào “tốt” hơn.</p>
      <table className="bang">
        <tbody>
          {nguon.map((n) => (
            <tr key={n.ma} className={n.dangDung ? undefined : "mo"}>
              <td>
                {n.ten}
                {!n.dangDung && <span className="huy-hieu">Ngừng</span>}
              </td>
              <td className="so" style={{ width: 120 }}>
                {duocSua ? (
                  <input
                    type="number"
                    min={0}
                    max={100}
                    aria-label={`Điểm nguồn ${n.ten}`}
                    value={gt[n.ma] ?? ""}
                    placeholder="0"
                    onChange={(e) => {
                      datDaLuu(false);
                      datGt({ ...gt, [n.ma]: e.target.value });
                    }}
                    style={{ width: 90 }}
                  />
                ) : n.diem === null ? (
                  <span className="mo">chưa đặt</span>
                ) : (
                  n.diem
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {duocSua && (
        <div className="chan-form" style={{ paddingInline: 0 }}>
          <button
            type="button"
            className="nut chinh"
            disabled={dangGui}
            onClick={async () => {
              const diemNguon = Object.fromEntries(Object.entries(gt).map(([k, v]) => [k, v.trim() === "" ? null : Number(v)]));
              if (await goi("/api/v1/cham-diem", "PUT", { diemNguon })) {
                datDaLuu(true);
                router.refresh();
              }
            }}
          >
            {dangGui ? "Đang lưu…" : "Lưu điểm nguồn"}
          </button>
          {daLuu && <span className="phu nho">Đã lưu. Bấm “Tính lại toàn bộ” để áp ngay cho mọi khách.</span>}
          {loi && <span className="chu-loi nho">{loi.thongBao}</span>}
        </div>
      )}
    </div>
  );
}
