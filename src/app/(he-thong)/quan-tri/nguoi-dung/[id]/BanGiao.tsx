"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useGoiApi } from "@/components/ui/goi-api";
import { dinhDangSo } from "@/lib/dinh-dang";

interface XemTruoc {
  loai: { ma: string; nhan: string; so: number }[];
  tong: number;
}

/**
 * Bàn giao khi nhân viên nghỉ việc (KHN-17): xem trước số việc từng loại, chọn người nhận,
 * rồi chuyển + khóa tài khoản trong một lần. Việc đã xong giữ nguyên người làm.
 */
export default function BanGiao({ nguoiId, hoTen, nguoiNhan }: { nguoiId: string; hoTen: string; nguoiNhan: { id: string; hoTen: string }[] }) {
  const router = useRouter();
  const { goi, dangGui, loi } = useGoiApi();
  const [xt, datXt] = useState<XemTruoc | null>(null);
  const [nhanId, datNhanId] = useState("");
  const [khoa, datKhoa] = useState(true);
  const [ghiChu, datGhiChu] = useState("");
  const [xong, datXong] = useState<string | null>(null);

  return (
    <section className="the">
      <div className="dau">
        <h2>Bàn giao khi nghỉ việc</h2>
      </div>
      <div className="than">
        <p className="phu nho" style={{ marginTop: 0 }}>
          Chuyển khách, lead đang mở, cơ hội đang mở, công việc chưa xong, báo giá chưa chốt, đơn chưa giao xong, hóa đơn đang theo dõi, phiếu hỗ trợ đang mở,
          hợp đồng bảo trì, gia hạn chờ của {hoTen} sang một người khác. Việc đã xong giữ nguyên người làm.
        </p>
        {!xt ? (
          <button
            type="button"
            className="nut"
            disabled={dangGui}
            onClick={async () => {
              const r = await goi<XemTruoc>(`/api/v1/nguoi-dung/${nguoiId}/ban-giao`, "GET");
              if (r) datXt(r);
            }}
          >
            Xem việc cần bàn giao
          </button>
        ) : (
          <>
            <table className="bang">
              <tbody>
                {xt.loai.map((l) => (
                  <tr key={l.ma} className={l.so === 0 ? "mo" : undefined}>
                    <td>{l.nhan}</td>
                    <td className="so">{dinhDangSo(l.so)}</td>
                  </tr>
                ))}
                <tr>
                  <td>
                    <strong>Tổng</strong>
                  </td>
                  <td className="so">
                    <strong>{dinhDangSo(xt.tong)}</strong>
                  </td>
                </tr>
              </tbody>
            </table>
            <div className="luoi-form" style={{ marginTop: 12 }}>
              <div className="truong">
                <label htmlFor="bg-nhan">
                  Người nhận <span className="bat-buoc">*</span>
                </label>
                <select id="bg-nhan" value={nhanId} onChange={(e) => datNhanId(e.target.value)}>
                  <option value="">— Chọn —</option>
                  {nguoiNhan.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.hoTen}
                    </option>
                  ))}
                </select>
              </div>
              <div className="truong">
                <label htmlFor="bg-ghi-chu">Ghi chú</label>
                <input id="bg-ghi-chu" value={ghiChu} onChange={(e) => datGhiChu(e.target.value)} maxLength={1000} />
              </div>
            </div>
            <label className="nho" style={{ display: "flex", gap: 6, alignItems: "center", margin: "8px 0" }}>
              <input type="checkbox" checked={khoa} onChange={(e) => datKhoa(e.target.checked)} /> Khóa tài khoản {hoTen} sau khi bàn giao
            </label>
            <button
              type="button"
              className="nut chinh"
              disabled={dangGui || !nhanId}
              onClick={async () => {
                const r = await goi<{ tong: number; daKhoa: boolean; thieuQuyenXem: string[] }>(`/api/v1/nguoi-dung/${nguoiId}/ban-giao`, "POST", { nguoiNhanId: nhanId, khoaTaiKhoan: khoa, ghiChu });
                if (r) {
                  datXong(
                    `Đã chuyển ${dinhDangSo(r.tong)} việc${r.daKhoa ? " và khóa tài khoản" : ""}.` +
                      (r.thieuQuyenXem.length ? ` Lưu ý: người nhận chưa có quyền xem ${r.thieuQuyenXem.join("; ")} — cấp vai trò phù hợp hoặc phân lại.` : ""),
                  );
                  datXt(null);
                  router.refresh();
                }
              }}
            >
              {dangGui ? "Đang bàn giao…" : "Bàn giao"}
            </button>
          </>
        )}
        {xong && (
          <div className="hop-thong-bao tot" role="status" style={{ marginTop: 10 }}>
            {xong}
          </div>
        )}
        {loi && (
          <div className="hop-thong-bao loi" role="alert" style={{ marginTop: 10 }}>
            {loi.thongBao}
          </div>
        )}
      </div>
    </section>
  );
}
