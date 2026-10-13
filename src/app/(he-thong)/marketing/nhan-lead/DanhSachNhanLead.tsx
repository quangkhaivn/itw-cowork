"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useGoiApi } from "@/components/ui/goi-api";

interface Nguoi {
  id: string;
  hoTen: string;
  email: string;
}

/** Sửa danh sách sale nhận lead theo vòng tròn (MK-08). Thứ tự trong danh sách = thứ tự chia. */
export default function DanhSachNhanLead({ banDau, ungVien, duocSua }: { banDau: Nguoi[]; ungVien: Nguoi[]; duocSua: boolean }) {
  const router = useRouter();
  const { goi, dangGui, loi } = useGoiApi();
  const [ds, datDs] = useState(banDau);
  const [chon, datChon] = useState("");
  const [daLuu, datDaLuu] = useState(false);
  const conLai = ungVien.filter((u) => !ds.some((d) => d.id === u.id));

  const doi = (moi: Nguoi[]) => {
    datDs(moi);
    datDaLuu(false);
  };
  const doiCho = (i: number, j: number) => {
    if (j < 0 || j >= ds.length) return;
    const moi = [...ds];
    [moi[i], moi[j]] = [moi[j], moi[i]];
    doi(moi);
  };

  async function luu() {
    if (await goi("/api/v1/marketing/nhan-lead", "PUT", { nguoiIds: ds.map((d) => d.id) })) {
      datDaLuu(true);
      router.refresh();
    }
  }

  return (
    <div className="than">
      {loi && <div className="hop-thong-bao loi" role="alert">{loi.thongBao}</div>}
      {daLuu && <div className="hop-thong-bao tot" role="status">Đã lưu danh sách.</div>}
      {ds.length === 0 ? (
        <p className="phu">
          Chưa có ai trong danh sách. Lead mới sẽ giao cho <strong>người phụ trách chiến dịch</strong>; không có chiến dịch thì giao cho người tạo form / nguồn webhook.
        </p>
      ) : (
        <ol style={{ paddingLeft: 20, margin: "0 0 12px" }}>
          {ds.map((d, i) => (
            <li key={d.id} style={{ marginBottom: 6 }}>
              <span style={{ display: "inline-flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <strong>{d.hoTen}</strong> <span className="phu">{d.email}</span>
                {duocSua && (
                  <>
                    <button type="button" className="nut nho trong" aria-label="Lên" onClick={() => doiCho(i, i - 1)} disabled={i === 0}>
                      ↑
                    </button>
                    <button type="button" className="nut nho trong" aria-label="Xuống" onClick={() => doiCho(i, i + 1)} disabled={i === ds.length - 1}>
                      ↓
                    </button>
                    <button type="button" className="nut nho trong" onClick={() => doi(ds.filter((x) => x.id !== d.id))}>
                      Bỏ
                    </button>
                  </>
                )}
              </span>
            </li>
          ))}
        </ol>
      )}
      {duocSua && (
        <div className="hang-nhap">
          <select aria-label="Thêm người nhận lead" value={chon} onChange={(e) => datChon(e.target.value)} style={{ maxWidth: 320 }}>
            <option value="">— Thêm người (có quyền xem lead) —</option>
            {conLai.map((u) => (
              <option key={u.id} value={u.id}>
                {u.hoTen} ({u.email})
              </option>
            ))}
          </select>
          <button
            type="button"
            className="nut"
            disabled={!chon}
            onClick={() => {
              const u = ungVien.find((x) => x.id === chon);
              if (u) doi([...ds, u]);
              datChon("");
            }}
          >
            Thêm
          </button>
          <button type="button" className="nut chinh" disabled={dangGui} onClick={luu}>
            {dangGui ? "Đang lưu…" : "Lưu danh sách"}
          </button>
        </div>
      )}
    </div>
  );
}
