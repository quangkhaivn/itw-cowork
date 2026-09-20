import Link from "next/link";
import DauTrang from "@/components/ui/DauTrang";
import PhanTrang from "@/components/ui/PhanTrang";
import TrongRong from "@/components/ui/TrongRong";
import BieuTuong from "@/components/ui/BieuTuong";
import { taoNguCanh } from "@/lib/api";
import { dinhDangNgayGio, dinhDangSo } from "@/lib/dinh-dang";
import { coQuyen } from "@/lib/phan-quyen";
import { docDuLieu, layMot, yeuCauQuyen, type ThamSoTrang } from "@/lib/trang";
import { danhSachNguoiPhuTrach } from "@/modules/crm/chung";
import { LuocDoLocPhieu } from "@/modules/ho-tro/luoc-do";
import { danhSachPhieu } from "@/modules/ho-tro/service";
import {
  LOAI_PHIEU, LOP_TRANG_THAI_PHIEU, LOP_UU_TIEN_PHIEU, NHAN_LOAI_PHIEU, NHAN_MUC_SLA,
  NHAN_TRANG_THAI_PHIEU, NHAN_UU_TIEN_PHIEU, TRANG_THAI_PHIEU, UU_TIEN_PHIEU,
} from "@/modules/ho-tro/tinh-toan";

export const dynamic = "force-dynamic";

const LA_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function TrangPhieuHoTro({ searchParams }: { searchParams: ThamSoTrang }) {
  const nd = await yeuCauQuyen("service_desk.view");
  const sp = await searchParams;
  const tt = layMot(sp.trangThai);
  const loai = layMot(sp.loai);
  const uuTien = layMot(sp.uuTien);
  const boLoc = LuocDoLocPhieu.parse({
    q: layMot(sp.q),
    // "dang-mo" trên URL = "" trong lược đồ (phân trang bỏ tham số rỗng).
    trangThai: tt === "dang-mo" ? "" : tt === "tat-ca" || (TRANG_THAI_PHIEU as readonly string[]).includes(tt) ? tt : "",
    loai: (LOAI_PHIEU as readonly string[]).includes(loai) ? loai : "",
    uuTien: (UU_TIEN_PHIEU as readonly string[]).includes(uuTien) ? uuTien : "",
    nguoiXuLy: LA_UUID.test(layMot(sp.nguoiXuLy)) ? layMot(sp.nguoiXuLy) : "",
    treHan: layMot(sp.treHan) === "1" ? "1" : "",
    trang: layMot(sp.trang) || 1,
  });

  const { kq, nguoi } = await docDuLieu(nd, async (tx) => {
    const nc = taoNguCanh(tx, nd.phien.tenantId, nd.hoSo);
    return { kq: await danhSachPhieu(nc, boLoc), nguoi: await danhSachNguoiPhuTrach(nc, "service_desk.view") };
  });
  const coLoc = Boolean(boLoc.q || boLoc.trangThai || boLoc.loai || boLoc.uuTien || boLoc.nguoiXuLy || boLoc.treHan);

  return (
    <>
      <DauTrang
        tieuDe="Phiếu hỗ trợ"
        duongDan={[{ nhan: "Dịch vụ" }]}
        moTa="Việc khách nhờ: bảo hành, sự cố, yêu cầu, bảo trì. Phiếu gắn thẳng với máy đã bán nên không phải hỏi khách mua hồi nào."
        hanhDong={
          coQuyen(nd.hoSo, "service_desk.create") && (
            <Link className="nut chinh" href="/dich-vu/ho-tro/moi">
              <BieuTuong ten="them" co={16} /> Mở phiếu
            </Link>
          )
        }
      />

      <div className="luoi-chi-so">
        <div className="the chi-so">
          <div className="nhan">Phiếu đang mở</div>
          <div className="gia-tri">{dinhDangSo(kq.tomTat.dangMo)}</div>
        </div>
        <div className={`the chi-so${kq.tomTat.treHan > 0 ? " loi" : ""}`}>
          <div className="nhan">Trễ hạn cam kết</div>
          <div className="gia-tri">{dinhDangSo(kq.tomTat.treHan)}</div>
          <div className="ghi-chu">
            {kq.tomTat.treHan > 0 ? <Link href="/dich-vu/ho-tro?treHan=1">Xem phiếu trễ hạn</Link> : "Đang trong hạn"}
          </div>
        </div>
        <div className="the chi-so">
          <div className="nhan">Đã xử lý xong</div>
          <div className="gia-tri">{dinhDangSo(kq.tomTat.daXong)}</div>
        </div>
      </div>

      <section className="the">
        <form className="bo-loc" method="get">
          <div className="truong rong">
            <label htmlFor="q">Tìm</label>
            <input id="q" name="q" type="search" defaultValue={boLoc.q} placeholder="Số phiếu, tiêu đề, tên khách" />
          </div>
          <div className="truong">
            <label htmlFor="trangThai">Trạng thái</label>
            <select id="trangThai" name="trangThai" defaultValue={boLoc.trangThai || "dang-mo"}>
              <option value="dang-mo">Đang mở</option>
              <option value="tat-ca">Tất cả</option>
              {TRANG_THAI_PHIEU.map((t) => (
                <option key={t} value={t}>
                  {NHAN_TRANG_THAI_PHIEU[t]}
                </option>
              ))}
            </select>
          </div>
          <div className="truong">
            <label htmlFor="loai">Loại</label>
            <select id="loai" name="loai" defaultValue={boLoc.loai}>
              <option value="">Tất cả</option>
              {LOAI_PHIEU.map((l) => (
                <option key={l} value={l}>
                  {NHAN_LOAI_PHIEU[l]}
                </option>
              ))}
            </select>
          </div>
          <div className="truong">
            <label htmlFor="uuTien">Ưu tiên</label>
            <select id="uuTien" name="uuTien" defaultValue={boLoc.uuTien}>
              <option value="">Tất cả</option>
              {UU_TIEN_PHIEU.map((u) => (
                <option key={u} value={u}>
                  {NHAN_UU_TIEN_PHIEU[u]}
                </option>
              ))}
            </select>
          </div>
          {nguoi.length > 1 && (
            <div className="truong">
              <label htmlFor="nguoiXuLy">Người xử lý</label>
              <select id="nguoiXuLy" name="nguoiXuLy" defaultValue={boLoc.nguoiXuLy}>
                <option value="">Tất cả</option>
                {nguoi.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.fullName}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="truong">
            <label className="o-chon" style={{ minHeight: 34, alignItems: "center" }}>
              <input type="checkbox" name="treHan" value="1" defaultChecked={boLoc.treHan === "1"} />
              <span>Chỉ trễ hạn</span>
            </label>
          </div>
          <button className="nut" type="submit">
            Lọc
          </button>
          {coLoc && (
            <Link className="nut trong" href="/dich-vu/ho-tro">
              Xóa lọc
            </Link>
          )}
        </form>

        {kq.dong.length === 0 ? (
          <TrongRong tieuDe={coLoc ? "Không có phiếu khớp bộ lọc" : "Chưa có phiếu hỗ trợ nào"}>
            {!coLoc && "Khi khách gọi, bấm “Mở phiếu” rồi tra số sê-ri để gắn đúng máy đã bán."}
          </TrongRong>
        ) : (
          <div className="cuon-ngang">
            <table className="bang">
              <thead>
                <tr>
                  <th>Phiếu</th>
                  <th>Khách hàng</th>
                  <th>Loại</th>
                  <th>Ưu tiên</th>
                  <th>Trạng thái</th>
                  <th className="an-tren-dt">Hạn cam kết</th>
                  <th>Người xử lý</th>
                </tr>
              </thead>
              <tbody>
                {kq.dong.map((p) => {
                  const sla = NHAN_MUC_SLA[p.mucXuLy];
                  return (
                    <tr key={p.id}>
                      <td>
                        <Link href={`/dich-vu/ho-tro/${p.id}`}>{p.so}</Link>
                        <div className="dong-phu">{p.tieuDe}</div>
                      </td>
                      <td>
                        <Link href={`/crm/khach-hang/${p.khachHang.id}`}>{p.khachHang.ten}</Link>
                        {p.baoHanh?.serial && <div className="dong-phu">{p.baoHanh.serial}</div>}
                      </td>
                      <td className="nho">{NHAN_LOAI_PHIEU[p.loai] ?? p.loai}</td>
                      <td>
                        <span className={`huy-hieu ${LOP_UU_TIEN_PHIEU[p.uuTien] ?? ""}`}>{NHAN_UU_TIEN_PHIEU[p.uuTien] ?? p.uuTien}</span>
                      </td>
                      <td>
                        <span className={`huy-hieu ${LOP_TRANG_THAI_PHIEU[p.trangThai] ?? ""}`}>{NHAN_TRANG_THAI_PHIEU[p.trangThai] ?? p.trangThai}</span>
                      </td>
                      <td className="an-tren-dt nho">
                        <span className={`huy-hieu ${sla.lop}`}>{sla.nhan}</span>
                        {p.hanXuLy && <div className="dong-phu">{dinhDangNgayGio(p.hanXuLy)}</div>}
                      </td>
                      <td>{p.nguoiXuLy?.hoTen ?? <span className="mo">Chưa giao</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <PhanTrang
          tong={kq.tong}
          trang={kq.trang}
          coTrang={kq.coTrang}
          duongDan="/dich-vu/ho-tro"
          thamSo={{ q: boLoc.q, trangThai: boLoc.trangThai || "dang-mo", loai: boLoc.loai, uuTien: boLoc.uuTien, nguoiXuLy: boLoc.nguoiXuLy, treHan: boLoc.treHan }}
        />
      </section>
    </>
  );
}
