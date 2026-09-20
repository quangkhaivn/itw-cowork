"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { loiCua, useGoiApi, type LoiApi } from "@/components/ui/goi-api";
import ONhapTien, { dinhDangNhapTien } from "@/components/crm/ONhapTien";

export interface LuaChonSanPham {
  nhom: { id: string; ma: string; ten: string; chaId: string | null; batBuocSerial: boolean; baoHanhMacDinh: number | null; vatMacDinh: string | null }[];
  thuongHieu: { id: string; ten: string }[];
  donViTinh: { ma: string; ten: string }[];
  nhaCungCap: { id: string; ma: string; ten: string }[];
}

export interface GiaTriSanPham {
  id?: string;
  sku: string;
  ten: string;
  nhomId: string;
  thuongHieuId: string;
  model: string;
  donViTinh: string;
  giaVon: string;
  giaBan: string;
  vat: string;
  baoHanhThang: string;
  batBuocSerial: boolean;
  nhaCungCapMacDinhId: string;
  moTa: string;
  thongSo: [string, string][];
  trangThai: string;
}

function LoiTruong({ loi, truong }: { loi: LoiApi | null; truong: string }) {
  const tb = loiCua(loi, truong);
  return tb ? <span className="loi-truong">{tb}</span> : null;
}

/** Form tạo / sửa sản phẩm. Chọn nhóm thì tự điền bảo hành, VAT và yêu cầu số sê-ri của nhóm. */
export default function FormSanPham({ banDau, luaChon }: { banDau: GiaTriSanPham; luaChon: LuaChonSanPham }) {
  const router = useRouter();
  const laTaoMoi = !banDau.id;
  const { goi, dangGui, loi } = useGoiApi();
  const [gt, datGt] = useState({ ...banDau, giaVon: dinhDangNhapTien(banDau.giaVon), giaBan: dinhDangNhapTien(banDau.giaBan) });
  const [daLuu, datDaLuu] = useState(false);
  const dat = <K extends keyof GiaTriSanPham>(k: K, v: GiaTriSanPham[K]) => {
    datGt((c) => ({ ...c, [k]: v }));
    datDaLuu(false);
  };

  function chonNhom(id: string) {
    const n = luaChon.nhom.find((x) => x.id === id);
    datGt((c) => ({
      ...c,
      nhomId: id,
      // Chỉ điền hộ khi ô đang trống — không đè giá trị người dùng đã nhập.
      baoHanhThang: c.baoHanhThang || (n?.baoHanhMacDinh != null ? String(n.baoHanhMacDinh) : ""),
      vat: c.vat || (n?.vatMacDinh ?? ""),
      batBuocSerial: laTaoMoi ? (n?.batBuocSerial ?? c.batBuocSerial) : c.batBuocSerial,
    }));
    datDaLuu(false);
  }

  async function gui(e: React.FormEvent) {
    e.preventDefault();
    const than = {
      sku: gt.sku,
      ten: gt.ten,
      nhomId: gt.nhomId,
      thuongHieuId: gt.thuongHieuId,
      model: gt.model,
      donViTinh: gt.donViTinh,
      giaVon: gt.giaVon,
      giaBan: gt.giaBan,
      ...(gt.vat !== "" && { vat: Number(gt.vat) }),
      baoHanhThang: gt.baoHanhThang,
      batBuocSerial: gt.batBuocSerial,
      nhaCungCapMacDinhId: gt.nhaCungCapMacDinhId,
      moTa: gt.moTa,
      thongSo: Object.fromEntries(gt.thongSo.filter(([k]) => k.trim()).map(([k, v]) => [k.trim(), v])),
      ...(laTaoMoi ? {} : { trangThai: gt.trangThai }),
    };
    if (laTaoMoi) {
      const kq = await goi<{ id: string }>("/api/v1/san-pham", "POST", than);
      if (kq) router.push(`/san-pham/${kq.id}?moTao=1`);
    } else {
      const kq = await goi(`/api/v1/san-pham/${banDau.id}`, "PATCH", than);
      if (kq) {
        datDaLuu(true);
        router.refresh();
      }
    }
  }

  const aria = (t: string) => (loiCua(loi, t) ? { "aria-invalid": true as const } : {});
  const nhanNhom = (n: LuaChonSanPham["nhom"][number]) => (n.chaId ? `— ${n.ten}` : n.ten);

  return (
    <form className="the" onSubmit={gui} noValidate>
      {(loi || daLuu) && (
        <div style={{ padding: "16px 16px 0" }}>
          {loi && <div className="hop-thong-bao loi" role="alert">{loi.thongBao}</div>}
          {daLuu && <div className="hop-thong-bao tot" role="status">Đã lưu thay đổi.</div>}
        </div>
      )}

      <div className="phan-form">
        <h3>Thông tin sản phẩm</h3>
        <div className="luoi-form">
          <div className="truong">
            <label htmlFor="sp-sku">
              SKU <span className="bat-buoc">*</span>
            </label>
            <input id="sp-sku" type="text" value={gt.sku} onChange={(e) => dat("sku", e.target.value)} placeholder="LAP-DELL-3420" {...aria("sku")} />
            <span className={loiCua(loi, "sku") ? "loi-truong" : "goi-y"}>
              {loiCua(loi, "sku") ?? "Mã riêng của sản phẩm. Không phân biệt hoa thường khi kiểm trùng."}
            </span>
          </div>
          <div className="truong">
            <label htmlFor="sp-model">Model</label>
            <input id="sp-model" type="text" value={gt.model} onChange={(e) => dat("model", e.target.value)} />
          </div>
          <div className="truong ca-dong">
            <label htmlFor="sp-ten">
              Tên sản phẩm <span className="bat-buoc">*</span>
            </label>
            <input id="sp-ten" type="text" value={gt.ten} onChange={(e) => dat("ten", e.target.value)} {...aria("ten")} />
            <LoiTruong loi={loi} truong="ten" />
          </div>
          <div className="truong">
            <label htmlFor="sp-nhom">Nhóm</label>
            <select id="sp-nhom" value={gt.nhomId} onChange={(e) => chonNhom(e.target.value)} {...aria("nhomId")}>
              <option value="">— Chưa chọn —</option>
              {luaChon.nhom.map((n) => (
                <option key={n.id} value={n.id}>
                  {nhanNhom(n)}
                </option>
              ))}
            </select>
            <LoiTruong loi={loi} truong="nhomId" />
          </div>
          <div className="truong">
            <label htmlFor="sp-th">Thương hiệu</label>
            <select id="sp-th" value={gt.thuongHieuId} onChange={(e) => dat("thuongHieuId", e.target.value)} {...aria("thuongHieuId")}>
              <option value="">— Chưa chọn —</option>
              {luaChon.thuongHieu.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.ten}
                </option>
              ))}
            </select>
            <LoiTruong loi={loi} truong="thuongHieuId" />
          </div>
          <div className="truong">
            <label htmlFor="sp-dvt">Đơn vị tính</label>
            <select id="sp-dvt" value={gt.donViTinh} onChange={(e) => dat("donViTinh", e.target.value)} {...aria("donViTinh")}>
              <option value="">— Chưa chọn —</option>
              {luaChon.donViTinh.map((d) => (
                <option key={d.ma} value={d.ma}>
                  {d.ten}
                </option>
              ))}
            </select>
            <LoiTruong loi={loi} truong="donViTinh" />
          </div>
          <div className="truong">
            <label htmlFor="sp-ncc">Nhà cung cấp mặc định</label>
            <select id="sp-ncc" value={gt.nhaCungCapMacDinhId} onChange={(e) => dat("nhaCungCapMacDinhId", e.target.value)} {...aria("nhaCungCapMacDinhId")}>
              <option value="">— Chưa chọn —</option>
              {luaChon.nhaCungCap.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.ten}
                </option>
              ))}
            </select>
            <LoiTruong loi={loi} truong="nhaCungCapMacDinhId" />
          </div>
        </div>
      </div>

      <div className="phan-form">
        <h3>Giá và bảo hành</h3>
        <div className="luoi-form">
          <div className="truong">
            <label htmlFor="sp-giavon">Giá vốn tham chiếu</label>
            <ONhapTien id="sp-giavon" giaTri={gt.giaVon} datGiaTri={(v) => dat("giaVon", v)} />
            <span className="goi-y">Giá nhập chuẩn. Giá theo từng nhà cung cấp nhập ở bảng giá bên dưới.</span>
          </div>
          <div className="truong">
            <label htmlFor="sp-giaban">Giá bán</label>
            <ONhapTien id="sp-giaban" giaTri={gt.giaBan} datGiaTri={(v) => dat("giaBan", v)} />
            <LoiTruong loi={loi} truong="giaBan" />
          </div>
          <div className="truong">
            <label htmlFor="sp-vat">Thuế suất (%)</label>
            <input id="sp-vat" type="number" min={0} max={100} step="0.5" value={gt.vat} onChange={(e) => dat("vat", e.target.value)} {...aria("vat")} />
            <LoiTruong loi={loi} truong="vat" />
          </div>
          <div className="truong">
            <label htmlFor="sp-bh">Bảo hành (tháng)</label>
            <input id="sp-bh" type="number" min={0} max={600} value={gt.baoHanhThang} onChange={(e) => dat("baoHanhThang", e.target.value)} {...aria("baoHanhThang")} />
            <LoiTruong loi={loi} truong="baoHanhThang" />
          </div>
          <div className="truong">
            <label className="o-chon" style={{ marginTop: 22 }}>
              <input type="checkbox" checked={gt.batBuocSerial} onChange={(e) => dat("batBuocSerial", e.target.checked)} />
              <span>
                Quản lý số sê-ri
                <small>Bật cho laptop, PC, server, camera — dùng khi nhập/xuất kho ở Phase 5.</small>
              </span>
            </label>
          </div>
          {!laTaoMoi && (
            <div className="truong">
              <label htmlFor="sp-tt">Trạng thái</label>
              <select id="sp-tt" value={gt.trangThai} onChange={(e) => dat("trangThai", e.target.value)}>
                <option value="hoat-dong">Đang kinh doanh</option>
                <option value="ngung-kinh-doanh">Ngừng kinh doanh</option>
              </select>
            </div>
          )}
        </div>
      </div>

      <div className="phan-form">
        <h3>Mô tả và thông số kỹ thuật</h3>
        <div className="truong">
          <label htmlFor="sp-mota">Mô tả</label>
          <textarea id="sp-mota" rows={3} value={gt.moTa} onChange={(e) => dat("moTa", e.target.value)} />
        </div>
        <div className="bang-thong-so">
          {gt.thongSo.map(([k, v], i) => (
            <div className="hang-nhap" key={i}>
              <input
                type="text"
                aria-label={`Tên thông số ${i + 1}`}
                placeholder="CPU"
                value={k}
                onChange={(e) => dat("thongSo", gt.thongSo.map((x, j) => (j === i ? [e.target.value, x[1]] : x)) as [string, string][])}
              />
              <input
                type="text"
                aria-label={`Giá trị thông số ${i + 1}`}
                placeholder="i5-1235U"
                value={v}
                onChange={(e) => dat("thongSo", gt.thongSo.map((x, j) => (j === i ? [x[0], e.target.value] : x)) as [string, string][])}
              />
              <button type="button" className="nut nho" onClick={() => dat("thongSo", gt.thongSo.filter((_, j) => j !== i))}>
                Xóa
              </button>
            </div>
          ))}
          <button type="button" className="nut nho" onClick={() => dat("thongSo", [...gt.thongSo, ["", ""]])}>
            + Thêm thông số
          </button>
        </div>
      </div>

      <div className="chan-form">
        <button type="button" className="nut" onClick={() => router.push(laTaoMoi ? "/san-pham" : `/san-pham/${banDau.id}`)}>
          {laTaoMoi ? "Hủy" : "Quay lại"}
        </button>
        <button type="submit" className="nut chinh" disabled={dangGui || gt.sku.trim().length < 1 || gt.ten.trim().length < 2}>
          {dangGui ? "Đang lưu…" : laTaoMoi ? "Tạo sản phẩm" : "Lưu thay đổi"}
        </button>
      </div>
    </form>
  );
}
