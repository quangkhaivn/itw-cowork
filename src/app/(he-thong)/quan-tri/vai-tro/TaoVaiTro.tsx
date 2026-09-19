"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { loiCua, useGoiApi } from "@/components/ui/goi-api";
import BieuTuong from "@/components/ui/BieuTuong";

/** Nút + hộp thoại tạo vai trò tùy chỉnh, có thể sao chép quyền từ một vai trò sẵn có. */
export default function TaoVaiTro({ vaiTro }: { vaiTro: { id: string; ten: string }[] }) {
  const router = useRouter();
  const hop = useRef<HTMLDialogElement>(null);
  const { goi, dangGui, loi, datLoi } = useGoiApi();
  const [gt, datGt] = useState({ ma: "", ten: "", moTa: "", saoChepTuId: "" });

  async function gui(e: React.FormEvent) {
    e.preventDefault();
    const kq = await goi<{ id: string }>("/api/v1/vai-tro", "POST", gt);
    if (kq) {
      hop.current?.close();
      router.push(`/quan-tri/vai-tro/${kq.id}`);
    }
  }

  return (
    <>
      <button
        className="nut chinh"
        onClick={() => {
          datLoi(null);
          hop.current?.showModal();
        }}
      >
        <BieuTuong ten="them" co={16} /> Tạo vai trò
      </button>
      <dialog ref={hop} className="hop-thoai">
        <form onSubmit={gui}>
          <div className="dau">
            <h2>Tạo vai trò</h2>
            <button type="button" className="nut trong icon" onClick={() => hop.current?.close()} aria-label="Đóng">
              <BieuTuong ten="dong" />
            </button>
          </div>
          <div className="than">
            {loi && <div className="hop-thong-bao loi">{loi.thongBao}</div>}
            <div className="truong">
              <label htmlFor="vt-ten">Tên vai trò</label>
              <input id="vt-ten" type="text" value={gt.ten} onChange={(e) => datGt({ ...gt, ten: e.target.value })} required />
              {loiCua(loi, "ten") && <span className="loi-truong">{loiCua(loi, "ten")}</span>}
            </div>
            <div className="truong">
              <label htmlFor="vt-ma">Mã</label>
              <input
                id="vt-ma"
                type="text"
                value={gt.ma}
                onChange={(e) => datGt({ ...gt, ma: e.target.value })}
                placeholder="vi-du: ke-toan-kho"
                required
              />
              <span className={loiCua(loi, "ma") ? "loi-truong" : "goi-y"}>
                {loiCua(loi, "ma") ?? "Chữ thường không dấu, số, gạch ngang. Không đổi được sau khi tạo."}
              </span>
            </div>
            <div className="truong">
              <label htmlFor="vt-mota">Mô tả</label>
              <textarea id="vt-mota" value={gt.moTa} onChange={(e) => datGt({ ...gt, moTa: e.target.value })} />
            </div>
            <div className="truong">
              <label htmlFor="vt-saochep">Sao chép quyền từ</label>
              <select id="vt-saochep" value={gt.saoChepTuId} onChange={(e) => datGt({ ...gt, saoChepTuId: e.target.value })}>
                <option value="">— Bắt đầu trống —</option>
                {vaiTro.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.ten}
                  </option>
                ))}
              </select>
              <span className="goi-y">Chỉ sao chép những quyền chính bạn đang có.</span>
            </div>
            <div className="hanh-dong" style={{ justifyContent: "flex-end" }}>
              <button type="button" className="nut" onClick={() => hop.current?.close()}>
                Hủy
              </button>
              <button type="submit" className="nut chinh" disabled={dangGui}>
                {dangGui ? "Đang tạo…" : "Tạo và cấu hình quyền"}
              </button>
            </div>
          </div>
        </form>
      </dialog>
    </>
  );
}
