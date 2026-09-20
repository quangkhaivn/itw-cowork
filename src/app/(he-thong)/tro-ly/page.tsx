import Link from "next/link";
import DauTrang from "@/components/ui/DauTrang";
import { taoNguCanh } from "@/lib/api";
import { LoiKhongTimThay } from "@/lib/loi";
import { dinhDangNgayGio, dinhDangSo } from "@/lib/dinh-dang";
import { docDuLieu, layMot, yeuCauQuyen, type ThamSoTrang } from "@/lib/trang";
import { chiTietHoiThoai, danhSachHoiThoai, trangThaiTroLy } from "@/modules/tro-ly/service";
import KhungChat from "./KhungChat";

export const dynamic = "force-dynamic";

const LA_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Trợ lý ITA — Phase 9.
 *
 * Trang nói thật hai điều ngay từ đầu: trợ lý **đã cấu hình chưa**, và nó **tra được
 * những gì** với quyền của người đang đăng nhập. Không có ô chat chết nằm đó chờ người
 * dùng gõ rồi mới báo lỗi.
 */
export default async function TrangTroLy({ searchParams }: { searchParams: ThamSoTrang }) {
  const nd = await yeuCauQuyen("ai.view");
  const sp = await searchParams;
  const id = layMot(sp.hoiThoai);

  const du = await docDuLieu(nd, async (tx) => {
    const nc = taoNguCanh(tx, nd.phien.tenantId, nd.hoSo);
    const trangThai = await trangThaiTroLy(nc);
    const hoiThoai = await danhSachHoiThoai(nc);
    let chiTiet = null;
    if (LA_UUID.test(id)) {
      try {
        chiTiet = await chiTietHoiThoai(nc, id);
      } catch (loi) {
        if (!(loi instanceof LoiKhongTimThay)) throw loi;
      }
    }
    return { trangThai, hoiThoai, chiTiet };
  });

  const tt = du.trangThai;

  return (
    <>
      <DauTrang
        tieuDe="Trợ lý ITA"
        moTa="Hỏi bằng tiếng Việt về khách hàng, báo giá, tồn kho, công nợ. Trợ lý chỉ tra được phần bạn có quyền xem, và không tự thay đổi dữ liệu."
        hanhDong={
          du.chiTiet && (
            <Link className="nut" href="/tro-ly">
              Hội thoại mới
            </Link>
          )
        }
      />

      <div className="luoi-chi-so">
        <div className={`the chi-so ${tt.daCauHinh ? "" : "canh-bao"}`}>
          <div className="nhan">Tình trạng</div>
          <div className="gia-tri" style={{ fontSize: 18 }}>
            {tt.daCauHinh ? "Sẵn sàng" : "Chưa cấu hình"}
          </div>
          <div className="ghi-chu">{tt.daCauHinh ? `${tt.nhaCungCap} · ${tt.model}` : tt.lyDo}</div>
        </div>
        <div className="the chi-so">
          <div className="nhan">Công cụ bạn dùng được</div>
          <div className="gia-tri">{dinhDangSo(tt.soCongCuKhaDung)}</div>
          <div className="ghi-chu">Theo đúng quyền của bạn, không rộng hơn</div>
        </div>
        <div className="the chi-so">
          <div className="nhan">Hội thoại của tôi</div>
          <div className="gia-tri">{dinhDangSo(du.hoiThoai.length)}</div>
        </div>
      </div>

      <div className="luoi-ben">
        <aside className="the">
          <div className="dau">
            <h2>Hội thoại</h2>
          </div>
          <div className="than">
            {du.hoiThoai.length === 0 ? (
              <p className="phu nho" style={{ margin: 0 }}>
                Chưa có hội thoại nào.
              </p>
            ) : (
              <ul className="ds-hoi-thoai">
                {du.hoiThoai.map((h) => (
                  <li key={h.id} className={du.chiTiet?.hoiThoai.id === h.id ? "dang-chon" : undefined}>
                    <Link href={`/tro-ly?hoiThoai=${h.id}`}>
                      <span className="tieu-de">{h.tieuDe}</span>
                      <span className="dong-phu">{dinhDangNgayGio(h.lucCuoi)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <details style={{ marginTop: 14 }}>
              <summary className="nho">Trợ lý tra được những gì?</summary>
              <ul className="nho phu" style={{ paddingLeft: 18, marginBottom: 0 }}>
                {tt.congCu.map((c) => (
                  <li key={c.ten} style={{ marginBottom: 6 }}>
                    <code>{c.ten}</code> — {c.moTa}
                  </li>
                ))}
              </ul>
            </details>
          </div>
        </aside>

        <KhungChat
          hoiThoaiId={du.chiTiet?.hoiThoai.id ?? null}
          tinNhanBanDau={(du.chiTiet?.tinNhan ?? []).map((t) => ({
            id: t.id,
            vaiTro: t.vaiTro,
            noiDung: t.noiDung,
            soVong: t.soVong,
            loi: t.loi,
            luc: t.luc.toISOString(),
            congCu: t.congCu,
          }))}
          deXuatBanDau={(du.chiTiet?.deXuat ?? []).map((d) => ({
            id: d.id,
            loai: d.loai,
            tomTat: d.tomTat,
            trangThai: d.trangThai,
            doiTuong: d.doiTuong,
            doiTuongId: d.doiTuongId,
            lyDoTuChoi: d.lyDoTuChoi,
            loi: d.loi,
          }))}
          daCauHinh={tt.daCauHinh}
          lyDoChuaCauHinh={tt.lyDo}
        />
      </div>
    </>
  );
}
