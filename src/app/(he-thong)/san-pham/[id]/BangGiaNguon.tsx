"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import HopThoai from "@/components/ui/HopThoai";
import BieuTuong from "@/components/ui/BieuTuong";
import TrongRong from "@/components/ui/TrongRong";
import { loiCua, useGoiApi } from "@/components/ui/goi-api";
import ONhapTien, { dinhDangNhapTien } from "@/components/crm/ONhapTien";
import { dinhDangNgayGio, dinhDangTien } from "@/lib/dinh-dang";
import { NHAN_TRANG_THAI_HANG, TRANG_THAI_HANG } from "@/modules/san-pham/chuan-hoa";

interface DongGia {
  id: string;
  giaMua: string;
  tinhTrang: string;
  soNgayGiao: number | null;
  thamChieu: string | null;
  ghiChu: string | null;
  trangThai: string;
  capNhatLuc: Date;
  laNenMua: boolean;
  nhaCungCap: { id: string; ma: string; ten: string; trangThai: string };
}

const LOP_TINH_TRANG: Record<string, string> = { "con-hang": "tot", "het-hang": "loi", "dat-truoc": "canh-bao", "khong-ro": "" };

/**
 * Bảng giá của một sản phẩm theo từng nhà cung cấp (mục 9 prompt).
 * Nguồn "nên mua" do máy chủ tính: còn hàng trước, rồi giá thấp, rồi giao nhanh.
 */
export default function BangGiaNguon({
  sanPhamId,
  giaNguon,
  nhaCungCap,
  duocSua,
  xemNhaCungCap,
}: {
  sanPhamId: string;
  giaNguon: DongGia[];
  nhaCungCap: { id: string; ma: string; ten: string }[];
  duocSua: boolean;
  xemNhaCungCap: boolean;
}) {
  const router = useRouter();
  const hop = useRef<HTMLDialogElement>(null);
  const { goi, dangGui, loi, datLoi } = useGoiApi();
  const rong = { nhaCungCapId: "", giaMua: "", tinhTrang: "con-hang", soNgayGiao: "", thamChieu: "", ghiChu: "", lyDo: "" };
  const [gt, datGt] = useState(rong);
  const [dangSuaTen, datDangSuaTen] = useState<string | null>(null);

  function mo(d?: DongGia) {
    datLoi(null);
    datDangSuaTen(d ? d.nhaCungCap.ten : null);
    datGt(
      d
        ? {
            nhaCungCapId: d.nhaCungCap.id,
            giaMua: dinhDangNhapTien(d.giaMua),
            tinhTrang: d.tinhTrang,
            soNgayGiao: d.soNgayGiao != null ? String(d.soNgayGiao) : "",
            thamChieu: d.thamChieu ?? "",
            ghiChu: d.ghiChu ?? "",
            lyDo: "",
          }
        : rong,
    );
    hop.current?.showModal();
  }

  async function gui(e: React.FormEvent) {
    e.preventDefault();
    const kq = await goi(`/api/v1/san-pham/${sanPhamId}/gia`, "POST", gt);
    if (kq) {
      hop.current?.close();
      router.refresh();
    }
  }

  async function go(d: DongGia) {
    if (!window.confirm(`Gỡ ${d.nhaCungCap.ten} khỏi bảng giá sản phẩm này? Lịch sử giá vẫn giữ nguyên.`)) return;
    const kq = await goi(`/api/v1/gia-nguon/${d.id}`, "DELETE");
    if (kq) router.refresh();
  }

  const dangDung = giaNguon.filter((g) => g.trangThai === "hoat-dong");
  const daGo = giaNguon.filter((g) => g.trangThai !== "hoat-dong");
  const chuaChon = nhaCungCap.filter((n) => !dangDung.some((g) => g.nhaCungCap.id === n.id));

  return (
    <section className="the">
      <div className="dau">
        <h2>Bảng giá theo nhà cung cấp</h2>
        {duocSua && (
          <button className="nut nho" onClick={() => mo()}>
            <BieuTuong ten="them" co={14} /> Thêm nguồn
          </button>
        )}
      </div>
      {loi && (
        <div className="than" style={{ paddingBottom: 0 }}>
          <div className="hop-thong-bao loi" role="alert">
            {loi.thongBao}
          </div>
        </div>
      )}

      {dangDung.length === 0 ? (
        <TrongRong tieuDe="Chưa có nguồn hàng nào">
          {duocSua ? "Thêm ít nhất một nhà cung cấp để biết giá vốn khi làm báo giá." : null}
        </TrongRong>
      ) : (
        <div className="cuon-ngang">
          <table className="bang">
            <thead>
              <tr>
                <th>Nhà cung cấp</th>
                <th className="so">Giá mua</th>
                <th>Tình trạng</th>
                <th className="an-tren-dt">Giao trong</th>
                <th className="an-tren-dt">Cập nhật</th>
                {duocSua && <th />}
              </tr>
            </thead>
            <tbody>
              {dangDung.map((g) => (
                <tr key={g.id}>
                  <td>
                    {xemNhaCungCap ? <Link href={`/san-pham/nha-cung-cap/${g.nhaCungCap.id}`}>{g.nhaCungCap.ten}</Link> : g.nhaCungCap.ten}
                    {g.laNenMua && <span className="huy-hieu tot" style={{ marginLeft: 6 }}>Nên mua</span>}
                    <div className="dong-phu">
                      {g.nhaCungCap.ma}
                      {g.thamChieu ? ` · ${g.thamChieu}` : ""}
                    </div>
                  </td>
                  <td className="so">{dinhDangTien(g.giaMua)}</td>
                  <td>
                    <span className={`huy-hieu ${LOP_TINH_TRANG[g.tinhTrang] ?? ""}`}>{NHAN_TRANG_THAI_HANG[g.tinhTrang] ?? g.tinhTrang}</span>
                  </td>
                  <td className="an-tren-dt so">{g.soNgayGiao != null ? `${g.soNgayGiao} ngày` : "—"}</td>
                  <td className="an-tren-dt so nho">{dinhDangNgayGio(g.capNhatLuc)}</td>
                  {duocSua && (
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      <button className="nut nho" onClick={() => mo(g)} disabled={dangGui}>
                        Sửa giá
                      </button>{" "}
                      <button className="nut nho nguy-hiem" onClick={() => go(g)} disabled={dangGui}>
                        Gỡ
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {daGo.length > 0 && (
        <div className="than phu nho">Đã gỡ: {daGo.map((g) => g.nhaCungCap.ten).join(", ")} — lịch sử giá vẫn còn bên dưới.</div>
      )}

      <HopThoai ref={hop} tieuDe={dangSuaTen ? `Sửa giá — ${dangSuaTen}` : "Thêm nguồn hàng"} rong={560}>
        <form onSubmit={gui} noValidate>
          <div className="than">
            {loi && <div className="hop-thong-bao loi" role="alert">{loi.thongBao}</div>}
            <div className="truong">
              <label htmlFor="gn-ncc">
                Nhà cung cấp <span className="bat-buoc">*</span>
              </label>
              <select id="gn-ncc" value={gt.nhaCungCapId} onChange={(e) => datGt({ ...gt, nhaCungCapId: e.target.value })} disabled={Boolean(dangSuaTen)}>
                <option value="">— Chọn —</option>
                {(dangSuaTen ? nhaCungCap : chuaChon).map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.ten} ({n.ma})
                  </option>
                ))}
              </select>
              {loiCua(loi, "nhaCungCapId") && <span className="loi-truong">{loiCua(loi, "nhaCungCapId")}</span>}
              {!dangSuaTen && chuaChon.length === 0 && <span className="goi-y">Mọi nhà cung cấp đang hoạt động đều đã có giá cho sản phẩm này.</span>}
            </div>
            <div className="luoi-form">
              <div className="truong">
                <label htmlFor="gn-gia">
                  Giá mua <span className="bat-buoc">*</span>
                </label>
                <ONhapTien id="gn-gia" giaTri={gt.giaMua} datGiaTri={(v) => datGt({ ...gt, giaMua: v })} />
                {loiCua(loi, "giaMua") && <span className="loi-truong">{loiCua(loi, "giaMua")}</span>}
              </div>
              <div className="truong">
                <label htmlFor="gn-tt">Tình trạng</label>
                <select id="gn-tt" value={gt.tinhTrang} onChange={(e) => datGt({ ...gt, tinhTrang: e.target.value })}>
                  {TRANG_THAI_HANG.map((t) => (
                    <option key={t} value={t}>
                      {NHAN_TRANG_THAI_HANG[t]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="truong">
                <label htmlFor="gn-ngay">Giao trong (ngày)</label>
                <input id="gn-ngay" type="number" min={0} max={365} value={gt.soNgayGiao} onChange={(e) => datGt({ ...gt, soNgayGiao: e.target.value })} />
              </div>
              <div className="truong">
                <label htmlFor="gn-tc">Tham chiếu</label>
                <input id="gn-tc" type="text" value={gt.thamChieu} onChange={(e) => datGt({ ...gt, thamChieu: e.target.value })} placeholder="Mã báo giá của NCC" />
              </div>
            </div>
            <div className="truong">
              <label htmlFor="gn-lydo">Lý do đổi giá</label>
              <input id="gn-lydo" type="text" value={gt.lyDo} onChange={(e) => datGt({ ...gt, lyDo: e.target.value })} placeholder="Bảng giá tháng 10" />
              <span className="goi-y">Ghi vào lịch sử giá để sau này biết vì sao giá đổi.</span>
            </div>
            <div className="truong">
              <label htmlFor="gn-ghichu">Ghi chú</label>
              <textarea id="gn-ghichu" rows={2} value={gt.ghiChu} onChange={(e) => datGt({ ...gt, ghiChu: e.target.value })} />
            </div>
          </div>
          <div className="chan-form">
            <button type="button" className="nut" onClick={() => hop.current?.close()}>
              Hủy
            </button>
            <button type="submit" className="nut chinh" disabled={dangGui || !gt.nhaCungCapId || !gt.giaMua}>
              {dangGui ? "Đang lưu…" : "Lưu giá"}
            </button>
          </div>
        </form>
      </HopThoai>
    </section>
  );
}
