import type { z } from "zod";
import type { NguCanh } from "@/lib/api";
import { LoiKhongTimThay, LoiNghiepVu, laLoiTrung } from "@/lib/loi";
import { batBuocQuyen, coQuyen } from "@/lib/phan-quyen";
import { dieuKienXemBai } from "./chung";
import type { LuocDoChienDich } from "./luoc-do";

/**
 * Chiến dịch nội dung (0.25.0, QĐ-232): nhóm bài theo chiến dịch (tên, thời gian, mục tiêu), liên kết TÙY CHỌN tới một
 * chiến dịch Marketing đã có (bảng `marketing_campaigns`) — chỉ người xem được Marketing mới chọn / thấy tên chiến dịch đó.
 * Xem: `mxh.view`; tạo / sửa / lưu trữ: `mxh.update`. Không xóa (lưu trữ thay vì xóa — bài vẫn giữ nhãn chiến dịch).
 */

const ngay = (s: string | null | undefined) => (s ? new Date(`${s}T00:00:00Z`) : null);
const ngayRa = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

async function kiemChienDichMarketing(nc: NguCanh, id: string | null | undefined): Promise<string | null> {
  if (!id) return null;
  if (!coQuyen(nc.hoSo, "marketing.view")) throw new LoiNghiepVu("Bạn không có quyền xem chiến dịch Marketing để liên kết.", 403, "khong-co-quyen");
  const m = await nc.tx.marketingCampaign.findFirst({ where: { id }, select: { id: true } });
  if (!m) throw new LoiNghiepVu("Chiến dịch Marketing không tồn tại.", 404, "khong-tim-thay");
  return m.id;
}

export async function danhSachChienDich(nc: NguCanh, coLuuTru = false) {
  batBuocQuyen(nc.hoSo, "mxh.view");
  const ds = await nc.tx.socialCampaign.findMany({
    where: coLuuTru ? {} : { status: "hoat-dong" },
    include: { marketingCampaign: { select: { id: true, code: true, name: true } } },
    orderBy: [{ status: "asc" }, { startsOn: "desc" }, { name: "asc" }],
    take: 500,
  });
  const dk = await dieuKienXemBai(nc);
  const dem = await nc.tx.socialPost.groupBy({ by: ["campaignId", "status"], where: { AND: [{ deletedAt: null, campaignId: { in: ds.map((c) => c.id) } }, dk] }, _count: { _all: true } });
  const xemMk = coQuyen(nc.hoSo, "marketing.view");
  return ds.map((c) => {
    const cua = dem.filter((x) => x.campaignId === c.id);
    return {
      id: c.id, ten: c.name, tuNgay: ngayRa(c.startsOn), denNgay: ngayRa(c.endsOn), mucTieu: c.goal, trangThai: c.status,
      chienDichMarketing: c.marketingCampaign && xemMk ? { id: c.marketingCampaign.id, ma: c.marketingCampaign.code, ten: c.marketingCampaign.name } : c.marketingCampaign ? { id: c.marketingCampaign.id, ma: null, ten: "(chiến dịch Marketing)" } : null,
      soBai: cua.reduce((n, x) => n + x._count._all, 0),
      soDaDang: cua.filter((x) => x.status === "PUBLISHED").reduce((n, x) => n + x._count._all, 0),
    };
  });
}

/** Chiến dịch Marketing để chọn liên kết (chỉ người có marketing.view). */
export async function chienDichMarketingDeChon(nc: NguCanh) {
  batBuocQuyen(nc.hoSo, "mxh.view");
  if (!coQuyen(nc.hoSo, "marketing.view")) return [];
  const ds = await nc.tx.marketingCampaign.findMany({ where: { status: { notIn: ["huy"] } }, select: { id: true, code: true, name: true }, orderBy: { createdAt: "desc" }, take: 200 });
  return ds.map((m) => ({ id: m.id, ma: m.code, ten: m.name }));
}

export async function taoChienDich(nc: NguCanh, d: z.infer<typeof LuocDoChienDich>) {
  batBuocQuyen(nc.hoSo, "mxh.update", { objectType: "social_campaign" });
  const mk = await kiemChienDichMarketing(nc, d.chienDichMarketingId);
  const id = crypto.randomUUID();
  try {
    await nc.tx.$executeRaw`SAVEPOINT tao_chien_dich_mxh`;
    await nc.tx.socialCampaign.create({ data: { id, tenantId: nc.tenantId, name: d.ten, startsOn: ngay(d.tuNgay), endsOn: ngay(d.denNgay), goal: d.mucTieu || null, marketingCampaignId: mk, createdBy: nc.hoSo.userId } });
    await nc.tx.$executeRaw`RELEASE SAVEPOINT tao_chien_dich_mxh`;
  } catch (e) {
    if (laLoiTrung(e)) {
      await nc.tx.$executeRaw`ROLLBACK TO SAVEPOINT tao_chien_dich_mxh`;
      throw new LoiNghiepVu(`Đã có chiến dịch tên “${d.ten}”.`, 409, "trung-ten");
    }
    throw e;
  }
  await nc.kiemToan({ action: "tao-chien-dich-mxh", objectType: "social_campaign", objectId: id, after: { ten: d.ten, tuNgay: d.tuNgay ?? null, denNgay: d.denNgay ?? null, lienKetMarketing: Boolean(mk) } });
  return (await danhSachChienDich(nc, true)).find((c) => c.id === id)!;
}

export async function suaChienDich(nc: NguCanh, id: string, d: z.infer<typeof LuocDoChienDich>) {
  batBuocQuyen(nc.hoSo, "mxh.update", { objectType: "social_campaign", objectId: id });
  const cu = await nc.tx.socialCampaign.findFirst({ where: { id } });
  if (!cu) throw new LoiKhongTimThay("Chiến dịch");
  const mk = d.chienDichMarketingId === undefined ? cu.marketingCampaignId : d.chienDichMarketingId === cu.marketingCampaignId ? cu.marketingCampaignId : await kiemChienDichMarketing(nc, d.chienDichMarketingId);
  try {
    await nc.tx.$executeRaw`SAVEPOINT sua_chien_dich_mxh`;
    await nc.tx.socialCampaign.update({ where: { id }, data: { name: d.ten, startsOn: ngay(d.tuNgay), endsOn: ngay(d.denNgay), goal: d.mucTieu || null, marketingCampaignId: mk, ...(d.trangThai ? { status: d.trangThai } : {}), updatedBy: nc.hoSo.userId } });
    await nc.tx.$executeRaw`RELEASE SAVEPOINT sua_chien_dich_mxh`;
  } catch (e) {
    if (laLoiTrung(e)) {
      await nc.tx.$executeRaw`ROLLBACK TO SAVEPOINT sua_chien_dich_mxh`;
      throw new LoiNghiepVu(`Đã có chiến dịch tên “${d.ten}”.`, 409, "trung-ten");
    }
    throw e;
  }
  await nc.kiemToan({ action: "sua-chien-dich-mxh", objectType: "social_campaign", objectId: id, before: { ten: cu.name, trangThai: cu.status }, after: { ten: d.ten, trangThai: d.trangThai ?? cu.status } });
  return (await danhSachChienDich(nc, true)).find((c) => c.id === id)!;
}
