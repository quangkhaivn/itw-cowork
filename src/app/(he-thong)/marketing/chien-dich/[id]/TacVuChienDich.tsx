"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import HopThoai from "@/components/ui/HopThoai";
import ONhapTien from "@/components/crm/ONhapTien";
import { loiCua, useGoiApi } from "@/components/ui/goi-api";
import { LOAI_CHI_PHI, NHAN_LOAI_CHI_PHI, NHAN_TRANG_THAI_CHIEN_DICH } from "@/modules/marketing/hang-so";

const NHAN_NUT: Record<string, string> = {
  "cho-duyet": "Gửi duyệt ngân sách",
  "dang-chay": "Bắt đầu chạy",
  "tam-dung": "Tạm dừng",
  "ket-thuc": "Kết thúc",
  "ke-hoach": "Rút lại đề nghị duyệt",
  huy: "Hủy chiến dịch",
};

function homNay() {
  return new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
}

/** Thao tác trên chiến dịch: đổi trạng thái, duyệt ngân sách (MK-03), ghi / hủy chi phí (MK-04). */
export default function TacVuChienDich({
  id,
  buocKeTiep,
  duocDuyet,
  ghiChiPhi,
}: {
  id: string;
  buocKeTiep: string[];
  duocDuyet: boolean;
  ghiChiPhi: boolean;
}) {
  const router = useRouter();
  const tt = useGoiApi();
  const cp = useGoiApi();
  const dy = useGoiApi();
  const hopHuy = useRef<HTMLDialogElement>(null);
  const hopChi = useRef<HTMLDialogElement>(null);
  const hopDuyet = useRef<HTMLDialogElement>(null);
  const [lyDo, datLyDo] = useState("");
  const [chi, datChi] = useState({ ngay: homNay(), soTien: "", loai: "quang-cao", ghiChu: "" });
  const [ghiChuDuyet, datGhiChuDuyet] = useState("");
  const [canhBao, datCanhBao] = useState<string | null>(null);

  async function doi(den: string, lyDoHuy?: string) {
    const kq = await tt.goi(`/api/v1/marketing/chien-dich/${id}/trang-thai`, "POST", { trangThai: den, lyDo: lyDoHuy ?? null });
    if (kq) {
      hopHuy.current?.close();
      router.refresh();
    }
  }

  async function luuChi(e: React.FormEvent) {
    e.preventDefault();
    const kq = await cp.goi<{ vuotNganSach: number }>(`/api/v1/marketing/chien-dich/${id}/chi-phi`, "POST", chi);
    if (kq) {
      datCanhBao(kq.vuotNganSach > 0 ? `Đã chi vượt ngân sách ${kq.vuotNganSach.toLocaleString("vi-VN")} ₫ — báo người duyệt.` : null);
      hopChi.current?.close();
      datChi({ ngay: homNay(), soTien: "", loai: "quang-cao", ghiChu: "" });
      router.refresh();
    }
  }

  async function duyet(dongY: boolean) {
    const kq = await dy.goi(`/api/v1/marketing/chien-dich/${id}/duyet`, "POST", { dongY, ghiChu: ghiChuDuyet || null });
    if (kq) {
      hopDuyet.current?.close();
      router.refresh();
    }
  }

  return (
    <>
      {tt.loi && <div className="hop-thong-bao loi" role="alert">{tt.loi.thongBao}</div>}
      {canhBao && <div className="hop-thong-bao canh-bao" role="status">{canhBao}</div>}
      <div className="hanh-dong" style={{ marginBottom: 16 }}>
        {duocDuyet && (
          <button type="button" className="nut chinh" onClick={() => hopDuyet.current?.showModal()}>
            Duyệt ngân sách…
          </button>
        )}
        {buocKeTiep
          .filter((b) => b !== "huy")
          .map((b) => (
            <button key={b} type="button" className={`nut ${b === "dang-chay" ? "chinh" : ""}`} disabled={tt.dangGui} onClick={() => doi(b)}>
              {NHAN_NUT[b] ?? NHAN_TRANG_THAI_CHIEN_DICH[b]}
            </button>
          ))}
        {ghiChiPhi && (
          <button type="button" className="nut" onClick={() => hopChi.current?.showModal()}>
            Ghi chi phí…
          </button>
        )}
        {buocKeTiep.includes("huy") && (
          <button type="button" className="nut nguy-hiem" onClick={() => hopHuy.current?.showModal()}>
            Hủy chiến dịch…
          </button>
        )}
      </div>

      <HopThoai ref={hopHuy} tieuDe="Hủy chiến dịch">
        <div className="than">
          <div className="truong">
            <label htmlFor="ly-do-huy">Lý do hủy</label>
            <textarea id="ly-do-huy" rows={3} value={lyDo} onChange={(e) => datLyDo(e.target.value)} />
          </div>
        </div>
        <div className="chan-form">
          <button type="button" className="nut nguy-hiem" disabled={lyDo.trim().length < 3 || tt.dangGui} onClick={() => doi("huy", lyDo)}>
            Hủy chiến dịch
          </button>
        </div>
      </HopThoai>

      <HopThoai ref={hopChi} tieuDe="Ghi chi phí thực tế">
        <form onSubmit={luuChi}>
          <div className="than">
            {cp.loi && <div className="hop-thong-bao loi" role="alert">{cp.loi.thongBao}</div>}
            <div className="luoi-form">
              <div className="truong">
                <label htmlFor="cp-ngay">Ngày chi</label>
                <input id="cp-ngay" type="date" value={chi.ngay} onChange={(e) => datChi((c) => ({ ...c, ngay: e.target.value }))} />
              </div>
              <div className="truong">
                <label htmlFor="cp-tien">Số tiền</label>
                <ONhapTien id="cp-tien" giaTri={chi.soTien} datGiaTri={(v) => datChi((c) => ({ ...c, soTien: v }))} />
                {loiCua(cp.loi, "soTien") && <span className="loi-truong">{loiCua(cp.loi, "soTien")}</span>}
              </div>
              <div className="truong">
                <label htmlFor="cp-loai">Khoản</label>
                <select id="cp-loai" value={chi.loai} onChange={(e) => datChi((c) => ({ ...c, loai: e.target.value }))}>
                  {LOAI_CHI_PHI.map((l) => (
                    <option key={l} value={l}>
                      {NHAN_LOAI_CHI_PHI[l]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="truong ca-dong">
                <label htmlFor="cp-gc">Ghi chú</label>
                <input id="cp-gc" type="text" value={chi.ghiChu} onChange={(e) => datChi((c) => ({ ...c, ghiChu: e.target.value }))} placeholder="vd: nạp tiền tài khoản quảng cáo" />
              </div>
            </div>
          </div>
          <div className="chan-form">
            <button type="submit" className="nut chinh" disabled={cp.dangGui || !chi.soTien}>
              Ghi chi phí
            </button>
          </div>
        </form>
      </HopThoai>

      <HopThoai ref={hopDuyet} tieuDe="Duyệt ngân sách chiến dịch">
        <div className="than">
          {dy.loi && <div className="hop-thong-bao loi" role="alert">{dy.loi.thongBao}</div>}
          <div className="truong">
            <label htmlFor="gc-duyet">Ghi chú (bắt buộc khi từ chối)</label>
            <textarea id="gc-duyet" rows={3} value={ghiChuDuyet} onChange={(e) => datGhiChuDuyet(e.target.value)} />
          </div>
        </div>
        <div className="chan-form">
          <button type="button" className="nut nguy-hiem" disabled={dy.dangGui || ghiChuDuyet.trim().length < 3} onClick={() => duyet(false)}>
            Từ chối
          </button>
          <button type="button" className="nut chinh" disabled={dy.dangGui} onClick={() => duyet(true)}>
            Duyệt
          </button>
        </div>
      </HopThoai>
    </>
  );
}

/** Nút hủy một khoản chi (không xóa — MK-04). */
export function NutHuyChiPhi({ id }: { id: string }) {
  const router = useRouter();
  const { goi, dangGui, loi } = useGoiApi();
  const hop = useRef<HTMLDialogElement>(null);
  const [lyDo, datLyDo] = useState("");
  return (
    <>
      <button type="button" className="nut nho trong" onClick={() => hop.current?.showModal()}>
        Hủy
      </button>
      <HopThoai ref={hop} tieuDe="Hủy khoản chi">
        <div className="than">
          {loi && <div className="hop-thong-bao loi" role="alert">{loi.thongBao}</div>}
          <div className="truong">
            <label htmlFor={`huy-cp-${id}`}>Lý do</label>
            <input id={`huy-cp-${id}`} type="text" value={lyDo} onChange={(e) => datLyDo(e.target.value)} />
          </div>
        </div>
        <div className="chan-form">
          <button
            type="button"
            className="nut nguy-hiem"
            disabled={dangGui || lyDo.trim().length < 3}
            onClick={async () => {
              if (await goi(`/api/v1/marketing/chi-phi/${id}/huy`, "POST", { lyDo })) {
                hop.current?.close();
                router.refresh();
              }
            }}
          >
            Hủy khoản chi
          </button>
        </div>
      </HopThoai>
    </>
  );
}
