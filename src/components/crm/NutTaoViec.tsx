"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import HopThoai from "@/components/ui/HopThoai";
import BieuTuong from "@/components/ui/BieuTuong";
import { loiCua, useGoiApi } from "@/components/ui/goi-api";
import { NHAN_UU_TIEN, UU_TIEN } from "@/modules/crm/hang-so";

/**
 * Nút + hộp thoại tạo công việc có hạn. Gắn sẵn khách / lead / cơ hội qua props.
 * Danh sách người được giao do máy chủ lọc theo phạm vi (nhân viên "own" chỉ thấy chính mình).
 */
export default function NutTaoViec({
  ganKem = {},
  nguoiPhuTrach,
  toiId,
  nhanNut = "Tạo công việc",
  lopNut = "nut",
  moNgay = false,
}: {
  ganKem?: { khachHangId?: string; leadId?: string; coHoiId?: string };
  nguoiPhuTrach: { id: string; fullName: string }[];
  toiId: string;
  nhanNut?: string;
  lopNut?: string;
  /** Mở hộp thoại ngay khi trang tải (đến từ nút "+ Tạo mới" → Công việc). */
  moNgay?: boolean;
}) {
  const router = useRouter();
  const hop = useRef<HTMLDialogElement>(null);
  const { goi, dangGui, loi, datLoi } = useGoiApi();
  const rong = { tieuDe: "", moTa: "", uuTien: "trung-binh", han: "", nguoiPhuTrachId: toiId };
  const [gt, datGt] = useState(rong);

  useEffect(() => {
    if (moNgay && !hop.current?.open) hop.current?.showModal();
  }, [moNgay]);

  async function gui(e: React.FormEvent) {
    e.preventDefault();
    const kq = await goi("/api/v1/cong-viec", "POST", { ...gt, ...ganKem });
    if (kq) {
      hop.current?.close();
      datGt(rong);
      router.refresh();
    }
  }

  return (
    <>
      <button
        type="button"
        className={lopNut}
        onClick={() => {
          datLoi(null);
          hop.current?.showModal();
        }}
      >
        <BieuTuong ten="them" co={16} /> {nhanNut}
      </button>
      <HopThoai ref={hop} tieuDe="Tạo công việc">
        <form onSubmit={gui} noValidate>
          <div className="than">
            {loi && <div className="hop-thong-bao loi" role="alert">{loi.thongBao}</div>}
            <div className="truong">
              <label htmlFor="cv-tieude">
                Việc cần làm <span className="bat-buoc">*</span>
              </label>
              <input id="cv-tieude" type="text" value={gt.tieuDe} onChange={(e) => datGt({ ...gt, tieuDe: e.target.value })} autoFocus />
              {loiCua(loi, "tieuDe") && <span className="loi-truong">{loiCua(loi, "tieuDe")}</span>}
            </div>
            <div className="luoi-form">
              <div className="truong">
                <label htmlFor="cv-han">Hạn</label>
                <input id="cv-han" type="datetime-local" value={gt.han} onChange={(e) => datGt({ ...gt, han: e.target.value })} />
              </div>
              <div className="truong">
                <label htmlFor="cv-uutien">Ưu tiên</label>
                <select id="cv-uutien" value={gt.uuTien} onChange={(e) => datGt({ ...gt, uuTien: e.target.value })}>
                  {UU_TIEN.map((u) => (
                    <option key={u} value={u}>
                      {NHAN_UU_TIEN[u]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="truong">
              <label htmlFor="cv-nguoi">Giao cho</label>
              <select id="cv-nguoi" value={gt.nguoiPhuTrachId} onChange={(e) => datGt({ ...gt, nguoiPhuTrachId: e.target.value })}>
                {nguoiPhuTrach.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.fullName}
                    {n.id === toiId ? " (tôi)" : ""}
                  </option>
                ))}
              </select>
              {loiCua(loi, "nguoiPhuTrachId") && <span className="loi-truong">{loiCua(loi, "nguoiPhuTrachId")}</span>}
            </div>
            <div className="truong">
              <label htmlFor="cv-mota">Ghi chú</label>
              <textarea id="cv-mota" value={gt.moTa} onChange={(e) => datGt({ ...gt, moTa: e.target.value })} rows={3} />
            </div>
          </div>
          <div className="chan-form">
            <button type="button" className="nut" onClick={() => hop.current?.close()}>
              Hủy
            </button>
            <button type="submit" className="nut chinh" disabled={dangGui || gt.tieuDe.trim().length < 3}>
              {dangGui ? "Đang lưu…" : "Tạo công việc"}
            </button>
          </div>
        </form>
      </HopThoai>
    </>
  );
}
