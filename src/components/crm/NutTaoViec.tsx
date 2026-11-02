"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import HopThoai from "@/components/ui/HopThoai";
import BieuTuong from "@/components/ui/BieuTuong";
import { loiCua, useGoiApi } from "@/components/ui/goi-api";
import { NHAN_UU_TIEN, UU_TIEN } from "@/modules/crm/hang-so";
import { NHAN_DO_KHO } from "@/modules/danh-gia/tinh-toan";

/** 0.20.0 — mẫu việc gọn để điền sẵn form (DG-06). */
export interface MauViecGon {
  id: string;
  ten: string;
  tieuDe: string;
  doKho: number;
  canDuyet: boolean;
  mucKiemTra: { nhan: string; batBuoc: boolean }[];
}

/**
 * Nút + hộp thoại tạo công việc có hạn. Gắn sẵn khách / lead / cơ hội qua props.
 * Danh sách người được giao do máy chủ lọc theo phạm vi (nhân viên "own" chỉ thấy chính mình).
 *
 * 0.20.0: độ khó 1–5, "cần duyệt" (mặc định bật khi giao cho người khác — DG-02), người duyệt (mặc định
 * người giao), mẫu việc, giao thêm nhiều người (mỗi người một việc — DG-08). Máy chủ kiểm lại tất cả.
 */
export default function NutTaoViec({
  ganKem = {},
  nguoiPhuTrach,
  toiId,
  nhanNut = "Tạo công việc",
  lopNut = "nut",
  moNgay = false,
  mauViec = [],
  nguoiDuyet,
}: {
  ganKem?: { khachHangId?: string; leadId?: string; coHoiId?: string };
  nguoiPhuTrach: { id: string; fullName: string }[];
  toiId: string;
  nhanNut?: string;
  lopNut?: string;
  /** Mở hộp thoại ngay khi trang tải (đến từ nút "+ Tạo mới" → Công việc). */
  moNgay?: boolean;
  mauViec?: MauViecGon[];
  /** Người có thể chọn làm người duyệt (mặc định = danh sách giao + chính mình). */
  nguoiDuyet?: { id: string; fullName: string }[];
}) {
  const router = useRouter();
  const hop = useRef<HTMLDialogElement>(null);
  const { goi, dangGui, loi, datLoi } = useGoiApi();
  const rong = { tieuDe: "", moTa: "", uuTien: "trung-binh", han: "", nguoiPhuTrachId: toiId, kiemTra: "", doKho: "3", mauViecId: "", nguoiDuyetId: "" };
  const [gt, datGt] = useState(rong);
  // null = theo mặc định (bật khi giao người khác); true/false = người giao đã chọn.
  const [canDuyetChon, datCanDuyetChon] = useState<boolean | null>(null);
  const [them, datThem] = useState<string[]>([]);
  const dsDuyet = nguoiDuyet ?? nguoiPhuTrach;
  const giaoNguoiKhac = gt.nguoiPhuTrachId !== toiId || them.length > 0;
  const canDuyet = canDuyetChon ?? giaoNguoiKhac;

  function chonMau(id: string) {
    const m = mauViec.find((x) => x.id === id);
    if (!m) {
      datGt({ ...gt, mauViecId: "" });
      return;
    }
    datGt({
      ...gt,
      mauViecId: m.id,
      tieuDe: gt.tieuDe || m.tieuDe,
      doKho: String(m.doKho),
      kiemTra: gt.kiemTra || m.mucKiemTra.map((x) => `${x.batBuoc ? "" : "? "}${x.nhan}`).join("\n"),
    });
    datCanDuyetChon(m.canDuyet);
  }

  useEffect(() => {
    if (moNgay && !hop.current?.open) hop.current?.showModal();
  }, [moNgay]);

  async function gui(e: React.FormEvent) {
    e.preventDefault();
    // 0.17.0 (CV-07): mỗi dòng là một mục kiểm tra bắt buộc; dòng bắt đầu bằng "?" là không bắt buộc.
    const mucKiemTra = gt.kiemTra
      .split("\n")
      .map((d) => d.trim())
      .filter((d) => d.replace(/^\?\s*/, "").length >= 2)
      .map((d) => (d.startsWith("?") ? { nhan: d.replace(/^\?\s*/, ""), batBuoc: false } : { nhan: d, batBuoc: true }));
    const { kiemTra: _bo, ...duLieu } = gt;
    void _bo;
    const { nguoiDuyetId, doKho, mauViecId, ...conLai } = duLieu;
    const nguoiPhuTrachIds = them.length ? [...new Set([conLai.nguoiPhuTrachId, ...them])] : undefined;
    const kq = await goi("/api/v1/cong-viec", "POST", {
      ...conLai,
      ...ganKem,
      mucKiemTra,
      doKho: Number(doKho),
      canDuyet,
      ...(canDuyet && nguoiDuyetId && { nguoiDuyetIds: [nguoiDuyetId] }),
      ...(mauViecId && { mauViecId }),
      ...(nguoiPhuTrachIds && nguoiPhuTrachIds.length > 1 && { nguoiPhuTrachIds }),
    });
    if (kq) {
      hop.current?.close();
      datGt(rong);
      datCanDuyetChon(null);
      datThem([]);
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
            {mauViec.length > 0 && (
              <div className="truong">
                <label htmlFor="cv-mau">Mẫu việc</label>
                <select id="cv-mau" value={gt.mauViecId} onChange={(e) => chonMau(e.target.value)}>
                  <option value="">— Không dùng mẫu —</option>
                  {mauViec.map((m) => (
                    <option key={m.id} value={m.id}>{m.ten}</option>
                  ))}
                </select>
              </div>
            )}
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
            {nguoiPhuTrach.length > 2 && (
              <details className="truong">
                <summary>Giao thêm người (mỗi người một việc riêng){them.length ? ` — ${them.length} người` : ""}</summary>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 4, marginTop: 6 }}>
                  {nguoiPhuTrach.filter((n) => n.id !== gt.nguoiPhuTrachId).map((n) => (
                    <label key={n.id} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <input type="checkbox" checked={them.includes(n.id)} onChange={(e) => datThem(e.target.checked ? [...them, n.id] : them.filter((x) => x !== n.id))} />
                      {n.fullName}
                    </label>
                  ))}
                </div>
              </details>
            )}
            <div className="luoi-form">
              <div className="truong">
                <label htmlFor="cv-dokho">Độ khó</label>
                <select id="cv-dokho" value={gt.doKho} onChange={(e) => datGt({ ...gt, doKho: e.target.value })}>
                  {[1, 2, 3, 4, 5].map((d) => (
                    <option key={d} value={d}>{d} — {NHAN_DO_KHO[d]}</option>
                  ))}
                </select>
              </div>
              <div className="truong">
                <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 22 }}>
                  <input type="checkbox" checked={canDuyet} onChange={(e) => datCanDuyetChon(e.target.checked)} /> Cần duyệt khi xong
                </label>
              </div>
            </div>
            {canDuyet && (
              <div className="truong">
                <label htmlFor="cv-duyet">Người duyệt</label>
                <select id="cv-duyet" value={gt.nguoiDuyetId} onChange={(e) => datGt({ ...gt, nguoiDuyetId: e.target.value })}>
                  <option value="">{gt.mauViecId ? "Theo chuỗi duyệt của mẫu" : "Người giao (tôi)"}</option>
                  {dsDuyet.filter((n) => n.id !== gt.nguoiPhuTrachId).map((n) => (
                    <option key={n.id} value={n.id}>{n.fullName}{n.id === toiId ? " (tôi)" : ""}</option>
                  ))}
                </select>
                <span className="goi-y">Người làm bấm Xong thì việc chuyển “Chờ duyệt”; người duyệt chấm chất lượng 1–5 hoặc trả lại kèm lý do. Không ai duyệt việc của chính mình.</span>
              </div>
            )}
            <div className="truong">
              <label htmlFor="cv-mota">Ghi chú</label>
              <textarea id="cv-mota" value={gt.moTa} onChange={(e) => datGt({ ...gt, moTa: e.target.value })} rows={3} />
            </div>
            <div className="truong">
              <label htmlFor="cv-kiemtra">Kiểm tra trước khi xong</label>
              <textarea
                id="cv-kiemtra"
                value={gt.kiemTra}
                onChange={(e) => datGt({ ...gt, kiemTra: e.target.value })}
                rows={3}
                placeholder={"Mỗi dòng một mục, ví dụ:\nChụp ảnh hiện trường\nKhách ký biên bản nghiệm thu\n? Gửi hướng dẫn sử dụng (dấu ? = không bắt buộc)"}
              />
              <span className="goi-y">Mục bắt buộc chưa tích thì người làm không đánh dấu xong được. Để trống nếu không cần.</span>
              {loiCua(loi, "mucKiemTra") && <span className="loi-truong">{loiCua(loi, "mucKiemTra")}</span>}
            </div>
            {gt.nguoiPhuTrachId !== toiId && <p className="goi-y" style={{ margin: 0 }}>Người được giao nhận thông báo ngay; khi họ xong, bạn nhận thông báo kèm kết quả.</p>}
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
