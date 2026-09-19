import { redirect } from "next/navigation";
import { voiTenant } from "@/lib/db";
import { layPhienHienTai } from "@/lib/xac-thuc";
import { layHoSoQuyen } from "@/lib/phan-quyen";
import NutDangXuat from "./NutDangXuat";

export const dynamic = "force-dynamic";

export default async function BangDieuKhien() {
  const phien = await layPhienHienTai();
  if (!phien) redirect("/dang-nhap");

  const duLieu = await voiTenant(phien.tenantId, async (tx) => {
    const hoSo = await layHoSoQuyen(tx, phien.userId);
    if (!hoSo) return null;

    const [tenant, soNguoiDung, soVaiTro, soSuKien, suKienGanDay] = await Promise.all([
      tx.tenant.findFirst({ select: { name: true, code: true } }),
      tx.user.count({ where: { status: "hoat-dong" } }),
      tx.role.count({ where: { status: "hoat-dong" } }),
      tx.businessEvent.count(),
      tx.businessEvent.findMany({
        orderBy: { createdAt: "desc" },
        take: 10,
        select: { eventType: true, actorType: true, objectType: true, createdAt: true },
      }),
    ]);

    return { hoSo, tenant, soNguoiDung, soVaiTro, soSuKien, suKienGanDay };
  });

  if (!duLieu?.hoSo) redirect("/dang-nhap");

  const { hoSo, tenant, soNguoiDung, soVaiTro, soSuKien, suKienGanDay } = duLieu;

  return (
    <main className="trang">
      <div className="dau-trang">
        <div>
          <h1>Cowork Business OS</h1>
          <p className="phu">
            {tenant?.name ?? "—"} · {phien.email}
          </p>
        </div>
        <NutDangXuat />
      </div>

      <div className="luoi">
        <div className="o">
          <div className="so">{soNguoiDung}</div>
          <div className="ten">Người dùng đang hoạt động</div>
        </div>
        <div className="o">
          <div className="so">{soVaiTro}</div>
          <div className="ten">Vai trò</div>
        </div>
        <div className="o">
          <div className="so">{hoSo.quyen.size}</div>
          <div className="ten">Quyền của bạn</div>
        </div>
        <div className="o">
          <div className="so">{soSuKien}</div>
          <div className="ten">Business Events đã ghi</div>
        </div>
      </div>

      <h2>Vai trò của bạn</h2>
      <div>
        {hoSo.vaiTro.length === 0 ? (
          <p className="phu">Chưa được gán vai trò nào.</p>
        ) : (
          hoSo.vaiTro.map((v) => (
            <span className="chip" key={v.code}>
              {v.name}
            </span>
          ))
        )}
      </div>

      <h2>Sự kiện gần đây</h2>
      <div className="cuon">
        <table>
          <thead>
            <tr>
              <th>Thời điểm</th>
              <th>Sự kiện</th>
              <th>Tác nhân</th>
              <th>Đối tượng</th>
            </tr>
          </thead>
          <tbody>
            {suKienGanDay.length === 0 ? (
              <tr>
                <td colSpan={4} className="phu">
                  Chưa có sự kiện nào.
                </td>
              </tr>
            ) : (
              suKienGanDay.map((s, i) => (
                <tr key={i}>
                  <td>{s.createdAt.toLocaleString("vi-VN")}</td>
                  <td>{s.eventType}</td>
                  <td>{s.actorType}</td>
                  <td>{s.objectType}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <h2>Phạm vi Phase 1</h2>
      <p className="phu">
        Đây là nền móng: multi-tenant, người dùng, phân quyền, Business Events, Audit Log. Các phân hệ
        nghiệp vụ (Khách hàng, Lead, Cơ hội, Báo giá, Đơn hàng, Dự án) thuộc Phase 2 theo mục 28 đặc tả
        và chưa được xây.
      </p>
    </main>
  );
}
