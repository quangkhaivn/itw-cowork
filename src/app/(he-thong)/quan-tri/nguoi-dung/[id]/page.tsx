import Link from "next/link";
import { notFound } from "next/navigation";
import DauTrang from "@/components/ui/DauTrang";
import TrangThai from "@/components/ui/TrangThai";
import { taoNguCanh } from "@/lib/api";
import { dinhDangNgayGio } from "@/lib/dinh-dang";
import { LoiKhongTimThay } from "@/lib/loi";
import { coQuyen } from "@/lib/phan-quyen";
import { docDuLieu, layMot, yeuCauQuyen, type ThamSoTrang } from "@/lib/trang";
import { NHAN_HANH_DONG } from "@/modules/kiem-toan/service";
import { chiTietNguoiDung, luaChonChoForm } from "@/modules/nguoi-dung/service";
import FormNguoiDung from "../FormNguoiDung";
import TacVuTaiKhoan from "./TacVuTaiKhoan";

export const dynamic = "force-dynamic";

const LA_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function TrangChiTietNguoiDung({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: ThamSoTrang;
}) {
  const nd = await yeuCauQuyen("user.view");
  const { id } = await params;
  if (!LA_UUID.test(id)) notFound();
  const moTao = layMot((await searchParams).moTao) === "1";

  const duLieu = await docDuLieu(nd, async (tx) => {
    const nc = taoNguCanh(tx, nd.phien.tenantId, nd.hoSo);
    try {
      const [nguoi, luaChon] = await Promise.all([chiTietNguoiDung(nc, id), luaChonChoForm(tx)]);
      const lichSu = coQuyen(nd.hoSo, "audit_log.view")
        ? await tx.auditLog.findMany({
            where: { objectType: "user", objectId: id },
            orderBy: { createdAt: "desc" },
            take: 15,
            select: { id: true, action: true, actorEmail: true, createdAt: true, ipAddress: true },
          })
        : null;
      return { nguoi, luaChon, lichSu };
    } catch (loi) {
      if (loi instanceof LoiKhongTimThay) return null;
      throw loi;
    }
  });
  if (!duLieu) notFound();
  const { nguoi, luaChon, lichSu } = duLieu;

  const duocSua = coQuyen(nd.hoSo, "user.update") && !nguoi.laTaiKhoanMay;
  const dangKhoa = Boolean(nguoi.khoaDen && new Date(nguoi.khoaDen) > new Date());

  return (
    <>
      <DauTrang
        tieuDe={nguoi.hoTen}
        duongDan={[{ nhan: "Quản trị" }, { nhan: "Người dùng", href: "/quan-tri/nguoi-dung" }]}
        moTa={
          <>
            {nguoi.email} · <TrangThai giaTri={nguoi.trangThai} />{" "}
            {dangKhoa && <span className="huy-hieu canh-bao">Khóa tạm đến {dinhDangNgayGio(nguoi.khoaDen)}</span>}{" "}
            {nguoi.phaiDoiMatKhau && <span className="huy-hieu">Chờ đổi mật khẩu</span>}
          </>
        }
      />

      {moTao && (
        <div className="hop-thong-bao tot" role="status">
          Đã tạo tài khoản. Trao mật khẩu khởi tạo trực tiếp cho nhân viên; hệ thống không lưu và không hiện lại mật khẩu này.
        </div>
      )}

      {duocSua ? (
        <FormNguoiDung
          luaChon={luaChon}
          duocDoiVaiTro={coQuyen(nd.hoSo, "role.update")}
          banDau={{
            id: nguoi.id,
            email: nguoi.email,
            hoTen: nguoi.hoTen,
            dienThoai: nguoi.dienThoai ?? "",
            maNhanVien: nguoi.maNhanVien ?? "",
            chucDanh: nguoi.chucDanh ?? "",
            phongBanId: nguoi.phongBan?.id ?? "",
            quanLyId: nguoi.quanLy?.id ?? "",
            vaiTroIds: nguoi.vaiTro.map((v) => v.id),
          }}
        />
      ) : (
        <section className="the">
          <div className="than">
            <p>
              <strong>Phòng ban:</strong> {nguoi.phongBan?.name ?? "Chưa gán"} · <strong>Chức danh:</strong>{" "}
              {nguoi.chucDanh ?? "—"} · <strong>Quản lý:</strong> {nguoi.quanLy?.hoTen ?? "—"}
            </p>
            <div className="chuoi-huy-hieu">
              {nguoi.vaiTro.map((v) => (
                <span className="huy-hieu chinh" key={v.id}>
                  {v.name}
                </span>
              ))}
            </div>
            {nguoi.laTaiKhoanMay && <p className="phu" style={{ marginTop: 12 }}>Tài khoản máy — không sửa qua giao diện.</p>}
          </div>
        </section>
      )}

      <div className="luoi-the" style={{ marginTop: 16 }}>
        {duocSua && (
          <TacVuTaiKhoan
            id={nguoi.id}
            trangThai={nguoi.trangThai}
            dangKhoa={dangKhoa}
            laChinhMinh={nguoi.id === nd.hoSo.userId}
          />
        )}
        {lichSu && (
          <section className="the">
            <div className="dau">
              <h2>Lịch sử thay đổi</h2>
              <Link className="nho" href={`/quan-tri/nhat-ky-kiem-toan?doiTuongId=${nguoi.id}`}>
                Xem đầy đủ
              </Link>
            </div>
            {lichSu.length === 0 ? (
              <div className="than phu">Chưa có ghi nhận.</div>
            ) : (
              <table className="bang">
                <tbody>
                  {lichSu.map((l) => (
                    <tr key={l.id}>
                      <td className="so nho" style={{ whiteSpace: "nowrap" }}>
                        {dinhDangNgayGio(l.createdAt)}
                      </td>
                      <td>
                        {NHAN_HANH_DONG[l.action] ?? l.action}
                        <div className="dong-phu">
                          {l.actorEmail ?? "hệ thống"}
                          {l.ipAddress ? ` · ${l.ipAddress}` : ""}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        )}
      </div>
    </>
  );
}
