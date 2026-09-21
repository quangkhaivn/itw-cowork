"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { loiCua, useGoiApi, type LoiApi } from "@/components/ui/goi-api";
import OTimSanPham, { type GoiYSanPham } from "@/components/san-pham/OTimSanPham";
import { dinhDangNhapTien, dinhDangTien } from "@/lib/dinh-dang";
import { tinhDonMua } from "@/modules/mua-hang/tinh-toan";

export interface DongGoiY {
  dongDonId: string;
  sanPhamId: string | null;
  sku: string | null;
  ten: string;
  donViTinh: string | null;
  donGia: string;
  vat: string;
  conTraDuoc: number;
  theoSerial: boolean;
}

interface Dong {
  khoa: string;
  dongDonId: string;
  sanPhamId: string;
  ten: string;
  soLuong: string;
  donViTinh: string;
  donGia: string;
  vat: string;
  tinhTrang: "con-tot" | "loi";
  nhapLaiKho: boolean;
  serial: string;
  thayTheSanPhamId: string;
  thayTheTen: string;
  thayTheSerial: string;
  ghiChu: string;
  conTraDuoc: number | null;
  theoSerial: boolean;
}

let dem = 0;
function dongTrong(): Dong {
  dem += 1;
  return {
    khoa: `th${Date.now().toString(36)}-${dem}`,
    dongDonId: "",
    sanPhamId: "",
    ten: "",
    soLuong: "1",
    donViTinh: "",
    donGia: "",
    vat: "10",
    tinhTrang: "con-tot",
    nhapLaiKho: true,
    serial: "",
    thayTheSanPhamId: "",
    thayTheTen: "",
    thayTheSerial: "",
    ghiChu: "",
    conTraDuoc: null,
    theoSerial: false,
  };
}

function LoiTruong({ loi, truong }: { loi: LoiApi | null; truong: string }) {
  const tb = loiCua(loi, truong);
  return tb ? <span className="loi-truong">{tb}</span> : null;
}

const soThuan = (s: string) => s.replace(/\./g, "").replace(",", ".");
const tachSerial = (s: string) =>
  s
    .split(/[,\n]/)
    .map((x) => x.trim())
    .filter(Boolean);

/**
 * Lập phiếu khách trả hàng hoặc đổi máy.
 *
 * Mở từ một đơn hàng thì các dòng còn trả được đã nằm sẵn ở đây kèm **số lượng tối đa**
 * — người lập không phải tự nhớ đơn đó đã giao bao nhiêu và đã trả bao nhiêu.
 */
export default function FormTraHangBan({
  kho,
  khach,
  don,
  khachTuDon,
  dongGoiY,
}: {
  kho: { id: string; ten: string; macDinh: boolean }[];
  khach: { id: string; ten: string }[];
  don: { id: string; so: string } | null;
  khachTuDon: { id: string; ten: string } | null;
  dongGoiY: DongGoiY[];
}) {
  const router = useRouter();
  const { goi, dangGui, loi } = useGoiApi();
  const [khachHangId, datKhachHangId] = useState(khachTuDon?.id ?? "");
  const [khoId, datKhoId] = useState(kho.find((k) => k.macDinh)?.id ?? kho[0]?.id ?? "");
  const [loai, datLoai] = useState<"tra-hang" | "doi-may">("tra-hang");
  const [ngayTra, datNgayTra] = useState("");
  const [lyDo, datLyDo] = useState("");
  const [ghiChu, datGhiChu] = useState("");
  const [dong, datDong] = useState<Dong[]>(
    dongGoiY.length > 0
      ? dongGoiY.map((d, i) => ({
          ...dongTrong(),
          khoa: `goi-y-${i}`,
          dongDonId: d.dongDonId,
          sanPhamId: d.sanPhamId ?? "",
          ten: d.ten,
          soLuong: String(d.conTraDuoc),
          donViTinh: d.donViTinh ?? "",
          donGia: dinhDangNhapTien(d.donGia),
          vat: d.vat,
          conTraDuoc: d.conTraDuoc,
          theoSerial: d.theoSerial,
        }))
      : [dongTrong()],
  );

  const doiMay = loai === "doi-may";
  const sua = (i: number, thay: Partial<Dong>) => datDong((c) => c.map((d, j) => (j === i ? { ...d, ...thay } : d)));

  /** Đổi tình trạng thì đổi luôn mặc định nhập lại kho — hàng lỗi không quay lại kệ bán. */
  function doiTinhTrang(i: number, tt: "con-tot" | "loi") {
    sua(i, { tinhTrang: tt, nhapLaiKho: tt === "con-tot" });
  }

  function themTuDanhMuc(g: GoiYSanPham) {
    datDong((c) => [
      ...c.filter((d) => d.ten.trim().length > 0),
      {
        ...dongTrong(),
        sanPhamId: g.id,
        ten: g.ten,
        donViTinh: g.donViTinh ?? "",
        donGia: dinhDangNhapTien(g.giaBan ?? ""),
        vat: g.vat ?? "10",
        theoSerial: false,
      },
    ]);
  }

  const hopLe = dong.filter((d) => d.ten.trim().length >= 2 && Number(soThuan(d.soLuong)) > 0);
  const tong = tinhDonMua(
    hopLe.map((d) => ({ soLuong: soThuan(d.soLuong), donGia: doiMay ? 0 : soThuan(d.donGia), vat: doiMay ? 0 : d.vat })),
  );

  const vuotSoLuong = hopLe.filter((d) => d.conTraDuoc !== null && Number(soThuan(d.soLuong)) > d.conTraDuoc);
  const thieuThayThe = doiMay ? hopLe.filter((d) => !d.thayTheSanPhamId) : [];
  const thieuGhiChuHangLoi = hopLe.filter((d) => d.tinhTrang === "loi" && d.nhapLaiKho && d.ghiChu.trim().length < 2);

  async function gui(e: React.FormEvent) {
    e.preventDefault();
    const kq = await goi<{ id: string }>("/api/v1/tra-hang-ban", "POST", {
      khachHangId,
      donHangId: don?.id ?? "",
      khoId,
      loai,
      ngayTra,
      lyDo,
      ghiChu,
      dong: hopLe.map((d) => ({
        dongDonId: d.dongDonId,
        sanPhamId: d.sanPhamId,
        ten: d.ten,
        soLuong: soThuan(d.soLuong),
        donViTinh: d.donViTinh,
        donGia: d.donGia || "0",
        vat: Number(d.vat || 0),
        tinhTrang: d.tinhTrang,
        nhapLaiKho: d.nhapLaiKho,
        serial: tachSerial(d.serial),
        thayTheSanPhamId: d.thayTheSanPhamId,
        thayTheSerial: tachSerial(d.thayTheSerial),
        ghiChu: d.ghiChu,
      })),
    });
    if (kq) router.push(`/tra-hang/khach-tra/${kq.id}?moTao=1`);
  }

  const thieu =
    !khachHangId ||
    !khoId ||
    lyDo.trim().length < 2 ||
    hopLe.length === 0 ||
    vuotSoLuong.length > 0 ||
    thieuThayThe.length > 0 ||
    thieuGhiChuHangLoi.length > 0;

  return (
    <form className="the" onSubmit={gui} noValidate>
      {loi && (
        <div style={{ padding: "16px 16px 0" }}>
          <div className="hop-thong-bao loi" role="alert">
            {loi.thongBao}
          </div>
        </div>
      )}

      {don && (
        <div style={{ padding: "16px 16px 0" }}>
          <div className="hop-thong-bao" role="status">
            Theo đơn <strong>{don.so}</strong> của {khachTuDon?.ten}. Số lượng điền sẵn là phần <strong>còn trả
            được</strong> — đã trừ những gì khách trả ở các phiếu trước.
          </div>
        </div>
      )}

      <div className="phan-form">
        <h3>Ai trả, trả về đâu</h3>
        <div className="luoi-form">
          <div className="truong">
            <label htmlFor="th-khach">
              Khách hàng <span className="bat-buoc">*</span>
            </label>
            {khachTuDon ? (
              <input id="th-khach" type="text" value={khachTuDon.ten} readOnly />
            ) : (
              <select id="th-khach" value={khachHangId} onChange={(e) => datKhachHangId(e.target.value)}>
                <option value="">— Chọn khách hàng —</option>
                {khach.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.ten}
                  </option>
                ))}
              </select>
            )}
            <LoiTruong loi={loi} truong="khachHangId" />
          </div>
          <div className="truong">
            <label htmlFor="th-kho">
              Kho nhận hàng về <span className="bat-buoc">*</span>
            </label>
            <select id="th-kho" value={khoId} onChange={(e) => datKhoId(e.target.value)}>
              {kho.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.ten}
                </option>
              ))}
            </select>
            <LoiTruong loi={loi} truong="khoId" />
          </div>
          <div className="truong">
            <label htmlFor="th-loai">Loại phiếu</label>
            <select id="th-loai" value={loai} onChange={(e) => datLoai(e.target.value as "tra-hang" | "doi-may")}>
              <option value="tra-hang">Khách trả hàng — giảm trừ công nợ</option>
              <option value="doi-may">Đổi máy — đổi ngang, không phát sinh tiền</option>
            </select>
          </div>
          <div className="truong">
            <label htmlFor="th-ngay">Ngày trả</label>
            <input id="th-ngay" type="date" value={ngayTra} onChange={(e) => datNgayTra(e.target.value)} />
            <LoiTruong loi={loi} truong="ngayTra" />
          </div>
          <div className="truong ca-dong">
            <label htmlFor="th-lydo">
              Vì sao trả <span className="bat-buoc">*</span>
            </label>
            <input
              id="th-lydo"
              type="text"
              value={lyDo}
              onChange={(e) => datLyDo(e.target.value)}
              placeholder="Ví dụ: máy lỗi màn hình trong bảo hành / khách mua dư, trả lại 2 cái"
            />
            <LoiTruong loi={loi} truong="lyDo" />
          </div>
          <div className="truong ca-dong">
            <label htmlFor="th-ghichu">Ghi chú</label>
            <input id="th-ghichu" type="text" value={ghiChu} onChange={(e) => datGhiChu(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="phan-form">
        <h3>{doiMay ? "Máy khách mang về và máy giao thay thế" : "Hàng khách trả"}</h3>
        {!don && <OTimSanPham khiChon={themTuDanhMuc} nhan="Tìm sản phẩm để thêm vào phiếu" />}

        <div className="cuon-ngang">
          <table className="bang bang-hang">
            <thead>
              <tr>
                <th>Hàng</th>
                <th className="so" style={{ width: 90 }}>
                  SL
                </th>
                {!doiMay && (
                  <>
                    <th className="so" style={{ width: 130 }}>
                      Đơn giá
                    </th>
                    <th className="so" style={{ width: 80 }}>
                      VAT %
                    </th>
                  </>
                )}
                <th style={{ width: 130 }}>Tình trạng</th>
                <th style={{ width: 110 }}>Nhập lại kho</th>
                <th style={{ width: 200 }}>Sê-ri</th>
                <th style={{ width: 40 }}>
                  <span className="chi-doc-man-hinh">Xóa</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {dong.map((d, i) => (
                <tr key={d.khoa}>
                  <td>
                    <input
                      type="text"
                      aria-label={`Tên hàng dòng ${i + 1}`}
                      value={d.ten}
                      onChange={(e) => sua(i, { ten: e.target.value })}
                      placeholder="Tên hàng"
                    />
                    {d.conTraDuoc !== null && <div className="dong-phu phu">Còn trả được {d.conTraDuoc}</div>}
                    {doiMay && (
                      <div style={{ marginTop: 6 }}>
                        <input
                          type="text"
                          aria-label={`Mã hàng giao thay thế dòng ${i + 1}`}
                          value={d.thayTheTen}
                          onChange={(e) => sua(i, { thayTheTen: e.target.value })}
                          placeholder="Máy giao thay thế — chọn ở ô tìm bên dưới"
                          readOnly
                        />
                        <OTimSanPham
                          khiChon={(g) => sua(i, { thayTheSanPhamId: g.id, thayTheTen: `${g.ten}${g.sku ? ` (${g.sku})` : ""}` })}
                          nhan={`Tìm máy giao thay thế cho dòng ${i + 1}`}
                          goiY="Gõ SKU hoặc tên máy thay thế…"
                        />
                      </div>
                    )}
                  </td>
                  <td>
                    <input
                      type="text"
                      inputMode="decimal"
                      aria-label={`Số lượng dòng ${i + 1}`}
                      value={d.soLuong}
                      onChange={(e) => sua(i, { soLuong: e.target.value })}
                      className={d.conTraDuoc !== null && Number(soThuan(d.soLuong)) > d.conTraDuoc ? "loi" : undefined}
                    />
                  </td>
                  {!doiMay && (
                    <>
                      <td>
                        <input
                          type="text"
                          inputMode="numeric"
                          aria-label={`Đơn giá dòng ${i + 1}`}
                          value={d.donGia}
                          onChange={(e) => sua(i, { donGia: dinhDangNhapTien(e.target.value) })}
                        />
                      </td>
                      <td>
                        <input
                          type="text"
                          inputMode="numeric"
                          aria-label={`VAT dòng ${i + 1}`}
                          value={d.vat}
                          onChange={(e) => sua(i, { vat: e.target.value })}
                        />
                      </td>
                    </>
                  )}
                  <td>
                    <select
                      aria-label={`Tình trạng hàng dòng ${i + 1}`}
                      value={d.tinhTrang}
                      onChange={(e) => doiTinhTrang(i, e.target.value as "con-tot" | "loi")}
                    >
                      <option value="con-tot">Còn tốt</option>
                      <option value="loi">Hàng lỗi</option>
                    </select>
                  </td>
                  <td>
                    <label className="o-chon">
                      <input
                        type="checkbox"
                        checked={d.nhapLaiKho}
                        onChange={(e) => sua(i, { nhapLaiKho: e.target.checked })}
                        aria-label={`Nhập lại kho dòng ${i + 1}`}
                      />
                      <span>Cộng tồn</span>
                    </label>
                    {d.tinhTrang === "loi" && d.nhapLaiKho && (
                      <input
                        type="text"
                        aria-label={`Vì sao vẫn nhập lại hàng lỗi dòng ${i + 1}`}
                        value={d.ghiChu}
                        onChange={(e) => sua(i, { ghiChu: e.target.value })}
                        placeholder="Vì sao vẫn nhập lại?"
                      />
                    )}
                  </td>
                  <td>
                    <input
                      type="text"
                      aria-label={`Sê-ri máy khách trả dòng ${i + 1}`}
                      value={d.serial}
                      onChange={(e) => sua(i, { serial: e.target.value })}
                      placeholder="Sê-ri, cách nhau bằng dấu phẩy"
                    />
                    {doiMay && (
                      <input
                        type="text"
                        aria-label={`Sê-ri máy thay thế dòng ${i + 1}`}
                        value={d.thayTheSerial}
                        onChange={(e) => sua(i, { thayTheSerial: e.target.value })}
                        placeholder="Sê-ri máy mới"
                        style={{ marginTop: 6 }}
                      />
                    )}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="nut trong nho"
                      onClick={() => datDong((c) => (c.length === 1 ? [dongTrong()] : c.filter((_, j) => j !== i)))}
                      aria-label={`Xóa dòng ${i + 1}`}
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ padding: "0 16px 16px" }}>
          <button type="button" className="nut trong nho" onClick={() => datDong((c) => [...c, dongTrong()])}>
            Thêm dòng
          </button>
        </div>

        {vuotSoLuong.length > 0 && (
          <div style={{ padding: "0 16px 16px" }}>
            <div className="hop-thong-bao loi" role="alert">
              Có dòng trả quá phần đơn đã giao: {vuotSoLuong.map((d) => d.ten).join(", ")}.
            </div>
          </div>
        )}
        {thieuThayThe.length > 0 && (
          <div style={{ padding: "0 16px 16px" }}>
            <div className="hop-thong-bao loi" role="alert">
              Phiếu đổi máy phải chọn máy giao thay thế cho từng dòng.
            </div>
          </div>
        )}
        {thieuGhiChuHangLoi.length > 0 && (
          <div style={{ padding: "0 16px 16px" }}>
            <div className="hop-thong-bao canh-bao" role="alert">
              Hàng lỗi mà vẫn cộng lại tồn thì phải ghi rõ vì sao — nếu không, hàng hỏng sẽ nằm trên kệ bán.
            </div>
          </div>
        )}
      </div>

      <div className="chan-form">
        <div className="tong-form">
          {doiMay ? (
            <span>Đổi ngang — phiếu này không phát sinh tiền</span>
          ) : (
            <>
              Tạm tính {dinhDangTien(tong.tamTinh)} · VAT {dinhDangTien(tong.tongVat)} ·{" "}
              <strong>Tổng {dinhDangTien(tong.tongCong)}</strong>
            </>
          )}
        </div>
        <button className="nut chinh" type="submit" disabled={dangGui || thieu}>
          {dangGui ? "Đang lưu…" : "Lập phiếu"}
        </button>
      </div>
    </form>
  );
}
