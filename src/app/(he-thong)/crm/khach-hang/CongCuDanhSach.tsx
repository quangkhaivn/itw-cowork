"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useGoiApi } from "@/components/ui/goi-api";
import { chuoiTruyVan, COT_KHACH, type MaCot } from "@/modules/khach-hang/danh-muc-loc";

interface BoLoc {
  id: string;
  ten: string;
  dungChung: boolean;
  cuaToi: boolean;
  nguoiTao: string;
  thamSo: Record<string, string>;
}

/**
 * Bộ lọc đã lưu (cá nhân / dùng chung, đặt mặc định) và tùy chọn cột — lưu theo người dùng
 * ở máy chủ (KHN-07). Bộ lọc dùng chung chỉ hiện ô chọn khi người dùng có quyền quản lý;
 * máy chủ kiểm lại.
 */
export default function CongCuDanhSach({
  boLoc,
  thamSo,
  cot,
  macDinhId,
  duocDungChung,
}: {
  boLoc: BoLoc[];
  thamSo: Record<string, string>;
  cot: MaCot[];
  macDinhId: string | null;
  duocDungChung: boolean;
}) {
  const router = useRouter();
  const { goi, dangGui, loi } = useGoiApi();
  const [mo, datMo] = useState<"bo-loc" | "cot" | null>(null);
  const [ten, datTen] = useState("");
  const [dungChung, datDungChung] = useState(false);
  const [cotChon, datCotChon] = useState<Set<MaCot>>(new Set(cot));

  async function luu() {
    const r = await goi("/api/v1/khach-hang/bo-loc", "POST", { ten, thamSo, dungChung });
    if (r) {
      datTen("");
      router.refresh();
    }
  }
  async function go(id: string) {
    if (await goi(`/api/v1/khach-hang/bo-loc/${id}`, "DELETE")) router.refresh();
  }
  async function datMacDinh(id: string | null) {
    if (await goi("/api/v1/khach-hang/tuy-chon", "PUT", { boLocMacDinhId: id })) router.refresh();
  }
  async function luuCot() {
    if (await goi("/api/v1/khach-hang/tuy-chon", "PUT", { cot: COT_KHACH.map((c) => c.ma).filter((c) => cotChon.has(c)) })) {
      datMo(null);
      router.refresh();
    }
  }

  return (
    <div className="thanh-cong-cu">
      <span className="phu nho">Bộ lọc đã lưu:</span>
      {boLoc.length === 0 && <span className="mo nho">chưa có</span>}
      {boLoc.slice(0, 6).map((b) => (
        <Link key={b.id} className="nut nho" href={`/crm/khach-hang${chuoiTruyVan({ ...b.thamSo, xem: "tat-ca" })}`} title={b.dungChung ? `Dùng chung — ${b.nguoiTao}` : "Của tôi"}>
          {b.dungChung ? "◆ " : ""}
          {b.ten}
          {b.id === macDinhId ? " (mặc định)" : ""}
        </Link>
      ))}
      <div className="day">
        <div className="hop-noi">
          <button type="button" className="nut nho" aria-expanded={mo === "bo-loc"} onClick={() => datMo(mo === "bo-loc" ? null : "bo-loc")}>
            Quản lý bộ lọc
          </button>
          {mo === "bo-loc" && (
            <div className="bang-noi">
              <div className="truong">
                <label htmlFor="ten-bo-loc">Lưu bộ lọc đang xem</label>
                <input id="ten-bo-loc" value={ten} onChange={(e) => datTen(e.target.value)} placeholder="Ví dụ: Khách nóng của nhóm" maxLength={100} />
              </div>
              {duocDungChung && (
                <label className="nho" style={{ display: "flex", gap: 6, alignItems: "center", margin: "6px 0" }}>
                  <input type="checkbox" checked={dungChung} onChange={(e) => datDungChung(e.target.checked)} /> Dùng chung cho mọi người
                </label>
              )}
              <button type="button" className="nut chinh nho" onClick={luu} disabled={dangGui || !ten.trim()}>
                Lưu bộ lọc
              </button>
              {loi && <p className="chu-loi nho">{loi.thongBao}</p>}
              {boLoc.length > 0 && (
                <ul style={{ marginTop: 10 }}>
                  {boLoc.map((b) => (
                    <li key={b.id}>
                      <span>
                        {b.ten}
                        <span className="phu nho"> {b.dungChung ? `· dùng chung (${b.nguoiTao})` : "· của tôi"}</span>
                      </span>
                      <span className="tac-vu">
                        {b.id === macDinhId ? (
                          <button type="button" className="nut nho trong" onClick={() => datMacDinh(null)} disabled={dangGui}>
                            Bỏ mặc định
                          </button>
                        ) : (
                          <button type="button" className="nut nho trong" onClick={() => datMacDinh(b.id)} disabled={dangGui}>
                            Đặt mặc định
                          </button>
                        )}
                        {(b.cuaToi || duocDungChung) && (
                          <button type="button" className="nut nho trong" onClick={() => go(b.id)} disabled={dangGui} aria-label={`Gỡ bộ lọc ${b.ten}`}>
                            Gỡ
                          </button>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
        <div className="hop-noi">
          <button type="button" className="nut nho" aria-expanded={mo === "cot"} onClick={() => datMo(mo === "cot" ? null : "cot")}>
            Cột hiển thị
          </button>
          {mo === "cot" && (
            <div className="bang-noi">
              <ul>
                {COT_KHACH.map((c) => (
                  <li key={c.ma}>
                    <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <input
                        type="checkbox"
                        checked={cotChon.has(c.ma)}
                        onChange={() =>
                          datCotChon((cu) => {
                            const moi = new Set(cu);
                            if (moi.has(c.ma)) moi.delete(c.ma);
                            else moi.add(c.ma);
                            return moi;
                          })
                        }
                      />
                      {c.nhan}
                    </label>
                  </li>
                ))}
              </ul>
              <button type="button" className="nut chinh nho" onClick={luuCot} disabled={dangGui || cotChon.size === 0} style={{ marginTop: 8 }}>
                Lưu cột
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
