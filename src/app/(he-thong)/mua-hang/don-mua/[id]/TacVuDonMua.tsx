"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import HopThoai from "@/components/ui/HopThoai";
import { useGoiApi } from "@/components/ui/goi-api";
import { dinhDangNhapTien } from "@/lib/dinh-dang";

interface DongDon {
  id: string;
  ten: string;
  soLuong: string;
  donViTinh: string | null;
  donGia: string;
  conPhaiNhan: number;
  theoSerial: boolean;
}

interface NhapDong {
  chon: boolean;
  soLuong: string;
  giaVon: string;
  serial: string;
}

/**
 * Các nút của một đơn mua: gửi nhà cung cấp, xác nhận, nhận hàng, hủy.
 *
 * Hộp nhận hàng điền sẵn phần còn thiếu của từng dòng — nhận đủ là việc thường gặp nhất,
 * nên không bắt người dùng gõ lại. Hàng theo sê-ri phải khai đủ sê-ri, mỗi dòng một cái.
 */
export default function TacVuDonMua({
  id,
  so,
  dong,
  duocGui,
  duocXacNhan,
  duocNhan,
  duocHuy,
  homNay,
}: {
  id: string;
  so: string;
  dong: DongDon[];
  duocGui: boolean;
  duocXacNhan: boolean;
  duocNhan: boolean;
  duocHuy: boolean;
  homNay: string;
}) {
  const router = useRouter();
  const hopNhan = useRef<HTMLDialogElement | null>(null);
  const hopHuy = useRef<HTMLDialogElement | null>(null);
  const { goi, dangGui, loi, datLoi } = useGoiApi();
  const [ngayNhan, datNgayNhan] = useState(homNay);
  const [soChungTu, datSoChungTu] = useState("");
  const [nhap, datNhap] = useState<Record<string, NhapDong>>({});
  const [lyDo, datLyDo] = useState("");

  const conNhan = dong.filter((d) => d.conPhaiNhan > 0);

  function moNhan() {
    datLoi(null);
    datNgayNhan(homNay);
    datSoChungTu("");
    datNhap(
      Object.fromEntries(
        conNhan.map((d) => [d.id, { chon: true, soLuong: String(d.conPhaiNhan), giaVon: "", serial: "" }]),
      ),
    );
    hopNhan.current?.showModal();
  }

  const sua = (idDong: string, thay: Partial<NhapDong>) =>
    datNhap((c) => ({ ...c, [idDong]: { ...c[idDong], ...thay } }));

  async function gui() {
    const kq = await goi(`/api/v1/don-mua/${id}/gui`, "POST", {});
    if (kq) router.refresh();
  }

  async function xacNhan() {
    const kq = await goi(`/api/v1/don-mua/${id}/xac-nhan`, "POST", {});
    if (kq) router.refresh();
  }

  async function nhan() {
    const dsGui = conNhan
      .filter((d) => nhap[d.id]?.chon && Number(nhap[d.id]?.soLuong) > 0)
      .map((d) => ({
        dongDonId: d.id,
        soLuong: nhap[d.id].soLuong,
        giaVon: nhap[d.id].giaVon || "",
        serial: nhap[d.id].serial
          .split(/[\n,]/)
          .map((s) => s.trim())
          .filter(Boolean),
      }));
    const kq = await goi(`/api/v1/don-mua/${id}/nhan-hang`, "POST", {
      ngayNhan,
      soChungTuNcc: soChungTu,
      dong: dsGui,
    });
    if (!kq) return;
    hopNhan.current?.close();
    router.refresh();
  }

  async function huy() {
    const kq = await goi(`/api/v1/don-mua/${id}/huy`, "POST", { lyDo });
    if (!kq) return;
    hopHuy.current?.close();
    router.refresh();
  }

  const soDongChon = conNhan.filter((d) => nhap[d.id]?.chon && Number(nhap[d.id]?.soLuong) > 0).length;

  return (
    <>
      {duocGui && (
        <button type="button" className="nut chinh" onClick={gui} disabled={dangGui}>
          Gửi nhà cung cấp
        </button>
      )}
      {duocXacNhan && (
        <button type="button" className="nut" onClick={xacNhan} disabled={dangGui}>
          Nhà cung cấp đã nhận
        </button>
      )}
      {duocNhan && conNhan.length > 0 && (
        <button type="button" className="nut chinh" onClick={moNhan} disabled={dangGui}>
          Nhận hàng
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
          Hủy đơn
        </button>
      )}

      <HopThoai ref={hopNhan} tieuDe={`Nhận hàng đơn ${so}`} rong={740}>
        <div className="than">
          {loi && (
            <div className="hop-thong-bao loi" role="alert">
              {loi.thongBao}
            </div>
          )}
          <p className="goi-y" style={{ marginTop: 0 }}>
            Hàng nhận vào đi thẳng vào sổ kho. Nhận sai thì không xóa phiếu được — phải điều chỉnh tồn kèm lý do.
          </p>
          <div className="luoi-form">
            <div className="truong">
              <label htmlFor="nh-ngay">Ngày nhận</label>
              <input id="nh-ngay" type="date" value={ngayNhan} max={homNay} onChange={(e) => datNgayNhan(e.target.value)} />
            </div>
            <div className="truong">
              <label htmlFor="nh-ct">Số chứng từ nhà cung cấp</label>
              <input
                id="nh-ct"
                type="text"
                value={soChungTu}
                onChange={(e) => datSoChungTu(e.target.value)}
                placeholder="Số hóa đơn hoặc phiếu giao"
              />
            </div>
          </div>

          <div className="cuon-ngang" style={{ marginTop: 12 }}>
            <table className="bang bang-hang">
              <thead>
                <tr>
                  <th style={{ width: 36 }}>
                    <span className="chi-doc-man-hinh">Chọn</span>
                  </th>
                  <th>Hàng</th>
                  <th className="so" style={{ width: 110 }}>
                    Còn phải nhận
                  </th>
                  <th className="so" style={{ width: 110 }}>
                    Nhận lần này
                  </th>
                  <th className="so" style={{ width: 140 }}>
                    Giá vốn
                  </th>
                </tr>
              </thead>
              <tbody>
                {conNhan.map((d) => (
                  <tr key={d.id}>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`Nhận ${d.ten}`}
                        checked={nhap[d.id]?.chon ?? false}
                        onChange={(e) => sua(d.id, { chon: e.target.checked })}
                      />
                    </td>
                    <td>
                      {d.ten}
                      {d.theoSerial && (
                        <div className="truong" style={{ marginTop: 6 }}>
                          <label htmlFor={`sr-${d.id}`} className="nho">
                            Số sê-ri (mỗi dòng một cái)
                          </label>
                          <textarea
                            id={`sr-${d.id}`}
                            rows={2}
                            value={nhap[d.id]?.serial ?? ""}
                            onChange={(e) => sua(d.id, { serial: e.target.value })}
                            placeholder="SN0001&#10;SN0002"
                          />
                        </div>
                      )}
                    </td>
                    <td className="so nho">
                      {d.conPhaiNhan}
                      {d.donViTinh ? ` ${d.donViTinh}` : ""}
                    </td>
                    <td>
                      <input
                        type="text"
                        inputMode="decimal"
                        className="phai"
                        aria-label={`Số lượng nhận ${d.ten}`}
                        value={nhap[d.id]?.soLuong ?? ""}
                        onChange={(e) => sua(d.id, { soLuong: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        inputMode="numeric"
                        className="phai"
                        aria-label={`Giá vốn ${d.ten}`}
                        value={nhap[d.id]?.giaVon ?? ""}
                        onChange={(e) => sua(d.id, { giaVon: dinhDangNhapTien(e.target.value) })}
                        placeholder={d.donGia}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="goi-y">Bỏ trống giá vốn thì lấy đơn giá trên đơn mua.</p>
        </div>
        <div className="chan-form">
          <button type="button" className="nut" onClick={() => hopNhan.current?.close()} disabled={dangGui}>
            Hủy bỏ
          </button>
          <button type="button" className="nut chinh" onClick={nhan} disabled={dangGui || soDongChon === 0}>
            {dangGui ? "Đang ghi…" : `Nhận ${soDongChon} dòng`}
          </button>
        </div>
      </HopThoai>

      <HopThoai ref={hopHuy} tieuDe={`Hủy đơn mua ${so}`} rong={460}>
        <div className="than">
          {loi && (
            <div className="hop-thong-bao loi" role="alert">
              {loi.thongBao}
            </div>
          )}
          <div className="truong">
            <label htmlFor="dm-lydo">
              Lý do hủy <span className="bat-buoc">*</span>
            </label>
            <input id="dm-lydo" type="text" value={lyDo} onChange={(e) => datLyDo(e.target.value)} />
            <span className="goi-y">Đơn đã nhận một phần hàng thì không hủy được.</span>
          </div>
        </div>
        <div className="chan-form">
          <button type="button" className="nut" onClick={() => hopHuy.current?.close()} disabled={dangGui}>
            Hủy bỏ
          </button>
          <button type="button" className="nut nguy-hiem" onClick={huy} disabled={dangGui || lyDo.trim().length < 2}>
            {dangGui ? "Đang lưu…" : "Hủy đơn"}
          </button>
        </div>
      </HopThoai>
    </>
  );
}
