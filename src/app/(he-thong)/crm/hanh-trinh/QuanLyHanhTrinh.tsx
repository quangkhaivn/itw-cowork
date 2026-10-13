"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useGoiApi } from "@/components/ui/goi-api";
import { dinhDangSo } from "@/lib/dinh-dang";

interface TrangThai {
  id: string;
  ten: string;
  mau: string;
  loai: string;
  soNgayDungLau: number | null;
  mocTuDong: string | null;
  nhanMoc: string | null;
  trangThai: string;
  soKhach: number;
  vao30Ngay: number;
}

interface GiaTriForm {
  ten: string;
  mau: string;
  loai: string;
  soNgayDungLau: string;
  mocTuDong: string;
}

const RONG: GiaTriForm = { ten: "", mau: "#2563EB", loai: "mo", soNgayDungLau: "", mocTuDong: "" };

/**
 * Danh mục trạng thái hành trình: kéo thả (hoặc nút lên/xuống trên điện thoại) để xếp thứ tự,
 * sửa tên / màu / loại / số ngày đứng lâu / mốc tự chuyển. Chỉ quản lý (`customer.approve`) mới
 * thấy nút; máy chủ kiểm lại.
 */
export default function QuanLyHanhTrinh({
  trangThai,
  quanLy,
  moc,
  nhanLoai,
}: {
  trangThai: TrangThai[];
  quanLy: boolean;
  moc: { ma: string; nhan: string }[];
  nhanLoai: Record<string, string>;
}) {
  const router = useRouter();
  const { goi, dangGui, loi } = useGoiApi();
  const [thuTu, datThuTu] = useState(trangThai.map((t) => t.id));
  const [keo, datKeo] = useState<string | null>(null);
  const [dich, datDich] = useState<string | null>(null);
  const [dangSua, datDangSua] = useState<string | null>(null);
  const [gt, datGt] = useState<GiaTriForm>(RONG);
  const [taoMoi, datTaoMoi] = useState(false);
  const theoId = new Map(trangThai.map((t) => [t.id, t]));
  const ds = thuTu.map((id) => theoId.get(id)).filter((t): t is TrangThai => Boolean(t));

  async function luuThuTu(moi: string[]) {
    datThuTu(moi);
    if (await goi("/api/v1/hanh-trinh/thu-tu", "POST", { ids: moi })) router.refresh();
    else datThuTu(trangThai.map((t) => t.id));
  }
  function doiCho(i: number, j: number) {
    if (j < 0 || j >= thuTu.length) return;
    const moi = [...thuTu];
    [moi[i], moi[j]] = [moi[j], moi[i]];
    luuThuTu(moi);
  }
  function tha(dichId: string) {
    if (!keo || keo === dichId) return;
    const moi = thuTu.filter((x) => x !== keo);
    moi.splice(moi.indexOf(dichId), 0, keo);
    datKeo(null);
    datDich(null);
    luuThuTu(moi);
  }

  const than = (g: GiaTriForm) => ({
    ten: g.ten,
    mau: g.mau,
    loai: g.loai,
    soNgayDungLau: g.soNgayDungLau.trim() ? Number(g.soNgayDungLau) : null,
    mocTuDong: g.mocTuDong || null,
  });
  async function luuSua(id: string) {
    if (await goi(`/api/v1/hanh-trinh/${id}`, "PATCH", than(gt))) {
      datDangSua(null);
      router.refresh();
    }
  }
  async function luuMoi() {
    if (await goi("/api/v1/hanh-trinh", "POST", than(gt))) {
      datTaoMoi(false);
      datGt(RONG);
      router.refresh();
    }
  }
  async function batTat(t: TrangThai) {
    if (await goi(`/api/v1/hanh-trinh/${t.id}`, "PATCH", { trangThai: t.trangThai === "hoat-dong" ? "ngung-hoat-dong" : "hoat-dong" })) router.refresh();
  }

  const form = (onLuu: () => void, onHuy: () => void) => (
    <div className="bo-loc" style={{ borderBottom: 0, padding: 0, width: "100%" }}>
      <div className="truong rong">
        <label htmlFor="ht-ten">Tên</label>
        <input id="ht-ten" value={gt.ten} onChange={(e) => datGt({ ...gt, ten: e.target.value })} maxLength={100} />
      </div>
      <div className="truong">
        <label htmlFor="ht-mau">Màu</label>
        <input id="ht-mau" type="color" value={gt.mau} onChange={(e) => datGt({ ...gt, mau: e.target.value })} />
      </div>
      <div className="truong">
        <label htmlFor="ht-loai">Loại</label>
        <select id="ht-loai" value={gt.loai} onChange={(e) => datGt({ ...gt, loai: e.target.value })}>
          {Object.entries(nhanLoai).map(([ma, nhan]) => (
            <option key={ma} value={ma}>
              {nhan}
            </option>
          ))}
        </select>
      </div>
      <div className="truong">
        <label htmlFor="ht-dung">Nhắc khi đứng quá (ngày)</label>
        <input id="ht-dung" type="number" min={1} max={365} value={gt.soNgayDungLau} placeholder="Không nhắc" onChange={(e) => datGt({ ...gt, soNgayDungLau: e.target.value })} disabled={gt.loai === "that-bai"} />
      </div>
      <div className="truong">
        <label htmlFor="ht-moc">Tự chuyển vào khi</label>
        <select id="ht-moc" value={gt.mocTuDong} onChange={(e) => datGt({ ...gt, mocTuDong: e.target.value })} disabled={gt.loai === "that-bai"}>
          <option value="">— Chỉ đổi tay —</option>
          {moc.map((m) => (
            <option key={m.ma} value={m.ma}>
              {m.nhan}
            </option>
          ))}
        </select>
      </div>
      <button type="button" className="nut chinh" onClick={onLuu} disabled={dangGui || !gt.ten.trim()}>
        Lưu
      </button>
      <button type="button" className="nut trong" onClick={onHuy}>
        Hủy
      </button>
    </div>
  );

  return (
    <>
      {loi && (
        <div className="hop-thong-bao loi" role="alert" style={{ margin: "12px 16px" }}>
          {loi.thongBao}
        </div>
      )}
      <ul className="ds-keo">
        {ds.map((t, i) => (
          <li
            key={t.id}
            draggable={quanLy && dangSua === null}
            className={`${keo === t.id ? "dang-keo" : ""} ${dich === t.id && keo !== t.id ? "dich-tha" : ""}`}
            onDragStart={() => datKeo(t.id)}
            onDragEnd={() => {
              datKeo(null);
              datDich(null);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              datDich(t.id);
            }}
            onDrop={(e) => {
              e.preventDefault();
              tha(t.id);
            }}
          >
            {dangSua === t.id ? (
              form(() => luuSua(t.id), () => datDangSua(null))
            ) : (
              <>
                {quanLy && <span className="tay-keo" aria-hidden="true">⠿</span>}
                <span className="cham-mau" style={{ "--mau": t.mau, width: 14, height: 14 } as React.CSSProperties} />
                <div className="thong-tin">
                  <strong>{t.ten}</strong> {t.trangThai !== "hoat-dong" && <span className="huy-hieu">Ngừng dùng</span>}{" "}
                  <span className={`huy-hieu ${t.loai === "thanh-cong" ? "tot" : t.loai === "that-bai" ? "loi" : ""}`}>{nhanLoai[t.loai] ?? t.loai}</span>
                  <div className="dong-phu">
                    {t.nhanMoc ? `Tự chuyển vào khi: ${t.nhanMoc}` : "Chỉ đổi tay"} ·{" "}
                    {t.soNgayDungLau ? `nhắc khi đứng quá ${t.soNgayDungLau} ngày` : "chưa đặt số ngày đứng lâu"}
                  </div>
                </div>
                <Link className="so" href={`/crm/khach-hang?xem=tat-ca&hanhTrinh=${t.id}`} title="Xem danh sách khách">
                  {dinhDangSo(t.soKhach)} khách
                </Link>
                <span className="phu nho" title="Số lần khách được chuyển vào trạng thái này trong 30 ngày qua">+{dinhDangSo(t.vao30Ngay)} / 30 ngày</span>
                {quanLy && (
                  <span className="tac-vu">
                    <button type="button" className="nut nho trong" aria-label={`Đưa ${t.ten} lên`} onClick={() => doiCho(i, i - 1)} disabled={dangGui || i === 0}>
                      ↑
                    </button>
                    <button type="button" className="nut nho trong" aria-label={`Đưa ${t.ten} xuống`} onClick={() => doiCho(i, i + 1)} disabled={dangGui || i === ds.length - 1}>
                      ↓
                    </button>
                    <button
                      type="button"
                      className="nut nho"
                      onClick={() => {
                        datTaoMoi(false);
                        datDangSua(t.id);
                        datGt({ ten: t.ten, mau: t.mau, loai: t.loai, soNgayDungLau: t.soNgayDungLau ? String(t.soNgayDungLau) : "", mocTuDong: t.mocTuDong ?? "" });
                      }}
                    >
                      Sửa
                    </button>
                    <button type="button" className="nut nho trong" onClick={() => batTat(t)} disabled={dangGui}>
                      {t.trangThai === "hoat-dong" ? "Ngừng dùng" : "Dùng lại"}
                    </button>
                  </span>
                )}
              </>
            )}
          </li>
        ))}
        {quanLy && (
          <li>
            {taoMoi ? (
              form(luuMoi, () => datTaoMoi(false))
            ) : (
              <button
                type="button"
                className="nut nho"
                onClick={() => {
                  datDangSua(null);
                  datGt(RONG);
                  datTaoMoi(true);
                }}
              >
                + Thêm trạng thái
              </button>
            )}
          </li>
        )}
      </ul>
      {quanLy && <p className="phu nho" style={{ padding: "8px 16px" }}>Kéo thả để xếp thứ tự (trên điện thoại dùng nút ↑ ↓). Tự chuyển chỉ đi TIẾN theo thứ tự này, không bao giờ lùi.</p>}
    </>
  );
}
