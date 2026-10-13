import Link from "next/link";
import DauTrang from "@/components/ui/DauTrang";
import { taoNguCanh } from "@/lib/api";
import { dinhDangNgay, dinhDangSo } from "@/lib/dinh-dang";
import { docDuLieu, layMot, yeuCauQuyen, type ThamSoTrang } from "@/lib/trang";
import { danhSachNguoiPhuTrach } from "@/modules/crm/chung";
import { LuocDoPheu } from "@/modules/hanh-trinh/luoc-do";
import { tongQuanHanhTrinh } from "@/modules/hanh-trinh/service";
import { MOC_TU_DONG, NHAN_LOAI_TRANG_THAI } from "@/modules/hanh-trinh/moc";
import QuanLyHanhTrinh from "./QuanLyHanhTrinh";

export const dynamic = "force-dynamic";

export default async function TrangHanhTrinh({ searchParams }: { searchParams: ThamSoTrang }) {
  const nd = await yeuCauQuyen("customer.view");
  const sp = await searchParams;
  const kiem = LuocDoPheu.safeParse({
    tu: layMot(sp.tu) || undefined,
    den: layMot(sp.den) || undefined,
    nguoiPhuTrach: layMot(sp.nguoiPhuTrach),
  });
  const thamSo = kiem.success ? kiem.data : { nguoiPhuTrach: "" };

  const { tq, nguoi, loi } = await docDuLieu(nd, async (tx) => {
    const nc = taoNguCanh(tx, nd.phien.tenantId, nd.hoSo);
    const nguoi = await danhSachNguoiPhuTrach(nc, "customer.view");
    try {
      return { tq: await tongQuanHanhTrinh(nc, thamSo), nguoi, loi: null };
    } catch (e) {
      return { tq: await tongQuanHanhTrinh(nc, {}), nguoi, loi: e instanceof Error ? e.message : String(e) };
    }
  });
  const maxDat = Math.max(1, ...tq.pheu.buoc.map((b) => b.soDat));

  return (
    <>
      <DauTrang
        tieuDe="Hành trình khách hàng"
        duongDan={[{ nhan: "CRM" }]}
        moTa="Các bước khách đi qua — từ khách mới tới khi chốt đơn. Đây là trạng thái hành trình, khác trạng thái giao dịch (đang / ngừng giao dịch) của khách."
        hanhDong={
          <Link className="nut" href="/crm/khach-hang">
            Danh sách khách hàng
          </Link>
        }
      />
      {loi && <div className="hop-thong-bao loi">{loi}</div>}

      <section className="the">
        <div className="dau">
          <h2>Trạng thái và số khách</h2>
          <span className="phu nho">
            {dinhDangSo(tq.tong)} khách trong phạm vi bạn xem · {dinhDangSo(tq.chuaCo)} chưa có trạng thái
          </span>
        </div>
        <QuanLyHanhTrinh
          trangThai={tq.trangThai.map((t) => ({ ...t }))}
          quanLy={tq.quyen.quanLy}
          moc={MOC_TU_DONG.map((m) => ({ ma: m.ma, nhan: m.nhan }))}
          nhanLoai={NHAN_LOAI_TRANG_THAI}
        />
      </section>

      <section className="the">
        <div className="dau">
          <h2>Phễu chuyển đổi</h2>
          <span className="phu nho">
            Khách tạo từ {dinhDangNgay(tq.tu)} đến {dinhDangNgay(tq.den)} — tính theo lịch sử, bước xa nhất từng chạm
          </span>
        </div>
        <form className="bo-loc" method="get">
          <div className="truong">
            <label htmlFor="tu">Từ ngày</label>
            <input id="tu" name="tu" type="date" defaultValue={tq.tu} />
          </div>
          <div className="truong">
            <label htmlFor="den">Đến ngày</label>
            <input id="den" name="den" type="date" defaultValue={tq.den} />
          </div>
          {nguoi.length > 1 && (
            <div className="truong">
              <label htmlFor="nguoiPhuTrach">Người phụ trách</label>
              <select id="nguoiPhuTrach" name="nguoiPhuTrach" defaultValue={thamSo.nguoiPhuTrach ?? ""}>
                <option value="">Tất cả</option>
                {nguoi.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.fullName}
                  </option>
                ))}
              </select>
            </div>
          )}
          <button className="nut" type="submit">
            Xem
          </button>
        </form>
        {tq.pheu.tong === 0 ? (
          <p className="phu" style={{ padding: 16 }}>Không có khách nào được tạo trong kỳ này.</p>
        ) : (
          <>
            <div className="luoi-chi-so" style={{ padding: "16px 16px 0" }}>
              <div className="the chi-so">
                <div className="nhan">Khách mới trong kỳ</div>
                <div className="gia-tri">{dinhDangSo(tq.pheu.tong)}</div>
              </div>
              <div className="the chi-so">
                <div className="nhan">Tới bước thành công</div>
                <div className="gia-tri">{dinhDangSo(tq.pheu.soThanhCong)}</div>
                <div className="ghi-chu">{tq.pheu.tyLeThanhCong === null ? "—" : `${String(tq.pheu.tyLeThanhCong).replace(".", ",")}%`}</div>
              </div>
              <div className="the chi-so">
                <div className="nhan">Đang ở trạng thái thất bại</div>
                <div className="gia-tri">{dinhDangSo(tq.pheu.soThatBai)}</div>
                <div className="ghi-chu">{tq.pheu.theoThatBai.map((x) => `${x.ten}: ${x.so}`).join(" · ") || "—"}</div>
              </div>
            </div>
            <div className="pheu" role="table" aria-label="Phễu chuyển đổi">
              {tq.pheu.buoc.map((b) => {
                const mau = tq.trangThai.find((t) => t.id === b.id)?.mau;
                return (
                  <div className="buoc" role="row" key={b.id}>
                    <span role="cell">{b.ten}</span>
                    <div className="ray" role="cell" aria-label={`${b.soDat} khách`}>
                      <span style={{ width: `${(b.soDat / maxDat) * 100}%`, "--mau": mau } as React.CSSProperties} />
                    </div>
                    <span className="so-lieu" role="cell">
                      {dinhDangSo(b.soDat)} khách
                      {b.tyLeTrenTong !== null && ` · ${String(b.tyLeTrenTong).replace(".", ",")}%`}
                      {b.tyLeTuBuocTruoc !== null && ` · ${String(b.tyLeTuBuocTruoc).replace(".", ",")}% từ bước trước`}
                      {b.soNgayTrungBinh !== null && ` · TB ${String(b.soNgayTrungBinh).replace(".", ",")} ngày`}
                    </span>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </section>
    </>
  );
}
