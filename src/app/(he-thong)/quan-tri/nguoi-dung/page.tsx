import Link from "next/link";
import DauTrang from "@/components/ui/DauTrang";
import PhanTrang from "@/components/ui/PhanTrang";
import TrangThai from "@/components/ui/TrangThai";
import TrongRong from "@/components/ui/TrongRong";
import BieuTuong from "@/components/ui/BieuTuong";
import { taoNguCanh } from "@/lib/api";
import { dinhDangNgayGio } from "@/lib/dinh-dang";
import { docDuLieu, layMot, yeuCauQuyen, type ThamSoTrang } from "@/lib/trang";
import { LuocDoLocNguoiDung } from "@/modules/nguoi-dung/luoc-do";
import { danhSachNguoiDung, luaChonChoForm, quyenGiaoDienNguoiDung } from "@/modules/nguoi-dung/service";

export const dynamic = "force-dynamic";

export default async function TrangNguoiDung({ searchParams }: { searchParams: ThamSoTrang }) {
  const nd = await yeuCauQuyen("user.view");
  const sp = await searchParams;
  const boLoc = LuocDoLocNguoiDung.parse({
    q: layMot(sp.q),
    vaiTro: layMot(sp.vaiTro),
    phongBan: layMot(sp.phongBan),
    trangThai: ["", "hoat-dong", "ngung-hoat-dong"].includes(layMot(sp.trangThai)) ? layMot(sp.trangThai) : "",
    trang: layMot(sp.trang) || 1,
  });

  const [kq, luaChon, phongBanMa] = await docDuLieu(nd, async (tx) => {
    const nc = taoNguCanh(tx, nd.phien.tenantId, nd.hoSo);
    return Promise.all([
      danhSachNguoiDung(nc, boLoc),
      luaChonChoForm(tx),
      tx.department.findMany({ select: { code: true, name: true }, orderBy: { name: "asc" } }),
    ]);
  });
  const quyen = quyenGiaoDienNguoiDung(nd.hoSo);
  const coLoc = Boolean(boLoc.q || boLoc.vaiTro || boLoc.phongBan || boLoc.trangThai);

  return (
    <>
      <DauTrang
        tieuDe="Người dùng"
        duongDan={[{ nhan: "Quản trị" }]}
        moTa="Tài khoản đăng nhập của nhân viên, phòng ban, quản lý trực tiếp và vai trò. Tài khoản máy của trợ lý AI không hiện ở đây."
        hanhDong={
          quyen.tao && (
            <Link className="nut chinh" href="/quan-tri/nguoi-dung/moi">
              <BieuTuong ten="them" co={16} /> Thêm người dùng
            </Link>
          )
        }
      />

      <section className="the">
        <form className="bo-loc" method="get">
          <div className="truong rong">
            <label htmlFor="q">Tìm</label>
            <input id="q" name="q" type="search" defaultValue={boLoc.q} placeholder="Họ tên, email, điện thoại, mã NV" />
          </div>
          <div className="truong">
            <label htmlFor="vaiTro">Vai trò</label>
            <select id="vaiTro" name="vaiTro" defaultValue={boLoc.vaiTro}>
              <option value="">Tất cả</option>
              {luaChon.vaiTro.map((v) => (
                <option key={v.id} value={v.code}>
                  {v.name}
                </option>
              ))}
            </select>
          </div>
          <div className="truong">
            <label htmlFor="phongBan">Phòng ban</label>
            <select id="phongBan" name="phongBan" defaultValue={boLoc.phongBan}>
              <option value="">Tất cả</option>
              {phongBanMa.map((p) => (
                <option key={p.code} value={p.code}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div className="truong">
            <label htmlFor="trangThai">Trạng thái</label>
            <select id="trangThai" name="trangThai" defaultValue={boLoc.trangThai}>
              <option value="">Tất cả</option>
              <option value="hoat-dong">Hoạt động</option>
              <option value="ngung-hoat-dong">Ngừng hoạt động</option>
            </select>
          </div>
          <button className="nut" type="submit">
            Lọc
          </button>
          {coLoc && (
            <Link className="nut trong" href="/quan-tri/nguoi-dung">
              Xóa lọc
            </Link>
          )}
        </form>

        {kq.dong.length === 0 ? (
          <TrongRong tieuDe={coLoc ? "Không có người dùng khớp bộ lọc" : "Chưa có người dùng nào"}>
            {coLoc ? "Thử bỏ bớt điều kiện lọc." : quyen.tao ? "Bấm “Thêm người dùng” để tạo tài khoản đầu tiên." : null}
          </TrongRong>
        ) : (
          <div className="cuon-ngang">
            <table className="bang">
              <thead>
                <tr>
                  <th>Người dùng</th>
                  <th>Phòng ban · chức danh</th>
                  <th>Vai trò</th>
                  <th>Trạng thái</th>
                  <th className="an-tren-dt">Đăng nhập gần nhất</th>
                </tr>
              </thead>
              <tbody>
                {kq.dong.map((u) => {
                  const dangKhoa = u.khoaDen && new Date(u.khoaDen) > new Date();
                  return (
                    <tr key={u.id} className={u.trangThai !== "hoat-dong" ? "mo" : undefined}>
                      <td>
                        <Link href={`/quan-tri/nguoi-dung/${u.id}`}>{u.hoTen}</Link>
                        <div className="dong-phu">
                          {u.email}
                          {u.maNhanVien ? ` · ${u.maNhanVien}` : ""}
                        </div>
                      </td>
                      <td>
                        {u.phongBan?.name ?? <span className="mo">Chưa gán</span>}
                        {u.chucDanh && <div className="dong-phu">{u.chucDanh}</div>}
                      </td>
                      <td>
                        <div className="chuoi-huy-hieu">
                          {u.vaiTro.length === 0 ? (
                            <span className="mo">Chưa có</span>
                          ) : (
                            u.vaiTro.map((v) => (
                              <span className="huy-hieu chinh" key={v.id}>
                                {v.name}
                              </span>
                            ))
                          )}
                        </div>
                      </td>
                      <td>
                        <div className="chuoi-huy-hieu">
                          <TrangThai giaTri={u.trangThai} />
                          {dangKhoa && <span className="huy-hieu canh-bao">Đang khóa tạm</span>}
                          {u.phaiDoiMatKhau && <span className="huy-hieu">Chờ đổi mật khẩu</span>}
                        </div>
                      </td>
                      <td className="an-tren-dt so nho">{u.dangNhapCuoi ? dinhDangNgayGio(u.dangNhapCuoi) : "Chưa từng"}</td>
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
          duongDan="/quan-tri/nguoi-dung"
          thamSo={{ q: boLoc.q, vaiTro: boLoc.vaiTro, phongBan: boLoc.phongBan, trangThai: boLoc.trangThai }}
        />
      </section>
    </>
  );
}
