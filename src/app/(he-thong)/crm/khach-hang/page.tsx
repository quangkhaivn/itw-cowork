import Link from "next/link";
import DauTrang from "@/components/ui/DauTrang";
import PhanTrang from "@/components/ui/PhanTrang";
import TrongRong from "@/components/ui/TrongRong";
import BieuTuong from "@/components/ui/BieuTuong";
import { taoNguCanh } from "@/lib/api";
import { dinhDangSo } from "@/lib/dinh-dang";
import { coQuyen } from "@/lib/phan-quyen";
import { docDuLieu, layMot, yeuCauQuyen, type ThamSoTrang } from "@/lib/trang";
import { banDoTenDuLieuGoc, danhSachNguoiPhuTrach, luaChonDuLieuGoc } from "@/modules/crm/chung";
import { NHAN_TRANG_THAI_KHACH, TRANG_THAI_KHACH } from "@/modules/crm/hang-so";
import { LuocDoLocKhachHang } from "@/modules/khach-hang/luoc-do";
import { danhSachKhachHang } from "@/modules/khach-hang/service";

export const dynamic = "force-dynamic";

const LOP_TRANG_THAI: Record<string, string> = { "tiem-nang": "chinh", "dang-giao-dich": "tot", "ngung-giao-dich": "" };

export default async function TrangKhachHang({ searchParams }: { searchParams: ThamSoTrang }) {
  const nd = await yeuCauQuyen("customer.view");
  const sp = await searchParams;
  const tt = layMot(sp.trangThai);
  const boLoc = LuocDoLocKhachHang.parse({
    q: layMot(sp.q),
    nguoiPhuTrach: /^[0-9a-f-]{36}$/i.test(layMot(sp.nguoiPhuTrach)) ? layMot(sp.nguoiPhuTrach) : "",
    phanKhuc: layMot(sp.phanKhuc),
    trangThai: (TRANG_THAI_KHACH as readonly string[]).includes(tt) ? tt : "",
    trang: layMot(sp.trang) || 1,
  });

  const { kq, nguoi, phanKhuc, tenDuLieu } = await docDuLieu(nd, async (tx) => {
    const nc = taoNguCanh(tx, nd.phien.tenantId, nd.hoSo);
    const kq = await danhSachKhachHang(nc, boLoc);
    const nguoi = await danhSachNguoiPhuTrach(nc, "customer.view");
    const phanKhuc = (await luaChonDuLieuGoc(nc, ["phan_khuc_khach_hang"])).phan_khuc_khach_hang;
    const tenDuLieu = await banDoTenDuLieuGoc(nc, ["phan_khuc_khach_hang"]);
    return { kq, nguoi, phanKhuc, tenDuLieu };
  });
  const duocTao = coQuyen(nd.hoSo, "customer.create");
  const coLoc = Boolean(boLoc.q || boLoc.nguoiPhuTrach || boLoc.phanKhuc || boLoc.trangThai);
  const phamVi = nd.hoSo.phamVi.get("customer.view");

  return (
    <>
      <DauTrang
        tieuDe="Khách hàng"
        duongDan={[{ nhan: "CRM" }]}
        moTa={
          phamVi === "all"
            ? "Toàn bộ khách hàng của công ty. Mỗi khách một mã; trùng mã số thuế bị chặn khi nhập."
            : "Khách hàng trong phạm vi bạn phụ trách. Tìm theo tên, mã, MST, điện thoại, email hoặc tên người liên hệ."
        }
        hanhDong={
          duocTao && (
            <Link className="nut chinh" href="/crm/khach-hang/moi">
              <BieuTuong ten="them" co={16} /> Thêm khách hàng
            </Link>
          )
        }
      />

      <section className="the">
        <form className="bo-loc" method="get">
          <div className="truong rong">
            <label htmlFor="q">Tìm</label>
            <input id="q" name="q" type="search" defaultValue={boLoc.q} placeholder="Tên, mã KH, MST, điện thoại, email, người liên hệ" />
          </div>
          {nguoi.length > 1 && (
            <div className="truong">
              <label htmlFor="nguoiPhuTrach">Người phụ trách</label>
              <select id="nguoiPhuTrach" name="nguoiPhuTrach" defaultValue={boLoc.nguoiPhuTrach}>
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
            <label htmlFor="phanKhuc">Phân khúc</label>
            <select id="phanKhuc" name="phanKhuc" defaultValue={boLoc.phanKhuc}>
              <option value="">Tất cả</option>
              {phanKhuc.map((p) => (
                <option key={p.ma} value={p.ma}>
                  {p.ten}
                </option>
              ))}
            </select>
          </div>
          <div className="truong">
            <label htmlFor="trangThai">Trạng thái</label>
            <select id="trangThai" name="trangThai" defaultValue={boLoc.trangThai}>
              <option value="">Tất cả</option>
              {TRANG_THAI_KHACH.map((t) => (
                <option key={t} value={t}>
                  {NHAN_TRANG_THAI_KHACH[t]}
                </option>
              ))}
            </select>
          </div>
          <button className="nut" type="submit">
            Lọc
          </button>
          {coLoc && (
            <Link className="nut trong" href="/crm/khach-hang">
              Xóa lọc
            </Link>
          )}
        </form>

        {kq.dong.length === 0 ? (
          <TrongRong tieuDe={coLoc ? "Không có khách hàng khớp bộ lọc" : "Chưa có khách hàng nào"}>
            {coLoc
              ? "Thử bỏ bớt điều kiện lọc, hoặc tìm bằng số điện thoại / mã số thuế."
              : duocTao
                ? "Bấm “Thêm khách hàng”, hoặc chuyển đổi một lead đủ điều kiện thành khách hàng."
                : null}
          </TrongRong>
        ) : (
          <div className="cuon-ngang">
            <table className="bang">
              <thead>
                <tr>
                  <th>Khách hàng</th>
                  <th>Liên lạc</th>
                  <th className="an-tren-dt">Phân khúc</th>
                  <th>Phụ trách</th>
                  <th className="so">Cơ hội mở</th>
                  <th>Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {kq.dong.map((k) => (
                  <tr key={k.id} className={k.trangThai === "ngung-giao-dich" ? "mo" : undefined}>
                    <td>
                      <Link href={`/crm/khach-hang/${k.id}`}>{k.ten}</Link>
                      <div className="dong-phu">
                        {k.ma}
                        {k.maSoThue ? ` · MST ${k.maSoThue}` : ""}
                      </div>
                    </td>
                    <td>
                      {k.dienThoai ?? <span className="mo">—</span>}
                      {k.email && <div className="dong-phu">{k.email}</div>}
                      {k.soLienHe > 0 && <div className="dong-phu">{k.soLienHe} người liên hệ</div>}
                    </td>
                    <td className="an-tren-dt">{k.phanKhuc ? (tenDuLieu.phan_khuc_khach_hang[k.phanKhuc] ?? k.phanKhuc) : <span className="mo">—</span>}</td>
                    <td>{k.nguoiPhuTrach.hoTen}</td>
                    <td className="so">{k.soCoHoiMo ? dinhDangSo(k.soCoHoiMo) : <span className="mo">0</span>}</td>
                    <td>
                      <span className={`huy-hieu ${LOP_TRANG_THAI[k.trangThai] ?? ""}`}>{NHAN_TRANG_THAI_KHACH[k.trangThai] ?? k.trangThai}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <PhanTrang
          tong={kq.tong}
          trang={kq.trang}
          coTrang={kq.coTrang}
          duongDan="/crm/khach-hang"
          thamSo={{ q: boLoc.q, nguoiPhuTrach: boLoc.nguoiPhuTrach, phanKhuc: boLoc.phanKhuc, trangThai: boLoc.trangThai }}
        />
      </section>
    </>
  );
}
