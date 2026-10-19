"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import HopThoai from "@/components/ui/HopThoai";
import { useGoiApi } from "@/components/ui/goi-api";
import { dinhDangSo } from "@/lib/dinh-dang";

/**
 * Hành động trên một đơn hàng: xác nhận (giữ hàng trong kho), hủy (nhả hàng), xuất hàng.
 *
 * Nút nào hiện là do máy chủ quyết (`quyen` trong `chiTietDonHang`); ẩn nút chỉ để đỡ rối
 * mắt, chốt chặn thật nằm ở service (mục 34 prompt).
 */

export interface DongXuat {
  id: string;
  ten: string;
  sku: string | null;
  donViTinh: string | null;
  conPhaiGiao: number;
  theoSerial: boolean;
}

type Viec = "xac-nhan" | "huy" | "xuat" | null;

export default function TacVuDonHang({
  donId,
  quyen,
  kho,
  dong,
}: {
  donId: string;
  quyen: { sua: boolean; xacNhan: boolean; huy: boolean; xuatHang: boolean };
  kho: { id: string; ma: string; ten: string; macDinh: boolean }[];
  dong: DongXuat[];
}) {
  const router = useRouter();
  const hop = useRef<HTMLDialogElement | null>(null);
  const { goi, dangGui, loi, datLoi } = useGoiApi();
  const [viec, datViec] = useState<Viec>(null);
  const [khoId, datKhoId] = useState(kho.find((k) => k.macDinh)?.id ?? kho[0]?.id ?? "");
  const [ghiChu, datGhiChu] = useState("");
  const [lyDo, datLyDo] = useState("");
  const [nguoiNhan, datNguoiNhan] = useState("");
  const [soLuong, datSoLuong] = useState<Record<string, string>>({});
  const [serial, datSerial] = useState<Record<string, string>>({});

  const mo = (v: Viec) => {
    datViec(v);
    datLoi(null);
    datGhiChu("");
    datLyDo("");
    if (v === "xuat") {
      datSoLuong(Object.fromEntries(dong.map((d) => [d.id, String(d.conPhaiGiao)])));
      datSerial({});
    }
    hop.current?.showModal();
  };

  async function chay() {
    const duong = `/api/v1/don-hang/${donId}`;
    let kq: unknown = null;
    if (viec === "xac-nhan") kq = await goi(`${duong}/xac-nhan`, "POST", { khoId, ghiChu });
    else if (viec === "huy") kq = await goi(`${duong}/huy`, "POST", { lyDo });
    else if (viec === "xuat") {
      const dsDong = dong
        .map((d) => ({
          dongDonId: d.id,
          soLuong: (soLuong[d.id] ?? "").trim(),
          serial: (serial[d.id] ?? "").split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean),
        }))
        .filter((d) => d.soLuong !== "" && Number(d.soLuong) > 0);
      if (dsDong.length === 0) {
        datLoi({ thongBao: "Nhập số lượng cho ít nhất một dòng hàng.", loiTruong: {}, status: 0 });
        return;
      }
      kq = await goi(`${duong}/phieu-xuat`, "POST", { khoId, nguoiNhan, ghiChu, dong: dsDong });
    }
    if (!kq) return;
    // TV-BH-07: hủy đơn không tự đóng dự án gắn kèm — nhắc người hủy báo quản lý dự án.
    const duAn = (kq as { canhBao?: { duAnDangMo?: { ma: string; ten: string }[] } }).canhBao?.duAnDangMo ?? [];
    if (viec === "huy" && duAn.length > 0) {
      window.alert(`Đơn đã hủy. Dự án còn mở gắn với đơn: ${duAn.map((d) => `${d.ma} – ${d.ten}`).join("; ")}. Báo quản lý dự án quyết định đóng hay giữ.`);
    }
    hop.current?.close();
    datViec(null);
    router.refresh();
  }

  const tieuDe = viec === "xac-nhan" ? "Xác nhận đơn và giữ hàng" : viec === "huy" ? "Hủy đơn hàng" : "Xuất hàng giao khách";
  const thieuKho = kho.length === 0;

  return (
    <>
      <div className="hanh-dong">
        {quyen.xacNhan && (
          <button type="button" className="nut chinh" onClick={() => mo("xac-nhan")}>
            Xác nhận đơn
          </button>
        )}
        {quyen.xuatHang && (
          <button type="button" className="nut chinh" onClick={() => mo("xuat")}>
            Xuất hàng
          </button>
        )}
        {quyen.huy && (
          <button type="button" className="nut nguy-hiem" onClick={() => mo("huy")}>
            Hủy đơn
          </button>
        )}
      </div>

      <HopThoai ref={hop} tieuDe={tieuDe} rong={viec === "xuat" ? 760 : 520} khiDong={() => datViec(null)}>
        <div className="than">
          {loi && (
            <div className="hop-thong-bao loi" role="alert">
              {loi.thongBao}
            </div>
          )}
          {thieuKho && viec !== "huy" && (
            <div className="hop-thong-bao canh-bao" role="status">
              Chưa khai kho nào. Vào Kho → Danh sách kho để tạo kho trước.
            </div>
          )}

          {viec === "xac-nhan" && (
            <>
              <p className="goi-y" style={{ marginTop: 0 }}>
                Xác nhận xong, hàng trong kho được <strong>giữ chỗ</strong> cho đơn này: người khác không bán mất phần đó. Hàng không đủ thì hệ thống chặn và nói rõ thiếu bao nhiêu.
              </p>
              <div className="truong">
                <label htmlFor="dh-kho">Giữ hàng ở kho</label>
                <select id="dh-kho" value={khoId} onChange={(e) => datKhoId(e.target.value)}>
                  {kho.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.ten} ({k.ma})
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}

          {viec === "huy" && (
            <div className="truong">
              <label htmlFor="dh-lydo">
                Lý do hủy <span className="bat-buoc">*</span>
              </label>
              <textarea id="dh-lydo" rows={3} value={lyDo} onChange={(e) => datLyDo(e.target.value)} placeholder="Khách đổi ý, hết hàng, giá không chốt được…" />
              <span className="goi-y">Hàng đang giữ chỗ cho đơn này sẽ được nhả ra ngay. Hàng đã xuất thì không tự thu về.</span>
            </div>
          )}

          {viec === "xuat" && (
            <>
              <div className="luoi-form">
                <div className="truong">
                  <label htmlFor="dh-kho-xuat">Xuất từ kho</label>
                  <select id="dh-kho-xuat" value={khoId} onChange={(e) => datKhoId(e.target.value)}>
                    {kho.map((k) => (
                      <option key={k.id} value={k.id}>
                        {k.ten} ({k.ma})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="truong">
                  <label htmlFor="dh-nguoinhan">Người nhận hàng</label>
                  <input id="dh-nguoinhan" type="text" value={nguoiNhan} onChange={(e) => datNguoiNhan(e.target.value)} placeholder="Tên người ký nhận" />
                </div>
              </div>
              <div className="cuon-ngang">
                <table className="bang bang-hang">
                  <thead>
                    <tr>
                      <th>Hàng hóa</th>
                      <th className="so" style={{ width: 110 }}>
                        Còn phải giao
                      </th>
                      <th className="so" style={{ width: 110 }}>
                        Xuất lần này
                      </th>
                      <th style={{ width: 240 }}>Số sê-ri</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dong.map((d) => (
                      <tr key={d.id}>
                        <td>
                          {d.ten}
                          {d.sku && <div className="dong-phu">{d.sku}</div>}
                        </td>
                        <td className="so">
                          {dinhDangSo(d.conPhaiGiao)} {d.donViTinh}
                        </td>
                        <td>
                          <input
                            type="text"
                            inputMode="decimal"
                            className="phai"
                            aria-label={`Số lượng xuất ${d.ten}`}
                            value={soLuong[d.id] ?? ""}
                            onChange={(e) => datSoLuong((c) => ({ ...c, [d.id]: e.target.value }))}
                          />
                        </td>
                        <td>
                          {d.theoSerial ? (
                            <textarea
                              rows={2}
                              aria-label={`Số sê-ri ${d.ten}`}
                              value={serial[d.id] ?? ""}
                              onChange={(e) => datSerial((c) => ({ ...c, [d.id]: e.target.value }))}
                              placeholder="Mỗi sê-ri một dòng"
                            />
                          ) : (
                            <span className="mo nho">Không quản lý sê-ri</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {viec !== "huy" && (
            <div className="truong">
              <label htmlFor="dh-ghichu">Ghi chú</label>
              <textarea id="dh-ghichu" rows={2} value={ghiChu} onChange={(e) => datGhiChu(e.target.value)} placeholder="Không bắt buộc" />
            </div>
          )}
        </div>
        <div className="chan-form">
          <button type="button" className="nut" onClick={() => hop.current?.close()} disabled={dangGui}>
            Hủy bỏ
          </button>
          <button
            type="button"
            className={`nut ${viec === "huy" ? "nguy-hiem" : "chinh"}`}
            onClick={chay}
            disabled={dangGui || (viec !== "huy" && thieuKho) || (viec === "huy" && lyDo.trim().length < 2)}
          >
            {dangGui ? "Đang lưu…" : viec === "xac-nhan" ? "Xác nhận và giữ hàng" : viec === "huy" ? "Hủy đơn" : "Lập phiếu xuất"}
          </button>
        </div>
      </HopThoai>
    </>
  );
}
