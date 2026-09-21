"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import HopThoai from "@/components/ui/HopThoai";
import { useGoiApi } from "@/components/ui/goi-api";
import { dinhDangNgay, dinhDangNhapTien, dinhDangTien } from "@/lib/dinh-dang";
import { NHAN_PHUONG_THUC_THU, PHUONG_THUC_THU } from "@/modules/tai-chinh/tinh-toan";

interface HoaDonConNo {
  id: string;
  so: string;
  soHoaDonNcc: string | null;
  conNo: number;
  hanThanhToan: string | null;
  soNgayQuaHan: number;
}

/**
 * Ba việc của một hóa đơn nhà cung cấp: **ghi nhận** (chốt số và hạn), **chi tiền**,
 * **hủy**.
 *
 * Hộp chi tiền mở ra là đã tải sẵn mọi hóa đơn còn nợ của nhà cung cấp đó — trả tiền
 * thường gộp nhiều hóa đơn một lần, nên không bắt người dùng mở từng cái.
 */
export default function TacVuHoaDonMua({
  id,
  so,
  nhaCungCapId,
  duocGhiNhan,
  duocChi,
  duocHuy,
  homNay,
}: {
  id: string;
  so: string;
  nhaCungCapId: string;
  duocGhiNhan: boolean;
  duocChi: boolean;
  duocHuy: boolean;
  homNay: string;
}) {
  const router = useRouter();
  const hopGhi = useRef<HTMLDialogElement | null>(null);
  const hopChi = useRef<HTMLDialogElement | null>(null);
  const hopHuy = useRef<HTMLDialogElement | null>(null);
  const { goi, dangGui, loi, datLoi } = useGoiApi();

  const [ngayHoaDon, datNgayHoaDon] = useState(homNay);
  const [hanThanhToan, datHanThanhToan] = useState("");
  const [soHoaDonNcc, datSoHoaDonNcc] = useState("");

  const [moChi, datMoChi] = useState(false);
  const [dsConNo, datDsConNo] = useState<HoaDonConNo[]>([]);
  const [phuongThuc, datPhuongThuc] = useState<string>("chuyen-khoan");
  const [ngayChi, datNgayChi] = useState(homNay);
  const [thamChieu, datThamChieu] = useState("");
  const [phanBo, datPhanBo] = useState<Record<string, string>>({});

  const [lyDo, datLyDo] = useState("");

  useEffect(() => {
    if (!moChi) return;
    const huy = new AbortController();
    fetch(`/api/v1/cong-no-tra/${nhaCungCapId}`, { signal: huy.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: HoaDonConNo[] | null) => {
        if (!d) return;
        datDsConNo(d);
        // Điền sẵn đúng hóa đơn đang mở; các hóa đơn khác để trống cho người dùng chọn.
        datPhanBo(Object.fromEntries(d.map((h) => [h.id, h.id === id ? dinhDangNhapTien(String(h.conNo)) : ""])));
      })
      .catch(() => {});
    return () => huy.abort();
  }, [moChi, nhaCungCapId, id]);

  const soThuan = (s: string) => Number(s.replace(/\./g, "") || 0);
  const tongPhanBo = Object.values(phanBo).reduce((s, v) => s + soThuan(v), 0);

  async function ghiNhan() {
    const kq = await goi(`/api/v1/hoa-don-mua/${id}/ghi-nhan`, "POST", { ngayHoaDon, hanThanhToan, soHoaDonNcc });
    if (!kq) return;
    hopGhi.current?.close();
    router.refresh();
  }

  async function chi() {
    const ds = Object.entries(phanBo)
      .filter(([, v]) => soThuan(v) > 0)
      .map(([hoaDonId, v]) => ({ hoaDonId, soTien: String(soThuan(v)) }));
    const kq = await goi("/api/v1/phieu-chi", "POST", {
      nhaCungCapId,
      phuongThuc,
      soTien: String(tongPhanBo),
      ngayChi,
      thamChieu,
      phanBo: ds,
    });
    if (!kq) return;
    hopChi.current?.close();
    datMoChi(false);
    router.refresh();
  }

  async function huy() {
    const kq = await goi(`/api/v1/hoa-don-mua/${id}/huy`, "POST", { lyDo });
    if (!kq) return;
    hopHuy.current?.close();
    router.refresh();
  }

  return (
    <>
      {duocGhiNhan && (
        <button
          type="button"
          className="nut chinh"
          onClick={() => {
            datLoi(null);
            datNgayHoaDon(homNay);
            datHanThanhToan("");
            hopGhi.current?.showModal();
          }}
        >
          Ghi nhận hóa đơn
        </button>
      )}
      {duocChi && (
        <button
          type="button"
          className="nut chinh"
          onClick={() => {
            datLoi(null);
            datNgayChi(homNay);
            datThamChieu("");
            datMoChi(true);
            hopChi.current?.showModal();
          }}
        >
          Chi tiền
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
          Hủy hóa đơn
        </button>
      )}

      <HopThoai ref={hopGhi} tieuDe={`Ghi nhận hóa đơn ${so}`} rong={520}>
        <div className="than">
          {loi && (
            <div className="hop-thong-bao loi" role="alert">
              {loi.thongBao}
            </div>
          )}
          <p className="goi-y" style={{ marginTop: 0 }}>
            Ghi nhận là lúc chốt số tiền và bắt đầu tính nợ phải trả. Hạn thanh toán lấy theo hóa đơn nhà cung cấp gửi
            tới — hệ thống không tự suy ra.
          </p>
          <div className="luoi-form">
            <div className="truong">
              <label htmlFor="hm-ngay">Ngày hóa đơn</label>
              <input id="hm-ngay" type="date" value={ngayHoaDon} max={homNay} onChange={(e) => datNgayHoaDon(e.target.value)} />
            </div>
            <div className="truong">
              <label htmlFor="hm-han">
                Hạn thanh toán <span className="bat-buoc">*</span>
              </label>
              <input id="hm-han" type="date" value={hanThanhToan} onChange={(e) => datHanThanhToan(e.target.value)} />
            </div>
            <div className="truong ca-dong">
              <label htmlFor="hm-so">Số hóa đơn của nhà cung cấp</label>
              <input
                id="hm-so"
                type="text"
                value={soHoaDonNcc}
                onChange={(e) => datSoHoaDonNcc(e.target.value)}
                placeholder="Ví dụ: AA/25E-0001234"
              />
            </div>
          </div>
        </div>
        <div className="chan-form">
          <button type="button" className="nut" onClick={() => hopGhi.current?.close()} disabled={dangGui}>
            Hủy bỏ
          </button>
          <button type="button" className="nut chinh" onClick={ghiNhan} disabled={dangGui || !hanThanhToan}>
            {dangGui ? "Đang lưu…" : "Ghi nhận"}
          </button>
        </div>
      </HopThoai>

      <HopThoai ref={hopChi} tieuDe="Chi tiền cho nhà cung cấp" rong={760}>
        <div className="than">
          {loi && (
            <div className="hop-thong-bao loi" role="alert">
              {loi.thongBao}
            </div>
          )}
          <div className="luoi-form">
            <div className="truong">
              <label htmlFor="pc-pt">Hình thức</label>
              <select id="pc-pt" value={phuongThuc} onChange={(e) => datPhuongThuc(e.target.value)}>
                {PHUONG_THUC_THU.map((m) => (
                  <option key={m} value={m}>
                    {NHAN_PHUONG_THUC_THU[m] ?? m}
                  </option>
                ))}
              </select>
            </div>
            <div className="truong">
              <label htmlFor="pc-ngay">Ngày chi</label>
              <input id="pc-ngay" type="date" value={ngayChi} max={homNay} onChange={(e) => datNgayChi(e.target.value)} />
            </div>
            <div className="truong ca-dong">
              <label htmlFor="pc-tc">Tham chiếu</label>
              <input
                id="pc-tc"
                type="text"
                value={thamChieu}
                onChange={(e) => datThamChieu(e.target.value)}
                placeholder="Số ủy nhiệm chi, số séc…"
              />
            </div>
          </div>

          <div className="cuon-ngang" style={{ marginTop: 12 }}>
            <table className="bang bang-hang">
              <thead>
                <tr>
                  <th>Hóa đơn</th>
                  <th className="so" style={{ width: 130 }}>
                    Còn nợ
                  </th>
                  <th className="so" style={{ width: 150 }}>
                    Chi lần này
                  </th>
                </tr>
              </thead>
              <tbody>
                {dsConNo.map((h) => (
                  <tr key={h.id}>
                    <td>
                      <strong>{h.so}</strong>
                      <div className="dong-phu">
                        {h.soHoaDonNcc ? `${h.soHoaDonNcc} · ` : ""}
                        {h.hanThanhToan ? `hạn ${dinhDangNgay(h.hanThanhToan)}` : "chưa có hạn"}
                        {h.soNgayQuaHan > 0 && <span className="chu-loi"> · quá {h.soNgayQuaHan} ngày</span>}
                      </div>
                    </td>
                    <td className="so">{dinhDangTien(h.conNo)}</td>
                    <td>
                      <input
                        type="text"
                        inputMode="numeric"
                        className="phai"
                        aria-label={`Chi cho hóa đơn ${h.so}`}
                        value={phanBo[h.id] ?? ""}
                        onChange={(e) => datPhanBo((c) => ({ ...c, [h.id]: dinhDangNhapTien(e.target.value) }))}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {dsConNo.length === 0 && <p className="goi-y">Đang tải danh sách hóa đơn còn nợ…</p>}
          <p style={{ textAlign: "right", marginBottom: 0 }}>
            <strong>Tổng chi: {dinhDangTien(tongPhanBo)}</strong>
          </p>
        </div>
        <div className="chan-form">
          <button
            type="button"
            className="nut"
            onClick={() => {
              hopChi.current?.close();
              datMoChi(false);
            }}
            disabled={dangGui}
          >
            Hủy bỏ
          </button>
          <button type="button" className="nut chinh" onClick={chi} disabled={dangGui || tongPhanBo <= 0}>
            {dangGui ? "Đang ghi…" : "Ghi phiếu chi"}
          </button>
        </div>
      </HopThoai>

      <HopThoai ref={hopHuy} tieuDe={`Hủy hóa đơn ${so}`} rong={460}>
        <div className="than">
          {loi && (
            <div className="hop-thong-bao loi" role="alert">
              {loi.thongBao}
            </div>
          )}
          <div className="truong">
            <label htmlFor="hm-lydo">
              Lý do hủy <span className="bat-buoc">*</span>
            </label>
            <input id="hm-lydo" type="text" value={lyDo} onChange={(e) => datLyDo(e.target.value)} />
            <span className="goi-y">Hóa đơn đã chi tiền thì không hủy được — hủy phiếu chi trước.</span>
          </div>
        </div>
        <div className="chan-form">
          <button type="button" className="nut" onClick={() => hopHuy.current?.close()} disabled={dangGui}>
            Hủy bỏ
          </button>
          <button type="button" className="nut nguy-hiem" onClick={huy} disabled={dangGui || lyDo.trim().length < 2}>
            {dangGui ? "Đang lưu…" : "Hủy hóa đơn"}
          </button>
        </div>
      </HopThoai>
    </>
  );
}
