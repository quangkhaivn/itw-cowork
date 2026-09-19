"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import HopThoai from "@/components/ui/HopThoai";
import { loiCua, useGoiApi } from "@/components/ui/goi-api";
import ChonKhachHang, { type KhachDaChon } from "@/components/crm/ChonKhachHang";
import DanhSachTrung, { type UngVienTrung } from "@/components/crm/DanhSachTrung";
import ONhapTien, { dinhDangNhapTien } from "@/components/crm/ONhapTien";

type LuaChon = Record<string, { ma: string; ten: string }[]>;

interface LeadTomTat {
  id: string;
  ma: string;
  hoTen: string;
  congTy: string | null;
  maSoThue: string | null;
  nhuCau: string | null;
  giaTriUocTinh: string | null;
  giaiDoan: string;
}

function ngayMai(): string {
  return new Date(Date.now() + 7 * 3600_000 + 86_400_000).toISOString().slice(0, 10);
}

/**
 * Các thao tác trên lead: đổi giai đoạn, loại, mở lại, chuyển đổi (LD-01, LD-05).
 * Chuyển đổi chạy trong một giao dịch ở máy chủ — lỗi thì không có gì được ghi.
 */
export default function TacVuLead({
  lead,
  quyen,
  luaChon,
}: {
  lead: LeadTomTat;
  quyen: { sua: boolean; moLaiLeadDaLoai: boolean; chuyenDoi: boolean; taoKhachMoi: boolean; taoCoHoi: boolean };
  luaChon: LuaChon;
}) {
  const router = useRouter();
  const hopLoai = useRef<HTMLDialogElement>(null);
  const hopCd = useRef<HTMLDialogElement>(null);
  const { goi, dangGui, loi, datLoi } = useGoiApi();
  // Đổi giai đoạn dùng một bộ gọi riêng để lỗi của nó hiện trên thẻ, không lẫn vào hộp thoại.
  const gd = useGoiApi();
  const [lyDo, datLyDo] = useState("");

  const [cachKhach, datCachKhach] = useState<"moi" | "co-san">(quyen.taoKhachMoi ? "moi" : "co-san");
  const [khachCoSan, datKhachCoSan] = useState<KhachDaChon | null>(null);
  const [khachMoi, datKhachMoi] = useState({ ten: lead.congTy || lead.hoTen, maSoThue: lead.maSoThue ?? "", phanKhuc: "", loaiKhach: "", diaChi: "" });
  const [taoLienHe, datTaoLienHe] = useState(true);
  const [taoCoHoi, datTaoCoHoi] = useState(quyen.taoCoHoi);
  const [coHoi, datCoHoi] = useState({
    tieuDe: lead.nhuCau ? lead.nhuCau.slice(0, 120) : `Nhu cầu của ${lead.congTy || lead.hoTen}`,
    giaTri: dinhDangNhapTien(lead.giaTriUocTinh ?? ""),
    ngayDuKienChot: "",
    hanhDongKeTiep: "",
    ngayHanhDong: ngayMai(),
  });
  const [xacNhan, datXacNhan] = useState(false);

  async function doiGiaiDoan(giaiDoan: string) {
    const kq = await gd.goi(`/api/v1/lead/${lead.id}`, "PATCH", { giaiDoan });
    if (kq) router.refresh();
  }

  async function loai(e: React.FormEvent) {
    e.preventDefault();
    const kq = await goi(`/api/v1/lead/${lead.id}/loai`, "POST", { lyDo });
    if (kq) {
      hopLoai.current?.close();
      router.refresh();
    }
  }

  async function chuyenDoi(e: React.FormEvent) {
    e.preventDefault();
    const kq = await goi<{ khachHangId: string; coHoiId: string | null }>(`/api/v1/lead/${lead.id}/chuyen-doi`, "POST", {
      khachHangId: cachKhach === "co-san" ? (khachCoSan?.id ?? "") : "",
      khachMoi: cachKhach === "moi" ? khachMoi : null,
      taoLienHe,
      coHoi: taoCoHoi ? coHoi : null,
      xacNhanKhongTrung: xacNhan,
    });
    if (kq) {
      hopCd.current?.close();
      router.push(kq.coHoiId ? `/ban-hang/co-hoi/${kq.coHoiId}?tuLead=1` : `/crm/khach-hang/${kq.khachHangId}`);
    }
  }

  const uv = (loi?.chiTiet as { ungVien?: UngVienTrung[] } | undefined)?.ungVien ?? [];
  const dangMo = ["NEW_LEAD", "CONTACTED", "QUALIFIED"].includes(lead.giaiDoan);

  return (
    <section className="the">
      <div className="dau">
        <h2>Xử lý lead</h2>
      </div>
      <div className="than">
        {gd.loi && <div className="hop-thong-bao loi" role="alert">{gd.loi.thongBao}</div>}
        {quyen.sua && dangMo && (
          <div className="truong">
            <label htmlFor="ld-gd">Giai đoạn</label>
            <select id="ld-gd" value={lead.giaiDoan} onChange={(e) => doiGiaiDoan(e.target.value)} disabled={gd.dangGui}>
              <option value="NEW_LEAD">Lead mới</option>
              <option value="CONTACTED">Đã liên hệ</option>
              <option value="QUALIFIED">Đủ điều kiện</option>
            </select>
            <span className="goi-y">Ghi tương tác đầu tiên sẽ tự chuyển sang “Đã liên hệ”.</span>
          </div>
        )}
        <div className="hanh-dong">
          {quyen.chuyenDoi && (
            <button
              className="nut chinh"
              onClick={() => {
                datLoi(null);
                datXacNhan(false);
                hopCd.current?.showModal();
              }}
            >
              Chuyển đổi thành khách hàng
            </button>
          )}
          {quyen.sua && dangMo && (
            <button
              className="nut nguy-hiem"
              onClick={() => {
                datLoi(null);
                hopLoai.current?.showModal();
              }}
            >
              Loại lead
            </button>
          )}
          {quyen.moLaiLeadDaLoai && (
            <button className="nut" onClick={() => doiGiaiDoan("NEW_LEAD")} disabled={gd.dangGui}>
              Mở lại lead
            </button>
          )}
        </div>
        {!quyen.sua && !quyen.moLaiLeadDaLoai && <p className="phu">Bạn chỉ xem được lead này.</p>}
      </div>

      <HopThoai ref={hopLoai} tieuDe={`Loại lead ${lead.ma}`}>
        <form onSubmit={loai} noValidate>
          <div className="than">
            {loi && <div className="hop-thong-bao loi" role="alert">{loi.thongBao}</div>}
            <div className="truong">
              <label htmlFor="ld-lydo">
                Lý do <span className="bat-buoc">*</span>
              </label>
              <textarea id="ld-lydo" rows={3} value={lyDo} onChange={(e) => datLyDo(e.target.value)} placeholder="Ví dụ: số ảo, không có nhu cầu, trùng khách cũ…" />
              {loiCua(loi, "lyDo") && <span className="loi-truong">{loiCua(loi, "lyDo")}</span>}
            </div>
            <p className="phu">Lead bị loại không bị xóa; mở lại được khi khách quay lại.</p>
          </div>
          <div className="chan-form">
            <button type="button" className="nut" onClick={() => hopLoai.current?.close()}>
              Hủy
            </button>
            <button type="submit" className="nut nguy-hiem" disabled={dangGui || lyDo.trim().length < 3}>
              Loại lead
            </button>
          </div>
        </form>
      </HopThoai>

      <HopThoai ref={hopCd} tieuDe={`Chuyển đổi ${lead.ma}`} rong={680}>
        <form onSubmit={chuyenDoi} noValidate>
          <div className="than">
            {loi && loi.ma !== "co-the-trung" && <div className="hop-thong-bao loi" role="alert">{loi.thongBao}</div>}
            <DanhSachTrung ungVien={uv} chan={loi?.ma === "trung-ma-so-thue"} />
            {loi?.ma === "co-the-trung" && (
              <label className="o-chon" style={{ marginBottom: 12 }}>
                <input type="checkbox" checked={xacNhan} onChange={(e) => datXacNhan(e.target.checked)} />
                <span>
                  Đây là khách hàng mới, vẫn tạo.
                  <small>Nếu là khách cũ, chọn “Gắn vào khách đã có” bên dưới.</small>
                </span>
              </label>
            )}

            <h3>1. Khách hàng</h3>
            <div className="chuoi-lua-chon">
              {quyen.taoKhachMoi && (
                <label className="o-chon">
                  <input type="radio" name="cachKhach" checked={cachKhach === "moi"} onChange={() => datCachKhach("moi")} />
                  <span>Tạo khách hàng mới</span>
                </label>
              )}
              <label className="o-chon">
                <input type="radio" name="cachKhach" checked={cachKhach === "co-san"} onChange={() => datCachKhach("co-san")} />
                <span>Gắn vào khách đã có</span>
              </label>
            </div>
            {cachKhach === "moi" ? (
              <div className="luoi-form" style={{ marginTop: 10 }}>
                <div className="truong ca-dong">
                  <label htmlFor="cd-ten">
                    Tên khách hàng <span className="bat-buoc">*</span>
                  </label>
                  <input id="cd-ten" type="text" value={khachMoi.ten} onChange={(e) => datKhachMoi({ ...khachMoi, ten: e.target.value })} />
                </div>
                <div className="truong">
                  <label htmlFor="cd-mst">Mã số thuế</label>
                  <input id="cd-mst" type="text" value={khachMoi.maSoThue} onChange={(e) => datKhachMoi({ ...khachMoi, maSoThue: e.target.value })} />
                  {loiCua(loi, "maSoThue") && <span className="loi-truong">{loiCua(loi, "maSoThue")}</span>}
                </div>
                <div className="truong">
                  <label htmlFor="cd-pk">Phân khúc</label>
                  <select id="cd-pk" value={khachMoi.phanKhuc} onChange={(e) => datKhachMoi({ ...khachMoi, phanKhuc: e.target.value })}>
                    <option value="">— Chưa chọn —</option>
                    {(luaChon.phan_khuc_khach_hang ?? []).map((p) => (
                      <option key={p.ma} value={p.ma}>
                        {p.ten}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="truong">
                  <label htmlFor="cd-loai">Loại khách</label>
                  <select id="cd-loai" value={khachMoi.loaiKhach} onChange={(e) => datKhachMoi({ ...khachMoi, loaiKhach: e.target.value })}>
                    <option value="">— Chưa chọn —</option>
                    {(luaChon.loai_khach_hang ?? []).map((p) => (
                      <option key={p.ma} value={p.ma}>
                        {p.ten}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="truong">
                  <label htmlFor="cd-dc">Địa chỉ</label>
                  <input id="cd-dc" type="text" value={khachMoi.diaChi} onChange={(e) => datKhachMoi({ ...khachMoi, diaChi: e.target.value })} />
                </div>
              </div>
            ) : (
              <div className="truong" style={{ marginTop: 10 }}>
                <ChonKhachHang id="cd-khach" giaTri={khachCoSan} datGiaTri={datKhachCoSan} loi={loiCua(loi, "khachHangId")} />
                {loiCua(loi, "khachHangId") && <span className="loi-truong">{loiCua(loi, "khachHangId")}</span>}
              </div>
            )}

            <h3 style={{ marginTop: 12 }}>2. Người liên hệ</h3>
            <label className="o-chon">
              <input type="checkbox" checked={taoLienHe} onChange={(e) => datTaoLienHe(e.target.checked)} />
              <span>Tạo người liên hệ “{lead.hoTen}” cho khách hàng</span>
            </label>

            {quyen.taoCoHoi && (
              <>
                <h3 style={{ marginTop: 12 }}>3. Cơ hội</h3>
                <label className="o-chon">
                  <input type="checkbox" checked={taoCoHoi} onChange={(e) => datTaoCoHoi(e.target.checked)} />
                  <span>Tạo cơ hội bán hàng</span>
                </label>
                {taoCoHoi && (
                  <div className="luoi-form" style={{ marginTop: 10 }}>
                    <div className="truong ca-dong">
                      <label htmlFor="cd-ch-td">
                        Tiêu đề <span className="bat-buoc">*</span>
                      </label>
                      <input id="cd-ch-td" type="text" value={coHoi.tieuDe} onChange={(e) => datCoHoi({ ...coHoi, tieuDe: e.target.value })} />
                      {loiCua(loi, "coHoi") && <span className="loi-truong">{loiCua(loi, "coHoi")}</span>}
                    </div>
                    <div className="truong">
                      <label htmlFor="cd-ch-gt">Giá trị ước tính</label>
                      <ONhapTien id="cd-ch-gt" giaTri={coHoi.giaTri} datGiaTri={(v) => datCoHoi({ ...coHoi, giaTri: v })} />
                    </div>
                    <div className="truong">
                      <label htmlFor="cd-ch-ngay">Dự kiến chốt</label>
                      <input id="cd-ch-ngay" type="date" value={coHoi.ngayDuKienChot} onChange={(e) => datCoHoi({ ...coHoi, ngayDuKienChot: e.target.value })} />
                    </div>
                    <div className="truong">
                      <label htmlFor="cd-ch-hd">
                        Hành động kế tiếp <span className="bat-buoc">*</span>
                      </label>
                      <input id="cd-ch-hd" type="text" value={coHoi.hanhDongKeTiep} onChange={(e) => datCoHoi({ ...coHoi, hanhDongKeTiep: e.target.value })} placeholder="Ví dụ: gửi cấu hình đề xuất" />
                    </div>
                    <div className="truong">
                      <label htmlFor="cd-ch-nhd">
                        Ngày thực hiện <span className="bat-buoc">*</span>
                      </label>
                      <input id="cd-ch-nhd" type="date" value={coHoi.ngayHanhDong} onChange={(e) => datCoHoi({ ...coHoi, ngayHanhDong: e.target.value })} />
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
          <div className="chan-form">
            <button type="button" className="nut" onClick={() => hopCd.current?.close()}>
              Hủy
            </button>
            <button
              type="submit"
              className="nut chinh"
              disabled={
                dangGui ||
                (cachKhach === "co-san" && !khachCoSan) ||
                (cachKhach === "moi" && khachMoi.ten.trim().length < 2) ||
                (taoCoHoi && (coHoi.tieuDe.trim().length < 3 || coHoi.hanhDongKeTiep.trim().length < 3 || !coHoi.ngayHanhDong)) ||
                (loi?.ma === "co-the-trung" && !xacNhan)
              }
            >
              {dangGui ? "Đang chuyển đổi…" : "Chuyển đổi"}
            </button>
          </div>
        </form>
      </HopThoai>
    </section>
  );
}
