import Link from "next/link";
import DauTrang from "@/components/ui/DauTrang";
import { dinhDangNgayGio } from "@/lib/dinh-dang";
import { NHAN_PHAM_VI } from "@/lib/pham-vi";
import { docDuLieu, yeuCauDangNhap } from "@/lib/trang";
import { taoNguCanh } from "@/lib/api";
import { trangThai2LopCuaToi } from "@/modules/xac-thuc-2-lop/service";
import Khung2Lop from "@/components/bao-mat/Khung2Lop";
import { MO_TA_HANH_DONG, MO_TA_PHAN_HE, type HanhDongQuyen, type PhanHe } from "@/lib/vai-tro";

export const dynamic = "force-dynamic";

/** Tài khoản của tôi: thông tin, vai trò, và toàn bộ quyền đang có — để ai cũng tự kiểm được mình được làm gì. */
export default async function TrangTaiKhoan() {
  const nd = await yeuCauDangNhap();
  const toi = await docDuLieu(nd, (tx) =>
    tx.user.findFirst({
      where: { id: nd.hoSo.userId },
      select: {
        phone: true,
        lastLoginAt: true,
        passwordChangedAt: true,
        staffProfile: {
          select: { jobTitle: true, employeeCode: true, department: { select: { name: true } }, manager: { select: { fullName: true } } },
        },
      },
    }),
  );

  const haiLop = await docDuLieu(nd, (tx) => trangThai2LopCuaToi(taoNguCanh(tx, nd.phien.tenantId, nd.hoSo)));

  // Gom quyền theo phân hệ: phân hệ → [(hành động, phạm vi)].
  const theoPhanHe = new Map<string, { hanhDong: string; phamVi: string }[]>();
  for (const [ma, pv] of nd.hoSo.phamVi) {
    const [ph, hd] = ma.split(".");
    theoPhanHe.set(ph, [...(theoPhanHe.get(ph) ?? []), { hanhDong: hd, phamVi: pv }]);
  }

  return (
    <>
      <DauTrang tieuDe="Tài khoản của tôi" hanhDong={<Link className="nut" href="/doi-mat-khau">Đổi mật khẩu</Link>} />
      <div className="luoi-the">
        <section className="the">
          <div className="dau">
            <h2>Thông tin</h2>
          </div>
          <div className="than">
            <table className="bang">
              <tbody>
                <tr><td className="phu">Họ tên</td><td>{nd.hoSo.hoTen}</td></tr>
                <tr><td className="phu">Email đăng nhập</td><td>{nd.hoSo.email}</td></tr>
                <tr><td className="phu">Doanh nghiệp</td><td>{nd.tenant.name} (mã: {nd.tenant.code})</td></tr>
                <tr><td className="phu">Điện thoại</td><td>{toi?.phone ?? "—"}</td></tr>
                <tr><td className="phu">Phòng ban</td><td>{toi?.staffProfile?.department?.name ?? "Chưa gán"}</td></tr>
                <tr><td className="phu">Chức danh</td><td>{toi?.staffProfile?.jobTitle ?? "—"}</td></tr>
                <tr><td className="phu">Quản lý trực tiếp</td><td>{toi?.staffProfile?.manager?.fullName ?? "—"}</td></tr>
                <tr><td className="phu">Đăng nhập gần nhất</td><td>{dinhDangNgayGio(toi?.lastLoginAt)}</td></tr>
                <tr><td className="phu">Đổi mật khẩu gần nhất</td><td>{dinhDangNgayGio(toi?.passwordChangedAt)}</td></tr>
              </tbody>
            </table>
          </div>
        </section>
        <section className="the">
          <div className="dau">
            <h2>Vai trò</h2>
          </div>
          <div className="than">
            <div className="chuoi-huy-hieu">
              {nd.hoSo.vaiTro.map((v) => (
                <span className="huy-hieu chinh" key={v.code}>
                  {v.name}
                </span>
              ))}
            </div>
            <p className="phu" style={{ marginTop: 12 }}>
              Cần thêm quyền thì đề nghị Quản trị hệ thống. Quyền mới có hiệu lực ngay, không cần đăng nhập lại.
            </p>
          </div>
        </section>
      </div>

      <section className="the" id="xac-thuc-2-lop">
        <div className="dau">
          <h2>Xác thực 2 lớp</h2>
        </div>
        <div className="than">
          <Khung2Lop trangThai={{ ...haiLop, batLuc: haiLop.batLuc?.toISOString() ?? null }} />
        </div>
      </section>

      <section className="the">
        <div className="dau">
          <h2>Quyền của tôi ({nd.hoSo.quyen.size})</h2>
        </div>
        <div className="cuon-ngang">
          <table className="bang">
            <thead>
              <tr>
                <th>Phân hệ</th>
                <th>Được phép</th>
              </tr>
            </thead>
            <tbody>
              {[...theoPhanHe].map(([ph, ds]) => (
                <tr key={ph}>
                  <td>{MO_TA_PHAN_HE[ph as PhanHe] ?? ph}</td>
                  <td>
                    <div className="chuoi-huy-hieu">
                      {ds.map((q) => (
                        <span className="huy-hieu" key={q.hanhDong}>
                          {MO_TA_HANH_DONG[q.hanhDong as HanhDongQuyen] ?? q.hanhDong}
                          {q.phamVi !== "all" && ` · ${NHAN_PHAM_VI[q.phamVi as keyof typeof NHAN_PHAM_VI]}`}
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
