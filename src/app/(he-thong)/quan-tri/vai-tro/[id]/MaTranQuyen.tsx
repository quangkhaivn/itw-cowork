"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useGoiApi } from "@/components/ui/goi-api";
import { NHAN_PHAM_VI, PHAM_VI, type PhamVi } from "@/lib/pham-vi";

/**
 * Ma trận quyền: hàng = phân hệ, cột = hành động, thêm một cột phạm vi dữ liệu cho cả hàng.
 * Máy chủ kiểm lại mọi thứ (bất biến AI, không cấp quyền mình không có, vai trò khóa).
 * Giao diện chỉ làm mờ những ô chắc chắn bị từ chối để người dùng khỏi bấm vô ích.
 */
export default function MaTranQuyen({
  id,
  duocSua,
  laVaiTroAI,
  phanHe,
  hanhDong,
  coSan,
  quyen,
  quyenCuaToi,
}: {
  id: string;
  duocSua: boolean;
  laVaiTroAI: boolean;
  phanHe: { ma: string; ten: string }[];
  hanhDong: { ma: string; ten: string }[];
  coSan: string[];
  quyen: { ma: string; phamVi: PhamVi }[];
  quyenCuaToi: string[];
}) {
  const router = useRouter();
  const { goi, dangGui, loi } = useGoiApi();
  const [ban, datBan] = useState(() => new Map(quyen.map((q) => [q.ma, q.phamVi])));
  const [daLuu, datDaLuu] = useState(false);
  const coSanSet = useMemo(() => new Set(coSan), [coSan]);
  const cuaToi = useMemo(() => new Set(quyenCuaToi), [quyenCuaToi]);
  const banGoc = useMemo(() => new Map(quyen.map((q) => [q.ma, q.phamVi])), [quyen]);

  const thayDoi = useMemo(() => {
    if (ban.size !== banGoc.size) return true;
    for (const [k, v] of ban) if (banGoc.get(k) !== v) return true;
    return false;
  }, [ban, banGoc]);

  const phamViHang = (ph: string): PhamVi => {
    for (const h of hanhDong) {
      const pv = ban.get(`${ph}.${h.ma}`);
      if (pv) return pv;
    }
    return "all";
  };

  const khoa = (ma: string) => {
    if (!duocSua) return true;
    if (laVaiTroAI && (ma.endsWith(".approve") || ma.endsWith(".delete"))) return true;
    // Được gỡ quyền mình không có, nhưng không được cấp thêm.
    return !ban.has(ma) && !cuaToi.has(ma);
  };

  function bat(ma: string, ph: string, chon: boolean) {
    const moi = new Map(ban);
    if (chon) moi.set(ma, phamViHang(ph));
    else moi.delete(ma);
    datBan(moi);
    datDaLuu(false);
  }

  function doiPhamVi(ph: string, pv: PhamVi) {
    const moi = new Map(ban);
    for (const h of hanhDong) {
      const ma = `${ph}.${h.ma}`;
      if (moi.has(ma)) moi.set(ma, pv);
    }
    datBan(moi);
    datDaLuu(false);
  }

  async function luu() {
    const kq = await goi(`/api/v1/vai-tro/${id}`, "PATCH", {
      quyen: [...ban].map(([ma, phamVi]) => ({ ma, phamVi })),
    });
    if (kq) {
      datDaLuu(true);
      router.refresh();
    }
  }

  return (
    <section className="the">
      <div className="dau">
        <h2>Ma trận quyền ({ban.size})</h2>
        {duocSua && (
          <div className="hanh-dong">
            <button className="nut" disabled={!thayDoi || dangGui} onClick={() => datBan(new Map(banGoc))}>
              Hoàn tác
            </button>
            <button className="nut chinh" disabled={!thayDoi || dangGui} onClick={luu}>
              {dangGui ? "Đang lưu…" : "Lưu quyền"}
            </button>
          </div>
        )}
      </div>
      {loi && (
        <div className="hop-thong-bao loi" role="alert" style={{ margin: 16 }}>
          {loi.thongBao}
        </div>
      )}
      {daLuu && (
        <div className="hop-thong-bao tot" role="status" style={{ margin: 16 }}>
          Đã lưu. Thay đổi có hiệu lực ngay ở thao tác kế tiếp của người giữ vai trò — không cần đăng nhập lại.
        </div>
      )}
      <div className="cuon-ngang">
        <table className="bang ma-tran">
          <thead>
            <tr>
              <th>Phân hệ</th>
              {hanhDong.map((h) => (
                <th key={h.ma}>{h.ten}</th>
              ))}
              <th>Phạm vi dữ liệu</th>
            </tr>
          </thead>
          <tbody>
            {phanHe.map((ph) => {
              const coQuyenNao = hanhDong.some((h) => ban.has(`${ph.ma}.${h.ma}`));
              return (
                <tr key={ph.ma}>
                  <td>{ph.ten}</td>
                  {hanhDong.map((h) => {
                    const ma = `${ph.ma}.${h.ma}`;
                    if (!coSanSet.has(ma)) return <td key={ma} className="mo">—</td>;
                    return (
                      <td key={ma}>
                        <input
                          type="checkbox"
                          checked={ban.has(ma)}
                          disabled={khoa(ma)}
                          onChange={(e) => bat(ma, ph.ma, e.target.checked)}
                          aria-label={`${h.ten} ${ph.ten}`}
                        />
                      </td>
                    );
                  })}
                  <td>
                    {coQuyenNao ? (
                      <select
                        value={phamViHang(ph.ma)}
                        disabled={!duocSua}
                        onChange={(e) => doiPhamVi(ph.ma, e.target.value as PhamVi)}
                        aria-label={`Phạm vi dữ liệu ${ph.ten}`}
                      >
                        {PHAM_VI.map((pv) => (
                          <option key={pv} value={pv}>
                            {NHAN_PHAM_VI[pv]}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="mo">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
