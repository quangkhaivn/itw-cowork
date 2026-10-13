import { z } from "zod";
import type { NguCanh } from "@/lib/api";
import type { ClientTenant } from "@/lib/db";
import { batBuocQuyen } from "@/lib/phan-quyen";
import { LoiKhongTimThay, LoiNghiepVu } from "@/lib/loi";
import { SU_KIEN } from "@/lib/su-kien";
import { locTheoPhamVi } from "@/modules/crm/chung";
import { ghiDoiHanhTrinh } from "@/modules/hanh-trinh/service";
import { tinhLaiDiemKhach } from "@/modules/cham-diem/service";

/**
 * Gộp khách hàng trùng — BUSINESS_RULES.md mục 21 (KHN-11, KHN-12). QĐ-51.
 *
 * Chọn khách GIỮ LẠI và khách BỊ GỘP. Trong MỘT giao dịch: mọi bản ghi tham chiếu khách bị gộp
 * (liên hệ, lead, tương tác, cơ hội, công việc, báo giá, đơn, hóa đơn, phiếu thu, bảo hành,
 * phiếu hỗ trợ, dự án, hợp đồng bảo trì, gia hạn, trả hàng, nhóm…) chuyển sang khách giữ lại;
 * khách bị gộp KHÔNG bị xóa — chuyển trạng thái `da-gop` và trỏ sang khách giữ lại.
 *
 * Danh sách bảng tham chiếu **đọc từ catalog của PostgreSQL** lúc chạy (khóa ngoại trỏ vào
 * `customers.id`), không viết tay — bảng mới thêm sau này có khóa ngoại tới khách sẽ tự được
 * chuyển, không bị sót. Chỉ ba chỗ xử lý riêng:
 *   - `customer_group_members`: khóa duy nhất (nhóm, khách) → gắn bù rồi gỡ dòng của khách bị gộp.
 *   - `customer_journey_history`: sổ chỉ-ghi-thêm, giữ nguyên làm bằng chứng lịch sử.
 *   - `customers.merged_into_id`: khách từng gộp vào khách bị gộp → trỏ thẳng sang khách giữ lại.
 *
 * Quyền: `customer.approve` và cả hai khách nằm trong phạm vi `customer.update` của người gộp.
 */

export const LuocDoGopKhach = z.object({
  giuLaiId: z.uuid("Chọn khách giữ lại."),
  biGopId: z.uuid("Chọn khách bị gộp."),
  lyDo: z.string().trim().min(3, "Ghi lý do gộp (tối thiểu 3 ký tự).").max(1000),
});

/** Bảng tham chiếu cần xử lý riêng — không đi qua đường chuyển chung. */
const XU_LY_RIENG = new Set(["customer_group_members.customer_id", "customer_journey_history.customer_id", "customers.merged_into_id"]);
/** Sổ chỉ-ghi-thêm: giữ nguyên dòng trỏ vào khách bị gộp. */
export const BANG_GIU_NGUYEN = new Set(["customer_journey_history.customer_id"]);

const TEN_SQL = /^[a-z_][a-z0-9_]*$/;

export interface ThamChieuKhach {
  bang: string;
  cot: string;
}

/** Mọi cột khóa ngoại (một cột) trỏ vào `customers.id`, đọc từ catalog. */
export async function cotThamChieuKhach(tx: ClientTenant): Promise<ThamChieuKhach[]> {
  const ds = await tx.$queryRaw<{ bang: string; cot: string }[]>`
    SELECT cl.relname::text AS bang, a.attname::text AS cot
    FROM pg_constraint c
    JOIN pg_class cl ON cl.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = cl.relnamespace AND n.nspname = 'public'
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
    WHERE c.contype = 'f' AND c.confrelid = 'public.customers'::regclass AND array_length(c.conkey, 1) = 1
    ORDER BY 1, 2
  `;
  return ds.filter((d) => TEN_SQL.test(d.bang) && TEN_SQL.test(d.cot));
}

async function demThamChieu(tx: ClientTenant, khachId: string, ds: ThamChieuKhach[]) {
  const kq: Record<string, number> = {};
  for (const { bang, cot } of ds) {
    // Tên bảng/cột lấy từ catalog và đã qua khuôn TEN_SQL; giá trị luôn là tham số.
    const r = await tx.$queryRawUnsafe<{ n: number }[]>(`SELECT count(*)::int AS n FROM "${bang}" WHERE "${cot}" = $1::uuid`, khachId);
    kq[`${bang}.${cot}`] = Number(r[0]?.n ?? 0);
  }
  return kq;
}

async function docHaiKhach(nc: NguCanh, giuLaiId: string, biGopId: string, tc: { khoa?: boolean } = {}) {
  batBuocQuyen(nc.hoSo, "customer.approve", { objectType: "customer", objectId: biGopId });
  if (giuLaiId === biGopId) throw new LoiNghiepVu("Chọn hai khách khác nhau.", 400, "cung-khach");
  if (tc.khoa) {
    // Chống gộp đồng thời tạo chuỗi gộp (C→B trong lúc B→A): khóa hai dòng khách THEO THỨ TỰ id
    // (tránh khóa chéo), rồi mới đọc và kiểm `da-gop` — lần đọc sau khóa thấy trạng thái đã chốt
    // của giao dịch gộp kia. Giữ khóa tới hết giao dịch.
    await nc.tx.$queryRaw`SELECT id FROM customers WHERE id = ANY(${[giuLaiId, biGopId]}::uuid[]) ORDER BY id FOR UPDATE`;
  }
  const phamVi = await locTheoPhamVi(nc, "customer.update");
  const chon = {
    id: true, code: true, name: true, taxCode: true, taxCodeNormalized: true, phone: true, phoneNormalized: true,
    email: true, emailNormalized: true, address: true, province: true, website: true, customerType: true,
    segment: true, industry: true, source: true, note: true, status: true, ownerId: true, journeyStageId: true,
    campaignId: true, campaign: { select: { code: true, name: true } },
    owner: { select: { fullName: true } },
  } as const;
  const [giu, gop] = await Promise.all([
    nc.tx.customer.findFirst({ where: { id: giuLaiId, ...phamVi }, select: chon }),
    nc.tx.customer.findFirst({ where: { id: biGopId, ...phamVi }, select: chon }),
  ]);
  if (!giu || !gop) throw new LoiKhongTimThay("Khách hàng");
  for (const k of [giu, gop]) {
    if (k.status === "da-gop") throw new LoiNghiepVu(`Khách ${k.code} đã được gộp trước đó.`, 409, "da-gop");
  }
  if (giu.taxCodeNormalized && gop.taxCodeNormalized && giu.taxCodeNormalized !== gop.taxCodeNormalized) {
    throw new LoiNghiepVu(
      `Hai khách có mã số thuế khác nhau (${giu.taxCode} và ${gop.taxCode}) — là hai pháp nhân khác nhau, không gộp được.`,
      409,
      "khac-ma-so-thue",
    );
  }
  return { giu, gop };
}

/** Các trường còn trống ở khách giữ lại sẽ lấy từ khách bị gộp. */
const TRUONG_BO_SUNG = [
  ["taxCode", "Mã số thuế"],
  ["phone", "Điện thoại"],
  ["email", "Email"],
  ["address", "Địa chỉ"],
  ["province", "Tỉnh / thành"],
  ["website", "Website"],
  ["customerType", "Loại khách"],
  ["segment", "Phân khúc"],
  ["industry", "Ngành nghề"],
  ["source", "Nguồn"],
  // Gói Marketing (MK-10): chiến dịch chạm đầu tiên — khách giữ lại chưa có thì nhận của khách bị gộp.
  ["campaignId", "Chiến dịch marketing"],
] as const;

export async function xemTruocGop(nc: NguCanh, giuLaiId: string, biGopId: string) {
  const { giu, gop } = await docHaiKhach(nc, giuLaiId, biGopId);
  const ds = await cotThamChieuKhach(nc.tx);
  const dem = await demThamChieu(nc.tx, gop.id, ds);
  return {
    giuLai: { id: giu.id, ma: giu.code, ten: giu.name, maSoThue: giu.taxCode, nguoiPhuTrach: giu.owner.fullName },
    biGop: { id: gop.id, ma: gop.code, ten: gop.name, maSoThue: gop.taxCode, nguoiPhuTrach: gop.owner.fullName },
    chuyen: Object.entries(dem)
      .filter(([k]) => k !== "customers.merged_into_id")
      .map(([k, n]) => ({ bang: k, so: n, giuNguyen: BANG_GIU_NGUYEN.has(k) })),
    boSung: TRUONG_BO_SUNG.filter(([t]) => !giu[t] && gop[t]).map(([t, nhan]) => ({
      truong: nhan,
      giaTri: t === "campaignId" && gop.campaign ? `${gop.campaign.code} — ${gop.campaign.name}` : String(gop[t]),
    })),
  };
}

export async function gopKhach(nc: NguCanh, d: z.infer<typeof LuocDoGopKhach>) {
  const { giu, gop } = await docHaiKhach(nc, d.giuLaiId, d.biGopId, { khoa: true });
  const ds = await cotThamChieuKhach(nc.tx);
  const truoc = await demThamChieu(nc.tx, gop.id, ds);

  // 1. Liên hệ: khách giữ lại đã có liên hệ chính thì liên hệ chuyển sang không còn là "chính".
  if (await nc.tx.contact.count({ where: { customerId: giu.id, isPrimary: true } })) {
    await nc.tx.contact.updateMany({ where: { customerId: gop.id, isPrimary: true }, data: { isPrimary: false } });
  }

  // 2. Nhóm: gắn bù các nhóm khách giữ lại chưa có, rồi gỡ thành viên của khách bị gộp (bảng nối).
  const nhomGop = await nc.tx.customerGroupMember.findMany({ where: { customerId: gop.id }, select: { groupId: true } });
  const nhomGiu = new Set((await nc.tx.customerGroupMember.findMany({ where: { customerId: giu.id }, select: { groupId: true } })).map((m) => m.groupId));
  const nhomThem = nhomGop.map((m) => m.groupId).filter((g) => !nhomGiu.has(g));
  if (nhomThem.length) {
    await nc.tx.customerGroupMember.createMany({ data: nhomThem.map((groupId) => ({ tenantId: nc.tenantId, groupId, customerId: giu.id, createdBy: nc.hoSo.userId })) });
  }
  await nc.tx.customerGroupMember.deleteMany({ where: { customerId: gop.id } });

  // 3. Mọi bảng còn lại có khóa ngoại tới khách: chuyển nguyên sang khách giữ lại.
  const daChuyen: Record<string, number> = {};
  for (const { bang, cot } of ds) {
    const khoa = `${bang}.${cot}`;
    if (XU_LY_RIENG.has(khoa)) continue;
    daChuyen[khoa] = await nc.tx.$executeRawUnsafe(`UPDATE "${bang}" SET "${cot}" = $1::uuid WHERE "${cot}" = $2::uuid`, giu.id, gop.id);
  }
  // Khách từng gộp vào khách bị gộp → trỏ thẳng sang khách giữ lại (không để chuỗi gộp).
  daChuyen["customers.merged_into_id"] = (await nc.tx.customer.updateMany({ where: { mergedIntoId: gop.id }, data: { mergedIntoId: giu.id } })).count;

  // 3b. Việc hôm nay đang mở về khách bị gộp → đóng (bỏ qua, ghi lý do); thông báo chưa đọc → trỏ sang
  //     khách giữ lại. Không chuyển việc sang khách giữ lại: khóa chống trùng theo ngày có thể đụng
  //     việc cùng loại của khách giữ lại, và bản quét hôm sau tự sinh lại việc nếu vẫn cần.
  daChuyen["daily_action_items.dong"] = (
    await nc.tx.dailyActionItem.updateMany({
      where: { objectType: "customer", objectId: gop.id, status: "mo" },
      data: { status: "bo-qua", resolvedAt: new Date(), resolvedBy: nc.hoSo.userId, skipReason: `Khách đã gộp vào ${giu.code}` },
    })
  ).count;
  daChuyen["notifications.object_id"] = (
    await nc.tx.notification.updateMany({
      where: { objectType: "customer", objectId: gop.id, readAt: null },
      data: { objectId: giu.id, link: `/crm/khach-hang/${giu.id}` },
    })
  ).count;

  // 4. Bổ sung thông tin còn trống. MST là duy nhất nên phải gỡ khỏi khách bị gộp trước.
  const boSung: Record<string, string> = {};
  const data: Record<string, unknown> = {};
  for (const [t] of TRUONG_BO_SUNG) {
    if (!giu[t] && gop[t]) {
      boSung[t] = String(gop[t]);
      data[t] = gop[t];
    }
  }
  if (data.taxCode) data.taxCodeNormalized = gop.taxCodeNormalized;
  if (data.phone) data.phoneNormalized = gop.phoneNormalized;
  if (data.email) data.emailNormalized = gop.emailNormalized;

  const luc = new Date();
  await nc.tx.customer.update({
    where: { id: gop.id },
    data: {
      status: "da-gop",
      mergedIntoId: giu.id,
      mergedAt: luc,
      mergedBy: nc.hoSo.userId,
      ...(data.taxCode ? { taxCodeNormalized: null } : {}),
      note: [gop.note, `Đã gộp vào khách ${giu.code} ngày ${luc.toISOString().slice(0, 10)}. Lý do: ${d.lyDo}`].filter(Boolean).join("\n"),
      updatedBy: nc.hoSo.userId,
    },
  });
  if (Object.keys(data).length) await nc.tx.customer.update({ where: { id: giu.id }, data: { ...data, updatedBy: nc.hoSo.userId } });

  // 5. Hành trình: khách giữ lại chưa có trạng thái thì nhận trạng thái của khách bị gộp.
  if (!giu.journeyStageId && gop.journeyStageId) {
    await ghiDoiHanhTrinh(nc, { id: giu.id, journeyStageId: null }, gop.journeyStageId, { ghiChu: `Nhận trạng thái khi gộp khách ${gop.code}` });
  }
  await tinhLaiDiemKhach(nc.tx, giu.id);
  await tinhLaiDiemKhach(nc.tx, gop.id);

  const sau = await demThamChieu(nc.tx, gop.id, ds);
  await nc.kiemToan({
    action: "gop-khach",
    objectType: "customer",
    objectId: gop.id,
    before: { maKhach: gop.code, thamChieu: truoc },
    after: { gopVao: giu.id, maGopVao: giu.code, lyDo: d.lyDo, daChuyen, boSung, conLai: sau },
  });
  await nc.kiemToan({ action: "gop-khach", objectType: "customer", objectId: giu.id, after: { nhanTu: gop.id, maNhanTu: gop.code, daChuyen, boSung } });
  await nc.suKien({ eventType: SU_KIEN.CUSTOMER_MERGED, objectType: "customer", objectId: giu.id, payload: { giuLai: giu.id, biGop: gop.id, daChuyen } });
  return { giuLaiId: giu.id, biGopId: gop.id, daChuyen, boSung };
}
