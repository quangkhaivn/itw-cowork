import { voiTenant } from "@/lib/db";
import { docTrang, timDoanhNghiepCongKhai, trangThaiXoaDuLieu, type Trang } from "@/modules/mang-xa-hoi/trang-cong-khai";

/** Dựng nội dung chữ thường: "## " = tiêu đề mục, "- " = gạch đầu dòng, dòng trống = đoạn mới. Không nhận HTML (React tự thoát). */
function Than({ noiDung }: { noiDung: string }) {
  const khoi = noiDung.replace(/\r\n/g, "\n").split(/\n{2,}/).map((k) => k.trim()).filter(Boolean);
  return (
    <>
      {khoi.map((k, i) => {
        const dong = k.split("\n");
        const ds: React.ReactNode[] = [];
        let gach: string[] = [];
        const xa = () => {
          if (gach.length) ds.push(<ul key={`u${ds.length}`}>{gach.map((g, j) => <li key={j}>{g}</li>)}</ul>);
          gach = [];
        };
        for (const d of dong) {
          if (d.startsWith("## ")) { xa(); ds.push(<h2 key={`h${ds.length}`}>{d.slice(3)}</h2>); }
          else if (d.startsWith("- ")) gach.push(d.slice(2));
          else { xa(); ds.push(<p key={`p${ds.length}`}>{d}</p>); }
        }
        xa();
        return <div key={i}>{ds}</div>;
      })}
    </>
  );
}

/** Trang công khai (Điều khoản / Quyền riêng tư / Xóa dữ liệu) — 0.24.0, QĐ-214. */
export default async function TrangPhapLy({ trang, dn, ma }: { trang: Trang; dn?: string; ma?: string }) {
  const t = await timDoanhNghiepCongKhai(dn).catch(() => null);
  if (!t) {
    return (
      <main className="giua"><div className="the the-don trang-cong-khai"><h1>Không tìm thấy</h1><p>Liên kết thiếu hoặc sai mã doanh nghiệp (<code>?dn=…</code>).</p></div></main>
    );
  }
  const nd = await voiTenant(t.id, (tx) => docTrang(tx, trang, t.name));
  const tt = trang === "xoa-du-lieu" && ma ? await trangThaiXoaDuLieu(t.id, ma).catch(() => null) : null;
  return (
    <main className="giua">
      <article className="the the-don trang-cong-khai" style={{ maxWidth: 820 }}>
        <p className="phu nho">{t.name}</p>
        <h1>{nd.tieuDe}</h1>
        {trang === "xoa-du-lieu" && ma && (
          <div className={`hop-thong-bao ${tt?.trangThai === "DA_XOA" ? "tot" : tt ? "thong-tin" : "canh-bao"}`} role="status">
            <strong>Mã yêu cầu {ma}:</strong> {tt ? <>{tt.nhan}{tt.ketQua ? ` ${tt.ketQua}` : ""}</> : "không tìm thấy mã này."}
          </div>
        )}
        <Than noiDung={nd.noiDung} />
        {nd.capNhatLuc && <p className="phu nho">Cập nhật: {nd.capNhatLuc.toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}</p>}
      </article>
    </main>
  );
}
