"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import HopThoai from "@/components/ui/HopThoai";
import { useGoiApi } from "@/components/ui/goi-api";
import { dinhDangNgay, dinhDangNhapTien, dinhDangTien } from "@/lib/dinh-dang";

interface HoaDonConNo {
  id: string;
  so: string;
  conNo: number;
  hanThanhToan: string | null;
  soNgayQuaHan: number;
}

/**
 * Ba việc của một phiếu khách trả hàng: **xác nhận** (hàng về kho, thủ kho làm),
 * **chốt tiền** (giảm trừ công nợ, kế toán làm), **hủy** (chỉ khi còn nháp).
 *
 * Hai việc đầu cố ý tách rời: ở cửa hàng, người nhận hàng và người chốt tiền là hai
 * người khác nhau, và hàng về kho không có nghĩa là đã thỏa thuận xong số tiền.
 */
export default function TacVuTraHangBan({
  id,
  so,
  khachHangId,
  tongCong,
  duocXacNhan,
  duocChotTien,
  duocHuy,
}: {
  id: string;
  so: string;
  khachHangId: string;
  tongCong: number;
  duocXacNhan: boolean;
  duocChotTien: boolean;
  duocHuy: boolean;
}) {
  const router = useRouter();
  const hopXacNhan = useRef<HTMLDialogElement | null>(null);
  const hopChot = useRef<HTMLDialogElement | null>(null);
  const hopHuy = useRef<HTMLDialogElement | null>(null);
  const { goi, dangGui, loi, datLoi } = useGoiApi();

  const [ghiChu, datGhiChu] = useState("");
  const [lyDo, datLyDo] = useState("");
  const [moChot, datMoChot] = useState(false);
  const [dsConNo, datDsConNo] = useState<HoaDonConNo[]>([]);
  const [phanBo, datPhanBo] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!moChot) return;
    const huy = new AbortController();
    fetch(`/api/v1/cong-no/${khachHangId}`, { signal: huy.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: HoaDonConNo[] | null) => {
        if (!d) return;
        datDsConNo(d);
        // Điền sẵn hóa đơn cũ nhất cho tới khi hết giá trị phiếu — kế toán sửa lại được.
        let con = tongCong;
        const dien: Record<string, string> = {};
        for (const h of d) {
          const lay = Math.min(con, h.conNo);
          dien[h.id] = lay > 0 ? dinhDangNhapTien(String(lay)) : "";
          con -= lay;
        }
        datPhanBo(dien);
      })
      .catch(() => {});
    return () => huy.abort();
  }, [moChot, khachHangId, tongCong]);

  const soThuan = (s: string) => Number(s.replace(/\./g, "") || 0);
  const tongPhanBo = Object.values(phanBo).reduce((s, v) => s + soThuan(v), 0);

  async function xacNhan() {
    const kq = await goi(`/api/v1/tra-hang-ban/${id}/xac-nhan`, "POST", { ghiChu });
    if (!kq) return;
    hopXacNhan.current?.close();
    router.refresh();
  }

  async function chot() {
    const ds = Object.entries(phanBo)
      .filter(([, v]) => soThuan(v) > 0)
      .map(([hoaDonId, v]) => ({ hoaDonId, soTien: String(soThuan(v)) }));
    const kq = await goi(`/api/v1/tra-hang-ban/${id}/chot-giam-tru`, "POST", { ghiChu, phanBo: ds });
    if (!kq) return;
    hopChot.current?.close();
    datMoChot(false);
    router.refresh();
  }

  async function huy() {
    const kq = await goi(`/api/v1/tra-hang-ban/${id}/huy`, "POST", { lyDo });
    if (!kq) return;
    hopHuy.current?.close();
    router.refresh();
  }

  return (
    <>
      {duocXacNhan && (
        <button
          type="button"
          className="nut chinh"
          onClick={() => {
            datLoi(null);
            datGhiChu("");
            hopXacNhan.current?.showModal();
          }}
        >
          Xác nhận nhận lại hàng
        </button>
      )}
      {duocChotTien && (
        <button
          type="button"
          className="nut chinh"
          onClick={() => {
            datLoi(null);
            datGhiChu("");
            datMoChot(true);
            hopChot.current?.showModal();
          }}
        >
          Chốt tiền — giảm trừ công nợ
        </button>
      )}
      {duocHuy && (
        <button
          type="button"
          className="nut trong"
          onClick={() => {
            datLoi(null);
            datLyDo("");
            hopHuy.current?.showModal();
          }}
        >
          Hủy phiếu
        </button>
      )}

      <HopThoai ref={hopXacNhan} tieuDe={`Xác nhận nhận lại hàng — ${so}`} rong={560}>
        <div className="than">
          {loi && (
            <div className="hop-thong-bao loi" role="alert">
              {loi.thongBao}
            </div>
          )}
          <p className="goi-y" style={{ marginTop: 0 }}>
            Bấm xác nhận là hàng <strong>thật sự</strong> đi qua kho: hàng còn dùng được cộng lại vào tồn, máy đổi được xuất ra, số
            sê-ri đổi trạng thái. Xác nhận rồi thì không sửa và không hủy phiếu được nữa.
          </p>
          <div className="truong">
            <label htmlFor="th-xn-ghichu">Ghi chú khi nhận hàng</label>
            <input
              id="th-xn-ghichu"
              type="text"
              value={ghiChu}
              onChange={(e) => datGhiChu(e.target.value)}
              placeholder="Ví dụ: đã kiểm đủ phụ kiện, thùng xước nhẹ"
            />
          </div>
        </div>
        <div className="chan-form">
          <button type="button" className="nut" onClick={() => hopXacNhan.current?.close()} disabled={dangGui}>
            Để sau
          </button>
          <button type="button" className="nut chinh" onClick={xacNhan} disabled={dangGui}>
            {dangGui ? "Đang ghi…" : "Xác nhận nhận lại hàng"}
          </button>
        </div>
      </HopThoai>

      <HopThoai ref={hopChot} tieuDe={`Giảm trừ công nợ — ${so}`} rong={760}>
        <div className="than">
          {loi && (
            <div className="hop-thong-bao loi" role="alert">
              {loi.thongBao}
            </div>
          )}
          <p className="goi-y" style={{ marginTop: 0 }}>
            Giá trị phiếu <strong>{dinhDangTien(tongCong)}</strong>. Chọn hóa đơn nào của khách được trừ nợ bằng số hàng
            này. Tiền <strong>không</strong> đi qua quỹ — đây là nợ được xóa bằng hàng, nên phiếu thu vẫn giữ nguyên.
          </p>

          {dsConNo.length === 0 ? (
            <div className="hop-thong-bao canh-bao" role="status">
              Khách này không còn hóa đơn nào đang nợ. Phần giá trị hàng trả phải hoàn tiền mặt — việc đó hệ thống chưa
              làm, xử lý ngoài rồi ghi chú lại.
            </div>
          ) : (
            <div className="cuon-ngang">
              <table className="bang">
                <thead>
                  <tr>
                    <th>Hóa đơn</th>
                    <th className="an-tren-dt">Hạn</th>
                    <th className="so">Còn nợ</th>
                    <th className="so" style={{ width: 160 }}>
                      Giảm trừ
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {dsConNo.map((h) => (
                    <tr key={h.id}>
                      <td>
                        <strong>{h.so}</strong>
                      </td>
                      <td className="an-tren-dt nho">
                        {h.hanThanhToan ? dinhDangNgay(h.hanThanhToan) : "—"}
                        {h.soNgayQuaHan > 0 && <div className="dong-phu chu-loi">quá hạn {h.soNgayQuaHan} ngày</div>}
                      </td>
                      <td className="so">{dinhDangTien(h.conNo)}</td>
                      <td>
                        <input
                          type="text"
                          inputMode="numeric"
                          aria-label={`Giảm trừ vào hóa đơn ${h.so}`}
                          value={phanBo[h.id] ?? ""}
                          onChange={(e) => datPhanBo((c) => ({ ...c, [h.id]: dinhDangNhapTien(e.target.value) }))}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className={`hop-thong-bao ${tongPhanBo === tongCong ? "tot" : "canh-bao"}`} role="status">
            Tổng giảm trừ <strong>{dinhDangTien(tongPhanBo)}</strong> / giá trị phiếu {dinhDangTien(tongCong)}
            {tongPhanBo > tongCong && " — vượt giá trị phiếu, sửa lại trước khi chốt."}
            {tongPhanBo < tongCong && tongPhanBo > 0 && " — phần còn lại vẫn treo trên phiếu."}
          </div>

          <div className="truong">
            <label htmlFor="th-chot-ghichu">Ghi chú</label>
            <input id="th-chot-ghichu" type="text" value={ghiChu} onChange={(e) => datGhiChu(e.target.value)} />
          </div>
        </div>
        <div className="chan-form">
          <button
            type="button"
            className="nut"
            onClick={() => {
              hopChot.current?.close();
              datMoChot(false);
            }}
            disabled={dangGui}
          >
            Để sau
          </button>
          <button type="button" className="nut chinh" onClick={chot} disabled={dangGui || tongPhanBo <= 0 || tongPhanBo > tongCong}>
            {dangGui ? "Đang ghi…" : "Chốt giảm trừ"}
          </button>
        </div>
      </HopThoai>

      <HopThoai ref={hopHuy} tieuDe={`Hủy phiếu ${so}`} rong={480}>
        <div className="than">
          {loi && (
            <div className="hop-thong-bao loi" role="alert">
              {loi.thongBao}
            </div>
          )}
          <div className="truong">
            <label htmlFor="th-huy-lydo">
              Lý do hủy <span className="bat-buoc">*</span>
            </label>
            <input
              id="th-huy-lydo"
              type="text"
              value={lyDo}
              onChange={(e) => datLyDo(e.target.value)}
              placeholder="Ví dụ: khách đổi ý, không trả nữa"
            />
          </div>
        </div>
        <div className="chan-form">
          <button type="button" className="nut" onClick={() => hopHuy.current?.close()} disabled={dangGui}>
            Hủy bỏ
          </button>
          <button type="button" className="nut nguy-hiem" onClick={huy} disabled={dangGui || lyDo.trim().length < 2}>
            {dangGui ? "Đang lưu…" : "Hủy phiếu"}
          </button>
        </div>
      </HopThoai>
    </>
  );
}
