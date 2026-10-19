"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import HopThoai from "@/components/ui/HopThoai";
import { loiCua, useGoiApi } from "@/components/ui/goi-api";
import { DANH_GIA_KET_QUA, NHAN_DANH_GIA_KET_QUA } from "@/modules/crm/hang-so";

interface VanDe {
  ma: string;
  thongBao: string;
}
interface KetQuaKiemTra {
  duocXong: boolean;
  loi: VanDe[];
  canhBao: VanDe[];
}

const GIAI_THICH_DANH_GIA: Record<string, string> = {
  dat: "Xong đúng mục tiêu, không cần làm gì thêm.",
  "mot-phan": "Làm được một phần, phần còn lại có lý do ghi trong kết quả.",
  "khong-dat": "Không đạt mục tiêu — ghi rõ vì sao để người giao xử lý.",
  "can-theo-doi": "Xong lần này nhưng phải làm tiếp — bắt buộc hẹn việc tiếp theo.",
};

const DO_DAI_TOI_THIEU = 10;

/**
 * Thao tác trên một công việc (0.17.0):
 *  - **Hoàn thành**: ghi kết quả + đánh giá, hẹn việc tiếp theo. Máy kiểm tra trực tiếp trong
 *    lúc gõ (gọi `/kiem-tra`) và **kiểm lại ở máy chủ** khi bấm — giao diện chỉ để báo sớm (CV-06).
 *  - **Giao lại**: đổi người làm; người mới và người cũ đều nhận thông báo (CV-08).
 *  - Bắt đầu làm, hủy, mở lại, sửa kết quả.
 */
export default function TacVuChiTietViec({
  id,
  tieuDe,
  trangThai,
  ketQua,
  danhGia,
  nguoiPhuTrachId,
  nguoiGiaoLai,
  kiemTraBanDau,
  moHoanThanh,
}: {
  id: string;
  tieuDe: string;
  trangThai: string;
  ketQua: string | null;
  danhGia: string | null;
  nguoiPhuTrachId: string;
  nguoiGiaoLai: { id: string; hoTen: string }[];
  kiemTraBanDau: KetQuaKiemTra;
  moHoanThanh: boolean;
}) {
  const router = useRouter();
  const hopKetQua = useRef<HTMLDialogElement | null>(null);
  const hopGiao = useRef<HTMLDialogElement | null>(null);
  const hopHuy = useRef<HTMLDialogElement | null>(null);
  const { goi, dangGui, loi, datLoi } = useGoiApi();

  const chuaXong = trangThai === "mo" || trangThai === "dang-lam";
  const [cheDo, datCheDo] = useState<"xong" | "sua">("xong");
  const [kq, datKq] = useState(ketQua ?? "");
  const [dg, datDg] = useState(danhGia ?? "");
  const [hen, datHen] = useState(false);
  const [tiepTieuDe, datTiepTieuDe] = useState("");
  const [tiepHan, datTiepHan] = useState("");
  const [kiem, datKiem] = useState<KetQuaKiemTra>(kiemTraBanDau);
  const [nguoiMoi, datNguoiMoi] = useState("");

  const henBatBuoc = dg === "can-theo-doi";
  const coHen = hen || henBatBuoc;

  function moHop(che: "xong" | "sua") {
    datLoi(null);
    datCheDo(che);
    datKq(ketQua ?? "");
    datDg(danhGia ?? "");
    datHen(false);
    datTiepTieuDe("");
    datTiepHan("");
    datKiem(kiemTraBanDau);
    hopKetQua.current?.showModal();
  }

  // Mở thẳng hộp hoàn thành khi đến từ danh sách (ô "xong") hoặc từ thông báo.
  useEffect(() => {
    if (!moHoanThanh) return;
    const t = setTimeout(() => {
      if (!hopKetQua.current?.open) moHop("xong");
    }, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moHoanThanh]);

  // Kiểm tra trực tiếp trong lúc gõ — chỉ ở chế độ hoàn thành, chờ người gõ dừng 400 ms.
  useEffect(() => {
    if (cheDo !== "xong") return;
    const t = setTimeout(async () => {
      const q = new URLSearchParams({ ketQua: kq, danhGia: dg, coViecTiepTheo: coHen && tiepTieuDe.trim().length >= 3 ? "1" : "0" });
      try {
        const r = await fetch(`/api/v1/cong-viec/${id}/kiem-tra?${q}`);
        if (r.ok) datKiem((await r.json()) as KetQuaKiemTra);
      } catch {
        // Mất mạng thì giữ kết quả kiểm tra cũ; máy chủ vẫn kiểm lại khi bấm.
      }
    }, 400);
    return () => clearTimeout(t);
  }, [cheDo, kq, dg, coHen, tiepTieuDe, id]);

  async function doiTrangThai(moi: string) {
    const r = await goi(`/api/v1/cong-viec/${id}`, "PATCH", { trangThai: moi });
    if (r) {
      hopHuy.current?.close();
      router.refresh();
    }
  }

  async function ghi(e: React.FormEvent) {
    e.preventDefault();
    if (cheDo === "sua") {
      const r = await goi(`/api/v1/cong-viec/${id}`, "PATCH", { ketQua: kq, danhGia: dg || null });
      if (!r) return;
      hopKetQua.current?.close();
      router.refresh();
      return;
    }
    const r = await goi<{ viecTiepTheo: { id: string } | null }>(`/api/v1/cong-viec/${id}`, "PATCH", {
      trangThai: "xong",
      ketQua: kq,
      danhGia: dg || null,
      viecTiepTheo: coHen ? { tieuDe: tiepTieuDe, han: tiepHan || null } : null,
    });
    if (!r) return;
    hopKetQua.current?.close();
    router.push(`/cong-viec/${id}?daXong=1${r.viecTiepTheo ? `&tiepTheo=${r.viecTiepTheo.id}` : ""}`);
    router.refresh();
  }

  async function giaoLai(e: React.FormEvent) {
    e.preventDefault();
    const r = await goi(`/api/v1/cong-viec/${id}`, "PATCH", { nguoiPhuTrachId: nguoiMoi });
    if (!r) return;
    hopGiao.current?.close();
    router.refresh();
  }

  // Lỗi máy chủ trả về khi bấm xong (422 chua-du-dieu-kien-xong) kèm danh sách vấn đề.
  const vanDeMayChu = loi?.ma === "chua-du-dieu-kien-xong" ? ((loi.chiTiet as KetQuaKiemTra | undefined)?.loi ?? []) : [];
  const nguoiKhac = nguoiGiaoLai.filter((n) => n.id !== nguoiPhuTrachId);
  const kqDu = kq.trim().length >= DO_DAI_TOI_THIEU;
  const choGhi = cheDo === "xong" ? kiem.duocXong && kqDu && !!dg && (!coHen || tiepTieuDe.trim().length >= 3) : kqDu && !!dg;

  return (
    <>
      {trangThai === "mo" && (
        <button type="button" className="nut" disabled={dangGui} onClick={() => doiTrangThai("dang-lam")}>
          Bắt đầu làm
        </button>
      )}
      {chuaXong && (
        <button type="button" className="nut chinh" onClick={() => moHop("xong")}>
          Hoàn thành
        </button>
      )}
      {chuaXong && nguoiKhac.length > 0 && (
        <button
          type="button"
          className="nut"
          onClick={() => {
            datLoi(null);
            datNguoiMoi(nguoiKhac[0].id);
            hopGiao.current?.showModal();
          }}
        >
          Giao lại
        </button>
      )}
      {trangThai === "xong" && (
        <button type="button" className="nut" onClick={() => moHop("sua")}>
          {ketQua ? "Sửa kết quả" : "Ghi kết quả"}
        </button>
      )}
      {!chuaXong && (
        <button type="button" className="nut trong" disabled={dangGui} onClick={() => doiTrangThai("mo")}>
          Mở lại
        </button>
      )}
      {chuaXong && (
        <button
          type="button"
          className="nut trong"
          onClick={() => {
            datLoi(null);
            hopHuy.current?.showModal();
          }}
        >
          Hủy việc
        </button>
      )}
      {!chuaXong && loi && <span className="loi-truong">{loi.thongBao}</span>}

      <HopThoai ref={hopKetQua} tieuDe={cheDo === "xong" ? `Hoàn thành — ${tieuDe}` : `Kết quả — ${tieuDe}`} rong={640}>
        <form onSubmit={ghi} noValidate>
          <div className="than">
            {loi && (
              <div className="hop-thong-bao loi" role="alert">
                {vanDeMayChu.length ? (
                  <>
                    Máy chủ chưa cho đánh dấu xong:
                    <ul className="ds-van-de">
                      {vanDeMayChu.map((v) => (
                        <li key={v.ma}>{v.thongBao}</li>
                      ))}
                    </ul>
                  </>
                ) : (
                  loi.thongBao
                )}
              </div>
            )}

            <div className="truong">
              <label htmlFor="cv-ketqua">
                Kết quả công việc <span className="bat-buoc">*</span>
              </label>
              <textarea
                id="cv-ketqua"
                rows={5}
                value={kq}
                onChange={(e) => datKq(e.target.value)}
                placeholder="Đã làm gì, khách nói gì, số liệu/cam kết cụ thể, bước tiếp theo. Ví dụ: Đã khảo sát 8 điểm camera, khách đồng ý phương án NVR 16 kênh, chờ duyệt báo giá trước 25/10."
                autoFocus
              />
              <span className="goi-y">
                {kq.trim().length}/{DO_DAI_TOI_THIEU} ký tự tối thiểu · Kết quả hiện trên dòng thời gian của khách hàng.
              </span>
              {loiCua(loi, "ketQua") && <span className="loi-truong">{loiCua(loi, "ketQua")}</span>}
            </div>

            <fieldset className="truong" style={{ border: 0, padding: 0, margin: 0 }}>
              <legend style={{ fontWeight: 600, marginBottom: 6 }}>
                Đánh giá <span className="bat-buoc">*</span>
              </legend>
              <div className="chon-danh-gia">
                {DANH_GIA_KET_QUA.map((d) => (
                  <label key={d}>
                    <input type="radio" name="danhGia" value={d} checked={dg === d} onChange={() => datDg(d)} />
                    <span>
                      {NHAN_DANH_GIA_KET_QUA[d]}
                      <span className="goi-y" style={{ display: "block", fontWeight: 400 }}>
                        {GIAI_THICH_DANH_GIA[d]}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
              {loiCua(loi, "danhGia") && <span className="loi-truong">{loiCua(loi, "danhGia")}</span>}
            </fieldset>

            {cheDo === "xong" && (
              <>
                <div className="truong" style={{ marginTop: 12 }}>
                  <label style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 600 }}>
                    <input type="checkbox" checked={coHen} disabled={henBatBuoc} onChange={(e) => datHen(e.target.checked)} />
                    Hẹn việc tiếp theo {henBatBuoc && <span className="bat-buoc">* (bắt buộc với “Cần làm tiếp”)</span>}
                  </label>
                  <span className="goi-y">Việc mới giao cho cùng người làm, gắn cùng khách / lead / cơ hội, mang theo kết quả lần này.</span>
                </div>
                {coHen && (
                  <div className="luoi-form">
                    <div className="truong">
                      <label htmlFor="cv-tiep-tieude">Việc tiếp theo</label>
                      <input
                        id="cv-tiep-tieude"
                        type="text"
                        value={tiepTieuDe}
                        onChange={(e) => datTiepTieuDe(e.target.value)}
                        placeholder="Ví dụ: Gọi lại chốt báo giá"
                      />
                    </div>
                    <div className="truong">
                      <label htmlFor="cv-tiep-han">Hạn</label>
                      <input id="cv-tiep-han" type="datetime-local" value={tiepHan} onChange={(e) => datTiepHan(e.target.value)} />
                    </div>
                  </div>
                )}

                <div
                  className={`hop-thong-bao ${kiem.loi.length ? "canh-bao" : "tot"}`}
                  role="status"
                  aria-live="polite"
                  style={{ marginTop: 12, marginBottom: 0 }}
                >
                  <strong>Kiểm tra trước khi xong:</strong>{" "}
                  {kiem.loi.length === 0 ? "Đủ điều kiện." : `Còn ${kiem.loi.length} việc cần xử lý.`}
                  {(kiem.loi.length > 0 || kiem.canhBao.length > 0) && (
                    <ul className="ds-van-de">
                      {kiem.loi.map((v) => (
                        <li key={v.ma}>{v.thongBao}</li>
                      ))}
                      {kiem.canhBao.map((v) => (
                        <li key={v.ma} className="phu">
                          Nhắc: {v.thongBao}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </>
            )}
          </div>
          <div className="chan-form">
            <button type="button" className="nut" onClick={() => hopKetQua.current?.close()} disabled={dangGui}>
              Để sau
            </button>
            <button type="submit" className="nut chinh" disabled={dangGui || !choGhi}>
              {dangGui ? "Đang ghi…" : cheDo === "xong" ? "Ghi kết quả và hoàn thành" : "Lưu kết quả"}
            </button>
          </div>
        </form>
      </HopThoai>

      <HopThoai ref={hopGiao} tieuDe={`Giao lại — ${tieuDe}`} rong={480}>
        <form onSubmit={giaoLai}>
          <div className="than">
            {loi && (
              <div className="hop-thong-bao loi" role="alert">
                {loi.thongBao}
              </div>
            )}
            <div className="truong">
              <label htmlFor="cv-giao-lai">Giao cho</label>
              <select id="cv-giao-lai" value={nguoiMoi} onChange={(e) => datNguoiMoi(e.target.value)}>
                {nguoiKhac.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.hoTen}
                  </option>
                ))}
              </select>
              <span className="goi-y">Người nhận được thông báo “Được chuyển việc”; người đang làm được báo không cần làm tiếp.</span>
            </div>
          </div>
          <div className="chan-form">
            <button type="button" className="nut" onClick={() => hopGiao.current?.close()} disabled={dangGui}>
              Hủy
            </button>
            <button type="submit" className="nut chinh" disabled={dangGui || !nguoiMoi}>
              {dangGui ? "Đang giao…" : "Giao lại"}
            </button>
          </div>
        </form>
      </HopThoai>

      <HopThoai ref={hopHuy} tieuDe={`Hủy việc — ${tieuDe}`} rong={440}>
        <div className="than">
          {loi && (
            <div className="hop-thong-bao loi" role="alert">
              {loi.thongBao}
            </div>
          )}
          <p style={{ marginTop: 0 }}>Hủy khi việc không còn cần làm nữa. Việc đã hủy vẫn mở lại được.</p>
        </div>
        <div className="chan-form">
          <button type="button" className="nut" onClick={() => hopHuy.current?.close()} disabled={dangGui}>
            Giữ lại
          </button>
          <button type="button" className="nut nguy-hiem" onClick={() => doiTrangThai("huy")} disabled={dangGui}>
            Hủy việc
          </button>
        </div>
      </HopThoai>
    </>
  );
}
