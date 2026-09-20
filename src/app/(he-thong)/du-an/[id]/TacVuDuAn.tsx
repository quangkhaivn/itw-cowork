"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import HopThoai from "@/components/ui/HopThoai";
import { useGoiApi } from "@/components/ui/goi-api";
import { NHAN_TRANG_THAI_HANG_MUC, TRANG_THAI_HANG_MUC } from "@/modules/du-an/tinh-toan";
import { dinhDangNgay } from "@/lib/dinh-dang";

export interface HangMuc {
  id: string;
  ten: string;
  trangThai: string;
  hanHoanThanh: string | Date | null;
  xongLuc: string | Date | null;
  ghiChu: string | null;
}

/**
 * Hạng mục và các mốc của dự án: thêm, đánh dấu xong, bỏ hạng mục chưa làm.
 * Dự án đã nghiệm thu hoặc đã hủy thì khóa hết (DU-05, DU-06).
 */
export default function TacVuDuAn({
  duAnId,
  hangMuc,
  quyen,
  tienDo,
}: {
  duAnId: string;
  hangMuc: HangMuc[];
  quyen: { sua: boolean; hangMuc: boolean; doiTrangThai: boolean; nghiemThu: boolean };
  tienDo: { tong: number; xong: number; phanTram: number; conDangDo: boolean };
}) {
  const router = useRouter();
  const hop = useRef<HTMLDialogElement | null>(null);
  const { goi, dangGui, loi, datLoi } = useGoiApi();
  const [viec, datViec] = useState<"them" | "nghiem-thu" | "tam-dung" | "chay-lai" | "huy">("them");
  const [ten, datTen] = useState("");
  const [han, datHan] = useState("");
  const [ghiChu, datGhiChu] = useState("");

  const mo = (v: typeof viec) => {
    datViec(v);
    datLoi(null);
    datTen("");
    datHan("");
    datGhiChu("");
    hop.current?.showModal();
  };

  async function doiTrangThai(hm: HangMuc, trangThai: string) {
    const kq = await goi(`/api/v1/du-an/${duAnId}/hang-muc/${hm.id}`, "PATCH", { trangThai });
    if (kq) router.refresh();
  }

  async function xoa(hm: HangMuc) {
    const kq = await goi(`/api/v1/du-an/${duAnId}/hang-muc/${hm.id}`, "DELETE");
    if (kq) router.refresh();
  }

  async function chay() {
    const kq =
      viec === "them"
        ? await goi(`/api/v1/du-an/${duAnId}/hang-muc`, "POST", { ten, hanHoanThanh: han, ghiChu })
        : await goi(`/api/v1/du-an/${duAnId}/trang-thai`, "POST", {
            trangThai: viec === "nghiem-thu" ? "ACCEPTED" : viec === "tam-dung" ? "ON_HOLD" : viec === "chay-lai" ? "IN_PROGRESS" : "CANCELLED",
            ghiChu,
          });
    if (!kq) return;
    hop.current?.close();
    router.refresh();
  }

  const tieuDe =
    viec === "them" ? "Thêm hạng mục"
    : viec === "nghiem-thu" ? "Nghiệm thu dự án"
    : viec === "tam-dung" ? "Tạm dừng dự án"
    : viec === "chay-lai" ? "Chạy tiếp dự án"
    : "Hủy dự án";
  const thieu = (viec === "them" && ten.trim().length < 2) || (viec === "huy" && ghiChu.trim().length < 2);

  return (
    <>
      <section className="the">
        <div className="dau">
          <h2>Hạng mục ({tienDo.xong}/{tienDo.tong})</h2>
          {quyen.hangMuc && (
            <button type="button" className="nut nho chinh" onClick={() => mo("them")}>
              Thêm hạng mục
            </button>
          )}
        </div>

        {hangMuc.length === 0 ? (
          <div className="than">
            <p className="goi-y" style={{ margin: 0 }}>
              Chưa có hạng mục nào. Dự án cần ít nhất một hạng mục mới nghiệm thu được.
            </p>
          </div>
        ) : (
          <table className="bang">
            <thead>
              <tr>
                <th>Hạng mục</th>
                <th>Trạng thái</th>
                <th className="an-tren-dt">Hạn</th>
                {quyen.hangMuc && <th />}
              </tr>
            </thead>
            <tbody>
              {hangMuc.map((h) => (
                <tr key={h.id}>
                  <td>
                    {h.ten}
                    {h.ghiChu && <div className="dong-phu">{h.ghiChu}</div>}
                  </td>
                  <td>
                    {quyen.hangMuc ? (
                      <select
                        aria-label={`Trạng thái ${h.ten}`}
                        value={h.trangThai}
                        onChange={(e) => doiTrangThai(h, e.target.value)}
                        disabled={dangGui}
                      >
                        {TRANG_THAI_HANG_MUC.map((t) => (
                          <option key={t} value={t}>
                            {NHAN_TRANG_THAI_HANG_MUC[t]}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className={`huy-hieu ${h.trangThai === "xong" ? "tot" : h.trangThai === "dang-lam" ? "chinh" : ""}`}>
                        {NHAN_TRANG_THAI_HANG_MUC[h.trangThai] ?? h.trangThai}
                      </span>
                    )}
                  </td>
                  <td className="an-tren-dt so nho">{h.hanHoanThanh ? dinhDangNgay(h.hanHoanThanh) : "—"}</td>
                  {quyen.hangMuc && (
                    <td>
                      {h.trangThai !== "xong" && (
                        <button type="button" className="nut trong nho" onClick={() => xoa(h)} disabled={dangGui}>
                          Bỏ
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {loi && (
          <div className="hop-thong-bao loi" role="alert" style={{ margin: 16 }}>
            {loi.thongBao}
          </div>
        )}

        {(quyen.doiTrangThai || quyen.nghiemThu) && (
          <div className="chan-form">
            {quyen.nghiemThu && (
              <button type="button" className="nut chinh" onClick={() => mo("nghiem-thu")}>
                Nghiệm thu
              </button>
            )}
            {quyen.doiTrangThai && (
              <>
                <button type="button" className="nut" onClick={() => mo("tam-dung")}>
                  Tạm dừng
                </button>
                <button type="button" className="nut" onClick={() => mo("chay-lai")}>
                  Chạy tiếp
                </button>
                <button type="button" className="nut nguy-hiem" onClick={() => mo("huy")}>
                  Hủy dự án
                </button>
              </>
            )}
          </div>
        )}
        {quyen.doiTrangThai && !quyen.nghiemThu && tienDo.conDangDo && (
          <p className="goi-y" style={{ padding: "0 16px 14px" }}>
            Còn {tienDo.tong - tienDo.xong} hạng mục chưa xong — nghiệm thu mở ra khi mọi hạng mục đã xong.
          </p>
        )}
      </section>

      <HopThoai ref={hop} tieuDe={tieuDe} rong={520}>
        <div className="than">
          {loi && (
            <div className="hop-thong-bao loi" role="alert">
              {loi.thongBao}
            </div>
          )}

          {viec === "them" ? (
            <div className="luoi-form">
              <div className="truong ca-dong">
                <label htmlFor="hm-ten">
                  Tên hạng mục <span className="bat-buoc">*</span>
                </label>
                <input id="hm-ten" type="text" value={ten} onChange={(e) => datTen(e.target.value)} placeholder="Ví dụ: kéo dây mạng tầng 2" />
              </div>
              <div className="truong">
                <label htmlFor="hm-han">Hạn hoàn thành</label>
                <input id="hm-han" type="date" value={han} onChange={(e) => datHan(e.target.value)} />
              </div>
              <div className="truong ca-dong">
                <label htmlFor="hm-ghichu">Ghi chú</label>
                <input id="hm-ghichu" type="text" value={ghiChu} onChange={(e) => datGhiChu(e.target.value)} />
              </div>
            </div>
          ) : (
            <div className="truong">
              <label htmlFor="da-ghichu">
                {viec === "nghiem-thu" ? "Ghi chú nghiệm thu" : viec === "huy" ? "Lý do hủy" : "Ghi chú"}
                {viec === "huy" && <span className="bat-buoc"> *</span>}
              </label>
              <textarea
                id="da-ghichu"
                rows={3}
                value={ghiChu}
                onChange={(e) => datGhiChu(e.target.value)}
                placeholder={viec === "nghiem-thu" ? "Khách ký biên bản ngày nào, ai ký" : viec === "huy" ? "Vì sao dừng dự án" : "Không bắt buộc"}
              />
              {viec === "nghiem-thu" && <span className="goi-y">Nghiệm thu xong, dự án được khóa — không sửa hạng mục nữa.</span>}
            </div>
          )}
        </div>
        <div className="chan-form">
          <button type="button" className="nut" onClick={() => hop.current?.close()} disabled={dangGui}>
            Hủy bỏ
          </button>
          <button type="button" className={`nut ${viec === "huy" ? "nguy-hiem" : "chinh"}`} onClick={chay} disabled={dangGui || thieu}>
            {dangGui ? "Đang lưu…" : "Xác nhận"}
          </button>
        </div>
      </HopThoai>
    </>
  );
}
