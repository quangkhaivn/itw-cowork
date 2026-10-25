"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { loiCua, useGoiApi } from "@/components/ui/goi-api";

interface KetQuaCsv {
  chiKiemTra: boolean;
  soGhi: number;
  soDaCo: number;
  soLoi: number;
  loi: { soDong: number; lyDo: string }[];
  cotLa: string[];
}

/** Ghi tay một dòng (căn cứ bắt buộc) và nhập CSV (Email, Nguồn, Căn cứ, Thời điểm) — EG-08. */
export default function GhiSoDongY() {
  const router = useRouter();
  const tay = useGoiApi();
  const csv = useGoiApi();
  const [f, datF] = useState({ email: "", hanhDong: "dong-y", canCu: "", thoiDiem: "", xacNhanSauTuChoi: false });
  const [daGhi, datDaGhi] = useState<string | null>(null);
  const [noiDung, datNoiDung] = useState("");
  const [kqCsv, datKqCsv] = useState<KetQuaCsv | null>(null);

  async function ghi(e: React.FormEvent) {
    e.preventDefault();
    datDaGhi(null);
    const r = await tay.goi<{ truoc: string | null; sau: string }>("/api/v1/email/dong-y", "POST", f);
    if (r) {
      datDaGhi(`Đã ghi cho ${f.email}.`);
      datF({ email: "", hanhDong: "dong-y", canCu: "", thoiDiem: "", xacNhanSauTuChoi: false });
      router.refresh();
    }
  }

  async function chonTep(e: React.ChangeEvent<HTMLInputElement>) {
    const tep = e.target.files?.[0];
    datKqCsv(null);
    if (!tep) return;
    if (tep.size > 2_000_000) {
      datNoiDung("");
      window.alert("Tệp quá 2 MB — chia nhỏ rồi nhập.");
      return;
    }
    datNoiDung(await tep.text());
  }

  async function nhap(chiKiemTra: boolean) {
    const r = await csv.goi<KetQuaCsv>("/api/v1/email/dong-y/nhap-csv", "POST", { noiDung, chiKiemTra });
    if (r) {
      datKqCsv(r);
      if (!chiKiemTra) router.refresh();
    }
  }

  const canXacNhan = tay.loi?.ma === "can-xac-nhan-sau-tu-choi";

  return (
    <div>
      <form className="the" onSubmit={ghi}>
        <div className="dau">
          <h2>Ghi tay</h2>
        </div>
        <div className="than">
          {tay.loi && (
            <div className="hop-thong-bao loi" role="alert">
              {tay.loi.thongBao}
            </div>
          )}
          {daGhi && (
            <div className="hop-thong-bao tot" role="status">
              {daGhi}
            </div>
          )}
          <div className="truong">
            <label htmlFor="dy-email">Email</label>
            <input id="dy-email" type="email" required value={f.email} onChange={(e) => datF({ ...f, email: e.target.value })} />
            {loiCua(tay.loi, "email") && <span className="chu-loi">{loiCua(tay.loi, "email")}</span>}
          </div>
          <div className="truong">
            <label htmlFor="dy-hd">Hành động</label>
            <select id="dy-hd" value={f.hanhDong} onChange={(e) => datF({ ...f, hanhDong: e.target.value })}>
              <option value="dong-y">Đồng ý nhận thư quảng cáo</option>
              <option value="rut">Rút đồng ý (từ chối)</option>
              <option value="phan-doi">Phản đối / khiếu nại thư rác</option>
            </select>
          </div>
          <div className="truong">
            <label htmlFor="dy-cc">Căn cứ (bắt buộc)</label>
            <textarea id="dy-cc" rows={3} required minLength={10} value={f.canCu} onChange={(e) => datF({ ...f, canCu: e.target.value })} placeholder="Người đó đồng ý / từ chối ở đâu, lúc nào; bằng chứng lưu ở đâu (phiếu đăng ký số…, email trả lời ngày…)" />
            {loiCua(tay.loi, "canCu") && <span className="chu-loi">{loiCua(tay.loi, "canCu")}</span>}
          </div>
          <div className="truong">
            <label htmlFor="dy-tg">Thời điểm (để trống = bây giờ)</label>
            <input id="dy-tg" type="datetime-local" value={f.thoiDiem} onChange={(e) => datF({ ...f, thoiDiem: e.target.value })} />
            {loiCua(tay.loi, "thoiDiem") && <span className="chu-loi">{loiCua(tay.loi, "thoiDiem")}</span>}
          </div>
          {(canXacNhan || f.xacNhanSauTuChoi) && (
            <label className="o-chon" style={{ marginBottom: 12 }}>
              <input type="checkbox" checked={f.xacNhanSauTuChoi} onChange={(e) => datF({ ...f, xacNhanSauTuChoi: e.target.checked })} />
              <span>Tôi xác nhận người này đã đồng ý LẠI sau lần từ chối, căn cứ ghi ở trên.</span>
            </label>
          )}
          <button type="submit" className="nut chinh" disabled={tay.dangGui}>
            {tay.dangGui ? "Đang ghi…" : "Ghi vào sổ"}
          </button>
        </div>
      </form>

      <section className="the">
        <div className="dau">
          <h2>Nhập CSV</h2>
        </div>
        <div className="than">
          <p className="nho phu">
            Cột: <code>Email</code>, <code>Nguồn</code>, <code>Căn cứ</code>, <code>Thời điểm</code> (dd/mm/yyyy hoặc dd/mm/yyyy hh:mm, giờ Việt Nam). Excel: Lưu thành → CSV UTF-8. Người đã rút đồng ý / báo rác không được ghi lại qua CSV — phải ghi tay kèm căn cứ.
          </p>
          <input type="file" accept=".csv,text/csv" onChange={chonTep} />
          {csv.loi && (
            <div className="hop-thong-bao loi" role="alert">
              {csv.loi.thongBao}
            </div>
          )}
          {kqCsv && (
            <div className={`hop-thong-bao ${kqCsv.soLoi ? "canh-bao" : "tot"}`} role="status">
              {kqCsv.chiKiemTra ? "Đọc thử: " : "Đã nhập: "}
              {kqCsv.soGhi} dòng {kqCsv.chiKiemTra ? "sẽ ghi" : "đã ghi"}, {kqCsv.soDaCo} đã có, {kqCsv.soLoi} lỗi.
              {kqCsv.cotLa.length > 0 && ` Cột không hiểu: ${kqCsv.cotLa.join(", ")}.`}
              {kqCsv.loi.length > 0 && (
                <ul className="nho" style={{ margin: "6px 0 0" }}>
                  {kqCsv.loi.slice(0, 20).map((l) => (
                    <li key={`${l.soDong}-${l.lyDo}`}>
                      Dòng {l.soDong}: {l.lyDo}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <div className="chuoi-lua-chon" style={{ gap: 8, marginTop: 8 }}>
            <button type="button" className="nut" disabled={!noiDung || csv.dangGui} onClick={() => nhap(true)}>
              Đọc thử
            </button>
            <button type="button" className="nut chinh" disabled={!noiDung || csv.dangGui || !kqCsv?.chiKiemTra} onClick={() => nhap(false)}>
              Nhập vào sổ
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
