"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useGoiApi } from "@/components/ui/goi-api";
import { dinhDangNgay, dinhDangSo } from "@/lib/dinh-dang";
import { NHAN_TRANG_THAI_KHACH } from "@/modules/crm/hang-so";
import { NHAN_HANG, type HangDiem } from "@/modules/cham-diem/tinh-toan";
import type { MaCot } from "@/modules/khach-hang/danh-muc-loc";

export interface DongKhach {
  id: string;
  ma: string;
  ten: string;
  maSoThue: string | null;
  dienThoai: string | null;
  email: string | null;
  soLienHe: number;
  phanKhuc: string | null;
  nguon: string | null;
  nguoiPhuTrach: string;
  hanhTrinh: { id: string; ten: string; mau: string } | null;
  diem: number | null;
  hang: HangDiem | null;
  nhom: { id: string; ten: string; mau: string }[];
  soCoHoiMo: number;
  trangThai: string;
  tinhThanh: string | null;
  taoLuc: string;
}

const LOP_TRANG_THAI: Record<string, string> = { "tiem-nang": "chinh", "dang-giao-dich": "tot", "ngung-giao-dich": "", "da-gop": "" };

const THAO_TAC = [
  { ma: "doi-hanh-trinh", nhan: "Đổi trạng thái hành trình" },
  { ma: "gan-nhom", nhan: "Gắn vào nhóm" },
  { ma: "bo-nhom", nhan: "Gỡ khỏi nhóm" },
  { ma: "doi-phu-trach", nhan: "Đổi người phụ trách" },
] as const;

/**
 * Bảng khách hàng: cột theo tùy chọn của người dùng, đổi trạng thái hành trình ngay trên dòng,
 * chọn nhiều dòng để thao tác hàng loạt. Mọi thao tác gọi API — máy chủ kiểm quyền và phạm vi
 * (KHN-10); nút chỉ hiện để đỡ bấm nhầm.
 */
export default function BangKhachHang({
  dong,
  cot,
  trangThaiHT,
  nhom,
  nguoi,
  duocSua,
}: {
  dong: DongKhach[];
  cot: MaCot[];
  trangThaiHT: { id: string; ten: string; mau: string }[];
  nhom: { id: string; ten: string }[];
  nguoi: { id: string; ten: string }[];
  duocSua: boolean;
}) {
  const router = useRouter();
  const { goi, dangGui, loi, datLoi } = useGoiApi();
  const [chon, datChon] = useState<Set<string>>(new Set());
  const [thaoTac, datThaoTac] = useState<(typeof THAO_TAC)[number]["ma"]>("doi-hanh-trinh");
  const [giaTri, datGiaTri] = useState("");
  const [thongBao, datThongBao] = useState<string | null>(null);
  const co = (c: MaCot) => cot.includes(c);

  const doiChon = (id: string) =>
    datChon((cu) => {
      const moi = new Set(cu);
      if (moi.has(id)) moi.delete(id);
      else moi.add(id);
      return moi;
    });
  const chonHet = dong.length > 0 && dong.every((d) => chon.has(d.id));

  async function doiHanhTrinhDong(id: string, trangThaiId: string) {
    datThongBao(null);
    const r = await goi(`/api/v1/khach-hang/${id}/hanh-trinh`, "POST", { trangThaiId });
    if (r) router.refresh();
  }

  async function chayHangLoat() {
    datThongBao(null);
    if (!giaTri) {
      datLoi({ thongBao: "Chọn giá trị cho thao tác.", loiTruong: {}, status: 400 });
      return;
    }
    const r = await goi<{ soKhach: number; soDoi: number }>("/api/v1/khach-hang/hang-loat", "POST", { ids: [...chon], thaoTac, giaTri });
    if (r) {
      datThongBao(`Đã xử lý ${dinhDangSo(r.soKhach)} khách, ${dinhDangSo(r.soDoi)} khách có thay đổi.`);
      datChon(new Set());
      router.refresh();
    }
  }

  const luaChonGiaTri =
    thaoTac === "doi-hanh-trinh" ? trangThaiHT : thaoTac === "doi-phu-trach" ? nguoi : nhom;

  return (
    <>
      {(loi || thongBao) && (
        <div className={`hop-thong-bao ${loi ? "loi" : "tot"}`} role={loi ? "alert" : "status"} style={{ margin: "12px 16px" }}>
          {loi?.thongBao ?? thongBao}
        </div>
      )}
      <div className="cuon-ngang">
        <table className="bang">
          <thead>
            <tr>
              {duocSua && (
                <th style={{ width: 32 }}>
                  <input
                    type="checkbox"
                    aria-label="Chọn tất cả khách trên trang"
                    checked={chonHet}
                    onChange={() => datChon(chonHet ? new Set() : new Set(dong.map((d) => d.id)))}
                  />
                </th>
              )}
              <th>Khách hàng</th>
              {co("lien-lac") && <th>Liên lạc</th>}
              {co("phan-khuc") && <th className="an-tren-dt">Phân khúc</th>}
              {co("phu-trach") && <th>Phụ trách</th>}
              {co("hanh-trinh") && <th>Hành trình</th>}
              {co("diem") && <th className="so">Điểm</th>}
              {co("nhom") && <th>Nhóm</th>}
              {co("co-hoi") && <th className="so">Cơ hội mở</th>}
              {co("trang-thai") && <th>Giao dịch</th>}
              {co("tinh-thanh") && <th>Tỉnh / thành</th>}
              {co("nguon") && <th>Nguồn</th>}
              {co("tao-luc") && <th>Ngày tạo</th>}
            </tr>
          </thead>
          <tbody>
            {dong.map((k) => (
              <tr key={k.id} className={k.trangThai === "ngung-giao-dich" || k.trangThai === "da-gop" ? "mo" : undefined}>
                {duocSua && (
                  <td>
                    <input type="checkbox" aria-label={`Chọn ${k.ten}`} checked={chon.has(k.id)} onChange={() => doiChon(k.id)} disabled={k.trangThai === "da-gop"} />
                  </td>
                )}
                <td>
                  <Link href={`/crm/khach-hang/${k.id}`}>{k.ten}</Link>
                  <div className="dong-phu">
                    {k.ma}
                    {k.maSoThue ? ` · MST ${k.maSoThue}` : ""}
                  </div>
                </td>
                {co("lien-lac") && (
                  <td>
                    {k.dienThoai ?? <span className="mo">—</span>}
                    {k.email && <div className="dong-phu">{k.email}</div>}
                    {k.soLienHe > 0 && <div className="dong-phu">{k.soLienHe} người liên hệ</div>}
                  </td>
                )}
                {co("phan-khuc") && <td className="an-tren-dt">{k.phanKhuc ?? <span className="mo">—</span>}</td>}
                {co("phu-trach") && <td>{k.nguoiPhuTrach}</td>}
                {co("hanh-trinh") && (
                  <td>
                    {duocSua && k.trangThai !== "da-gop" ? (
                      <select
                        aria-label={`Trạng thái hành trình của ${k.ten}`}
                        value={k.hanhTrinh?.id ?? ""}
                        disabled={dangGui}
                        onChange={(e) => e.target.value && doiHanhTrinhDong(k.id, e.target.value)}
                        style={{ borderLeft: `4px solid ${k.hanhTrinh?.mau ?? "var(--vien)"}`, maxWidth: 190 }}
                      >
                        {!k.hanhTrinh && <option value="">— Chưa có —</option>}
                        {k.hanhTrinh && !trangThaiHT.some((t) => t.id === k.hanhTrinh!.id) && <option value={k.hanhTrinh.id}>{k.hanhTrinh.ten}</option>}
                        {trangThaiHT.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.ten}
                          </option>
                        ))}
                      </select>
                    ) : k.hanhTrinh ? (
                      <span className="nhan-mau">
                        <span className="cham-mau" style={{ "--mau": k.hanhTrinh.mau } as React.CSSProperties} />
                        {k.hanhTrinh.ten}
                      </span>
                    ) : (
                      <span className="mo">—</span>
                    )}
                  </td>
                )}
                {co("diem") && (
                  <td className="so">
                    {k.diem === null ? (
                      <span className="mo">—</span>
                    ) : (
                      <span className={`diem-khach ${k.hang ?? ""}`} title={k.hang ? `Khách ${NHAN_HANG[k.hang]}` : "Chưa đặt ngưỡng Nóng/Ấm"}>
                        {k.diem}
                      </span>
                    )}
                  </td>
                )}
                {co("nhom") && (
                  <td>
                    <div className="chuoi-huy-hieu">
                      {k.nhom.length
                        ? k.nhom.map((g) => (
                            <span key={g.id} className="nhan-mau">
                              <span className="cham-mau" style={{ "--mau": g.mau } as React.CSSProperties} />
                              {g.ten}
                            </span>
                          ))
                        : <span className="mo">—</span>}
                    </div>
                  </td>
                )}
                {co("co-hoi") && <td className="so">{k.soCoHoiMo ? dinhDangSo(k.soCoHoiMo) : <span className="mo">0</span>}</td>}
                {co("trang-thai") && (
                  <td>
                    <span className={`huy-hieu ${LOP_TRANG_THAI[k.trangThai] ?? ""}`}>{NHAN_TRANG_THAI_KHACH[k.trangThai] ?? k.trangThai}</span>
                  </td>
                )}
                {co("tinh-thanh") && <td>{k.tinhThanh ?? <span className="mo">—</span>}</td>}
                {co("nguon") && <td>{k.nguon ?? <span className="mo">—</span>}</td>}
                {co("tao-luc") && <td className="nho">{dinhDangNgay(k.taoLuc)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {duocSua && chon.size > 0 && (
        <div className="thanh-hang-loat" role="region" aria-label="Thao tác hàng loạt">
          <strong>Đã chọn {dinhDangSo(chon.size)} khách</strong>
          <select
            aria-label="Thao tác"
            value={thaoTac}
            onChange={(e) => {
              datThaoTac(e.target.value as typeof thaoTac);
              datGiaTri("");
            }}
          >
            {THAO_TAC.map((t) => (
              <option key={t.ma} value={t.ma}>
                {t.nhan}
              </option>
            ))}
          </select>
          <select aria-label="Giá trị" value={giaTri} onChange={(e) => datGiaTri(e.target.value)}>
            <option value="">— Chọn —</option>
            {luaChonGiaTri.map((x) => (
              <option key={x.id} value={x.id}>
                {x.ten}
              </option>
            ))}
          </select>
          <button type="button" className="nut chinh nho" onClick={chayHangLoat} disabled={dangGui || !giaTri}>
            {dangGui ? "Đang xử lý…" : "Áp dụng"}
          </button>
          <button type="button" className="nut trong nho" onClick={() => datChon(new Set())}>
            Bỏ chọn
          </button>
        </div>
      )}
    </>
  );
}
