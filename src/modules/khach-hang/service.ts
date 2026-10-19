import type { Prisma } from "@/generated/prisma/client";
import type { NguCanh } from "@/lib/api";
import { batBuocQuyen, coQuyen, idNguoiTrongPhamVi } from "@/lib/phan-quyen";
import { LoiKhongTimThay, LoiNghiepVu, laLoiTrung } from "@/lib/loi";
import { SU_KIEN } from "@/lib/su-kien";
import { capSoChungTu, KIEU_SO } from "@/lib/so-chung-tu";
import { chuanHoaDienThoai, chuanHoaEmail, chuanHoaMaSoThue, chuanHoaTen } from "@/modules/crm/chuan-hoa";
import { homNayVN, kiemTraMaDuLieuGoc, kiemTraNguoiPhuTrach, locTheoPhamVi, ngayVeDate, tienVeChuoi, trongPhamVi } from "@/modules/crm/chung";
import { CO_HOI_DANG_MO, NHAN_DANH_GIA_KET_QUA, NHAN_GIAI_DOAN, NHAN_TUONG_TAC, tinhPipeline } from "@/modules/crm/hang-so";
import { danhGiaHoSoKhach } from "./ho-so";
import type { BoLocKhachHang, DuLieuLienHe, DuLieuSuaKhachHang, DuLieuTaoKhachHang } from "./luoc-do";
import { LuocDoSuaLienHe } from "./luoc-do";
import type { z } from "zod";
import { docCauHinh } from "@/modules/cau-hinh/service";
import { khiCoSuKienKhach } from "./su-kien-khach";
import { khachDungLau } from "@/modules/hanh-trinh/service";

/**
 * Phân hệ Khách hàng — nghiệp vụ. Luật: BUSINESS_RULES.md mục 3 (KH-01 → KH-07).
 *
 * Quyền: `customer.*`. Phạm vi theo `customers.owner_id`. Liên hệ đi theo khách:
 * thấy khách thì thấy liên hệ; sửa khách thì sửa được liên hệ.
 */

/** Ngưỡng tương đồng tên (pg_trgm) để cảnh báo "có thể trùng". Kỹ thuật, không phải ngưỡng nghiệp vụ. */
const NGUONG_TEN_GAN_GIONG = 0.6;

const CHON_KHACH = {
  id: true,
  code: true,
  name: true,
  taxCode: true,
  customerType: true,
  segment: true,
  industry: true,
  source: true,
  address: true,
  province: true,
  website: true,
  phone: true,
  email: true,
  ownerId: true,
  note: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  owner: { select: { id: true, fullName: true } },
  // 0.16.0
  journeyStageChangedAt: true,
  journeyStage: { select: { id: true, name: true, color: true, kind: true, staleDays: true } },
  leadScore: true,
  leadScoreAt: true,
  mergedAt: true,
  mergedInto: { select: { id: true, code: true, name: true } },
} satisfies Prisma.CustomerSelect;

type BanGhiKhach = Prisma.CustomerGetPayload<{ select: typeof CHON_KHACH }>;

function chuyenDoi(k: BanGhiKhach) {
  return {
    id: k.id,
    ma: k.code,
    ten: k.name,
    maSoThue: k.taxCode,
    loaiKhach: k.customerType,
    phanKhuc: k.segment,
    nganh: k.industry,
    nguon: k.source,
    diaChi: k.address,
    tinhThanh: k.province,
    website: k.website,
    dienThoai: k.phone,
    email: k.email,
    nguoiPhuTrach: { id: k.owner.id, hoTen: k.owner.fullName },
    ghiChu: k.note,
    trangThai: k.status,
    taoLuc: k.createdAt,
    suaLuc: k.updatedAt,
    hanhTrinh: k.journeyStage
      ? { id: k.journeyStage.id, ten: k.journeyStage.name, mau: k.journeyStage.color, loai: k.journeyStage.kind, soNgayDungLau: k.journeyStage.staleDays, tuLuc: k.journeyStageChangedAt }
      : null,
    diem: k.leadScore,
    diemLuc: k.leadScoreAt,
    gopVao: k.mergedInto ? { id: k.mergedInto.id, ma: k.mergedInto.code, ten: k.mergedInto.name, luc: k.mergedAt } : null,
  };
}
export type KhachHangChiTiet = ReturnType<typeof chuyenDoi>;

/** Ảnh chụp để ghi before/after kiểm toán. */
function anhChup(k: KhachHangChiTiet) {
  // Hành trình, điểm, gộp có nhật ký riêng — không lặp vào ảnh chụp sửa thông tin.
  const { taoLuc: _t, suaLuc: _s, nguoiPhuTrach, hanhTrinh: _h, diem: _d, diemLuc: _dl, gopVao: _g, ...con } = k;
  void _t;
  void _s;
  void _h;
  void _d;
  void _dl;
  void _g;
  return { ...con, nguoiPhuTrachId: nguoiPhuTrach.id };
}

// ---------------------------------------------------------------------------
// Chống trùng (KH-02, KH-03, KH-04)
// ---------------------------------------------------------------------------

export interface UngVienTrung {
  loai: "khach-hang" | "lead";
  id: string;
  ma: string;
  ten: string;
  nguoiPhuTrach: string;
  lyDo: string[];
  /** Người đang thao tác có được mở bản ghi này không — để giao diện có hiện liên kết hay không. */
  moDuoc: boolean;
}

interface KhoaNhanDien {
  maSoThue?: string | null;
  dienThoai?: string | null;
  email?: string | null;
  tenChuan?: string | null;
  boQuaId?: string | null;
}

/**
 * Tìm khách có thể trùng trên TOÀN doanh nghiệp (không lọc theo phạm vi — KH-04).
 * Chỉ trả mã, tên, người phụ trách, lý do: đủ để người nhập biết mà hỏi đồng nghiệp,
 * không lộ chi tiết khách ngoài phạm vi.
 */
export async function timKhachCoTheTrung(nc: NguCanh, k: KhoaNhanDien): Promise<UngVienTrung[]> {
  const theoId = new Map<string, { id: string; code: string; name: string; ownerId: string; ownerName: string; lyDo: Set<string> }>();
  const them = (c: { id: string; code: string; name: string; ownerId: string; owner: { fullName: string } }, lyDo: string) => {
    if (k.boQuaId && c.id === k.boQuaId) return;
    const cu = theoId.get(c.id) ?? { id: c.id, code: c.code, name: c.name, ownerId: c.ownerId, ownerName: c.owner.fullName, lyDo: new Set<string>() };
    cu.lyDo.add(lyDo);
    theoId.set(c.id, cu);
  };
  const chon = { id: true, code: true, name: true, ownerId: true, owner: { select: { fullName: true } } } as const;

  if (k.maSoThue) {
    for (const c of await nc.tx.customer.findMany({ where: { taxCodeNormalized: k.maSoThue }, select: chon, take: 5 })) {
      them(c, "Trùng mã số thuế");
    }
  }
  if (k.dienThoai) {
    for (const c of await nc.tx.customer.findMany({
      where: { OR: [{ phoneNormalized: k.dienThoai }, { contacts: { some: { phoneNormalized: k.dienThoai } } }] },
      select: chon,
      take: 5,
    })) {
      them(c, "Trùng số điện thoại");
    }
  }
  if (k.email) {
    for (const c of await nc.tx.customer.findMany({
      where: { OR: [{ emailNormalized: k.email }, { contacts: { some: { emailNormalized: k.email } } }] },
      select: chon,
      take: 5,
    })) {
      them(c, "Trùng email");
    }
  }
  if (k.tenChuan && k.tenChuan.length >= 3) {
    const gan = await nc.tx.$queryRaw<{ id: string; diem: number }[]>`
      SELECT id::text AS id, similarity(name_normalized, ${k.tenChuan}) AS diem
      FROM customers
      WHERE name_normalized % ${k.tenChuan} AND similarity(name_normalized, ${k.tenChuan}) >= ${NGUONG_TEN_GAN_GIONG}
      ORDER BY diem DESC
      LIMIT 5
    `;
    if (gan.length) {
      const ds = await nc.tx.customer.findMany({ where: { id: { in: gan.map((g) => g.id) } }, select: chon });
      for (const c of ds) them(c, "Tên gần giống");
    }
  }

  const pv = await idNguoiTrongPhamVi(nc.tx, nc.hoSo, "customer.view");
  return [...theoId.values()].map((c) => ({
    loai: "khach-hang" as const,
    id: c.id,
    ma: c.code,
    ten: c.name,
    nguoiPhuTrach: c.ownerName,
    lyDo: [...c.lyDo],
    moDuoc: pv === "tat-ca" || pv.includes(c.ownerId),
  }));
}

/** Chuẩn hóa bộ khóa nhận diện từ dữ liệu người nhập — ném LoiDinhDang nếu sai dạng. */
export function khoaNhanDien(d: { ten?: string | null; maSoThue?: string | null; dienThoai?: string | null; email?: string | null }) {
  return {
    tenChuan: d.ten ? chuanHoaTen(d.ten) : null,
    maSoThue: chuanHoaMaSoThue(d.maSoThue),
    dienThoai: chuanHoaDienThoai(d.dienThoai),
    email: chuanHoaEmail(d.email),
  };
}

/** API dò trùng cho form (gọi trước khi bấm lưu). Cần quyền tạo hoặc sửa khách. */
export async function doTrungKhachHang(
  nc: NguCanh,
  d: { ten: string; maSoThue: string; dienThoai: string; email: string; boQuaId: string },
) {
  if (!coQuyen(nc.hoSo, "customer.create") && !coQuyen(nc.hoSo, "customer.update")) {
    batBuocQuyen(nc.hoSo, "customer.create", { objectType: "customer" });
  }
  let khoa;
  try {
    khoa = khoaNhanDien(d);
  } catch {
    // Đang gõ dở (MST 7 số…) thì chưa dò, không báo lỗi ở đây — lúc lưu mới kiểm dạng.
    return { ungVien: [] as UngVienTrung[] };
  }
  return { ungVien: await timKhachCoTheTrung(nc, { ...khoa, boQuaId: d.boQuaId || null }) };
}

/** Chặn cứng trùng MST (KH-02); cảnh báo mềm các loại trùng khác nếu chưa xác nhận (KH-03). */
async function kiemTraTrung(nc: NguCanh, khoa: KhoaNhanDien, xacNhan: boolean) {
  const ungVien = await timKhachCoTheTrung(nc, khoa);
  const trungMst = ungVien.find((u) => u.lyDo.includes("Trùng mã số thuế"));
  if (trungMst) {
    throw new LoiNghiepVu(
      `Mã số thuế đã thuộc khách hàng ${trungMst.ma} — ${trungMst.ten} (phụ trách: ${trungMst.nguoiPhuTrach}). Mỗi mã số thuế chỉ một khách hàng.`,
      409,
      "trung-ma-so-thue",
      { ungVien: [trungMst] },
    );
  }
  if (ungVien.length && !xacNhan) {
    throw new LoiNghiepVu(
      "Có khách hàng trông giống khách bạn đang nhập. Kiểm tra danh sách; nếu đúng là khách mới thì xác nhận để lưu.",
      409,
      "co-the-trung",
      { ungVien },
    );
  }
}

// ---------------------------------------------------------------------------
// Đọc
// ---------------------------------------------------------------------------

/**
 * Điều kiện lọc danh sách khách (dùng chung cho danh sách, đếm theo hành trình, xuất CSV).
 * Phạm vi `customer.view` LUÔN được áp — bộ lọc dùng chung áp vào sale vẫn chỉ ra khách
 * của sale (KHN-07). `boHanhTrinh` = bỏ điều kiện hành trình để đếm từng thẻ trạng thái.
 */
export async function dieuKienLocKhach(
  nc: NguCanh,
  boLoc: BoLocKhachHang,
  tc: { boHanhTrinh?: boolean } = {},
): Promise<{ where: Prisma.CustomerWhereInput; canhBao: string | null }> {
  const dieuKien: Prisma.CustomerWhereInput[] = [await locTheoPhamVi(nc, "customer.view")];
  let canhBao: string | null = null;
  if (boLoc.q) {
    const q = boLoc.q;
    const so = q.replace(/\D/g, "");
    dieuKien.push({
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { nameNormalized: { contains: chuanHoaTen(q) } },
        { code: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
        ...(so.length >= 4
          ? [
              { taxCodeNormalized: { contains: so } },
              { phoneNormalized: { contains: so } },
              { contacts: { some: { phoneNormalized: { contains: so } } } },
            ]
          : []),
        { contacts: { some: { OR: [{ fullName: { contains: q, mode: "insensitive" as const } }, { emailNormalized: { contains: q.toLowerCase() } }] } } },
      ],
    });
  }
  if (boLoc.nguoiPhuTrach) dieuKien.push({ ownerId: boLoc.nguoiPhuTrach });
  if (boLoc.phanKhuc) dieuKien.push({ segment: boLoc.phanKhuc });
  // Khách đã gộp ẩn khỏi danh sách, trừ khi tra đúng trạng thái "đã gộp" (KHN-12).
  dieuKien.push(boLoc.trangThai ? { status: boLoc.trangThai } : { status: { not: "da-gop" } });
  if (boLoc.hanhTrinh && !tc.boHanhTrinh) dieuKien.push({ journeyStageId: boLoc.hanhTrinh === "chua-co" ? null : boLoc.hanhTrinh });
  if (boLoc.nhom) dieuKien.push({ groupMembers: { some: { groupId: boLoc.nhom } } });

  switch (boLoc.nhanh) {
    case "cua-toi":
      dieuKien.push({ ownerId: nc.hoSo.userId });
      break;
    case "chua-co-hanh-trinh":
      dieuKien.push({ journeyStageId: null });
      break;
    case "co-co-hoi-mo":
      dieuKien.push({ opportunities: { some: { stage: { in: CO_HOI_DANG_MO }, status: "hoat-dong" } } });
      break;
    case "chua-tuong-tac":
      dieuKien.push({ interactions: { none: { status: "hoat-dong" } } });
      break;
    case "dung-lau": {
      // Cùng một hàm với máy quét nhắc việc (ngày lịch giờ VN, bỏ khách ngừng / đã gộp, bỏ trạng
      // thái đã ngừng) — lọc nhanh và chuông nhắc không bao giờ nói hai điều khác nhau.
      const ds = await khachDungLau(nc.tx);
      dieuKien.push({ id: { in: ds.map((x) => x.id) } });
      if (!(await nc.tx.customerJourneyStage.count({ where: { staleDays: { not: null } } }))) {
        canhBao = "Chưa trạng thái hành trình nào đặt số ngày “đứng lâu” — đặt ở trang Hành trình khách hàng.";
      }
      break;
    }
    case "sinh-nhat-thang-nay": {
      const thang = Number(homNayVN().slice(5, 7));
      const ids = await nc.tx.$queryRaw<{ id: string }[]>`
        SELECT DISTINCT customer_id::text AS id FROM contacts
        WHERE status = 'hoat-dong' AND birth_date IS NOT NULL AND extract(month FROM birth_date) = ${thang}
      `;
      dieuKien.push({ id: { in: ids.map((x) => x.id) } });
      break;
    }
    case "nong": {
      const nong = await docCauHinh(nc.tx, "diem_khach.nguong_nong");
      if (nong === null) {
        canhBao = "Chưa đặt ngưỡng điểm khách Nóng ở Quản trị → Cấu hình — chưa lọc được khách nóng.";
        dieuKien.push({ id: { in: [] } });
      } else {
        dieuKien.push({ leadScore: { gte: nong } });
      }
      break;
    }
    default:
      break;
  }
  return { where: { AND: dieuKien }, canhBao };
}

function thuTuSapXep(ma: string | undefined): Prisma.CustomerOrderByWithRelationInput[] {
  switch (ma) {
    case "moi-tao":
      return [{ createdAt: "desc" }];
    case "ten":
      return [{ name: "asc" }];
    case "diem":
      return [{ leadScore: { sort: "desc", nulls: "last" } }, { updatedAt: "desc" }];
    case "dung-lau-nhat":
      return [{ journeyStageChangedAt: { sort: "asc", nulls: "last" } }, { updatedAt: "desc" }];
    default:
      return [{ updatedAt: "desc" }];
  }
}

export async function danhSachKhachHang(nc: NguCanh, boLoc: BoLocKhachHang) {
  batBuocQuyen(nc.hoSo, "customer.view");
  const { where, canhBao } = await dieuKienLocKhach(nc, boLoc);
  const [tong, dong] = await Promise.all([
    nc.tx.customer.count({ where }),
    nc.tx.customer.findMany({
      where,
      select: {
        ...CHON_KHACH,
        _count: { select: { opportunities: { where: { stage: { in: CO_HOI_DANG_MO } } }, contacts: { where: { status: "hoat-dong" } } } },
        groupMembers: { select: { group: { select: { id: true, name: true, color: true } } } },
      },
      orderBy: thuTuSapXep(boLoc.sapXep),
      skip: (boLoc.trang - 1) * boLoc.coTrang,
      take: boLoc.coTrang,
    }),
  ]);
  return {
    tong,
    trang: boLoc.trang,
    coTrang: boLoc.coTrang,
    canhBao,
    dong: dong.map((k) => ({
      ...chuyenDoi(k),
      soCoHoiMo: k._count.opportunities,
      soLienHe: k._count.contacts,
      nhom: k.groupMembers.map((m) => ({ id: m.group.id, ten: m.group.name, mau: m.group.color })),
    })),
  };
}

/** Số khách theo từng trạng thái hành trình, với cùng bộ lọc (trừ chính điều kiện hành trình). */
export async function demTheoHanhTrinh(nc: NguCanh, boLoc: BoLocKhachHang) {
  batBuocQuyen(nc.hoSo, "customer.view");
  const { where } = await dieuKienLocKhach(nc, boLoc, { boHanhTrinh: true });
  const nhom = await nc.tx.customer.groupBy({ by: ["journeyStageId"], where, _count: { _all: true } });
  const theoId: Record<string, number> = {};
  let tong = 0;
  for (const g of nhom) {
    theoId[g.journeyStageId ?? "chua-co"] = g._count._all;
    tong += g._count._all;
  }
  return { tong, theoId };
}

/** Đọc một khách trong phạm vi `maQuyen` — ngoài phạm vi thì coi như không tồn tại (404). */
async function docKhachTrongPhamVi(nc: NguCanh, id: string, maQuyen: string): Promise<KhachHangChiTiet> {
  const k = await nc.tx.customer.findFirst({ where: { id, ...(await locTheoPhamVi(nc, maQuyen)) }, select: CHON_KHACH });
  if (!k) throw new LoiKhongTimThay("Khách hàng");
  return chuyenDoi(k);
}

export async function chiTietKhachHang(nc: NguCanh, id: string) {
  batBuocQuyen(nc.hoSo, "customer.view", { objectType: "customer", objectId: id });
  return docKhachTrongPhamVi(nc, id, "customer.view");
}

/** Kiểm người dùng thấy được khách này — các phân hệ khác (cơ hội, tương tác) gọi trước khi gắn. */
export async function batBuocThayKhach(nc: NguCanh, id: string) {
  batBuocQuyen(nc.hoSo, "customer.view", { objectType: "customer", objectId: id });
  const k = await docKhachTrongPhamVi(nc, id, "customer.view");
  chanKhachDaGop(k);
  return k;
}

/** KHN-13: không gắn bản ghi mới, không sửa khách đã gộp — chỉ đường đúng là khách giữ lại. */
export function chanKhachDaGop(k: { ma: string; trangThai: string; gopVao: { ma: string; ten: string } | null }) {
  if (k.trangThai === "da-gop") {
    throw new LoiNghiepVu(
      `Khách ${k.ma} đã được gộp vào ${k.gopVao ? `${k.gopVao.ma} — ${k.gopVao.ten}` : "khách khác"}. Dùng khách giữ lại.`,
      409,
      "da-gop",
      { gopVao: k.gopVao },
    );
  }
}

// ---------------------------------------------------------------------------
// Ghi
// ---------------------------------------------------------------------------

/** Loại dữ liệu gốc mà form khách hàng dùng. */
export const LOAI_DU_LIEU_KHACH = ["loai_khach_hang", "phan_khuc_khach_hang", "nganh_nghe", "nguon_lead"];

async function kiemTraMaDuLieu(
  nc: NguCanh,
  d: { loaiKhach?: string | null; phanKhuc?: string | null; nganh?: string | null; nguon?: string | null },
  truoc?: KhachHangChiTiet,
) {
  await kiemTraMaDuLieuGoc(nc, "loai_khach_hang", d.loaiKhach, "loaiKhach", truoc?.loaiKhach);
  await kiemTraMaDuLieuGoc(nc, "phan_khuc_khach_hang", d.phanKhuc, "phanKhuc", truoc?.phanKhuc);
  await kiemTraMaDuLieuGoc(nc, "nganh_nghe", d.nganh, "nganh", truoc?.nganh);
  await kiemTraMaDuLieuGoc(nc, "nguon_lead", d.nguon, "nguon", truoc?.nguon);
}

export async function taoKhachHang(nc: NguCanh, d: DuLieuTaoKhachHang) {
  batBuocQuyen(nc.hoSo, "customer.create", { objectType: "customer" });
  const khoa = khoaNhanDien(d);
  const ownerId = d.nguoiPhuTrachId ?? nc.hoSo.userId;
  await kiemTraNguoiPhuTrach(nc, "customer.create", ownerId);
  await kiemTraMaDuLieu(nc, d);
  await kiemTraTrung(nc, khoa, d.xacNhanKhongTrung);

  // Liên hệ chính: chuẩn hóa trước khi cấp số, để lỗi định dạng không làm nhảy số.
  const lh = d.lienHe ? { ...d.lienHe, dt: chuanHoaDienThoai(d.lienHe.dienThoai), em: chuanHoaEmail(d.lienHe.email) } : null;

  const ma = await capSoChungTu(nc.tx, KIEU_SO.khachHang);
  try {
    const k = await nc.tx.customer.create({
      data: {
        tenantId: nc.tenantId,
        code: ma,
        name: d.ten,
        nameNormalized: khoa.tenChuan ?? chuanHoaTen(d.ten),
        taxCode: d.maSoThue ?? null,
        taxCodeNormalized: khoa.maSoThue,
        customerType: d.loaiKhach ?? null,
        segment: d.phanKhuc ?? null,
        industry: d.nganh ?? null,
        source: d.nguon ?? null,
        address: d.diaChi ?? null,
        province: d.tinhThanh ?? null,
        website: d.website ?? null,
        phone: d.dienThoai ?? null,
        phoneNormalized: khoa.dienThoai,
        email: d.email ?? null,
        emailNormalized: khoa.email,
        ownerId,
        note: d.ghiChu ?? null,
        createdBy: nc.hoSo.userId,
        updatedBy: nc.hoSo.userId,
      },
      select: CHON_KHACH,
    });
    const kq = chuyenDoi(k);
    await nc.kiemToan({ action: "tao", objectType: "customer", objectId: k.id, after: anhChup(kq) });
    await nc.suKien({ eventType: SU_KIEN.CUSTOMER_CREATED, objectType: "customer", objectId: k.id, payload: { ma } });

    if (lh) {
      await ghiLienHeMoi(nc, k.id, { ...lh, laChinh: true }, lh.dt, lh.em);
    }
    await khiCoSuKienKhach(nc, k.id, "tao-khach");
    return kq;
  } catch (loi) {
    if (laLoiTrung(loi)) throw new LoiNghiepVu("Mã số thuế hoặc mã khách đã tồn tại.", 409, "trung");
    throw loi;
  }
}

export async function suaKhachHang(nc: NguCanh, id: string, d: DuLieuSuaKhachHang) {
  batBuocQuyen(nc.hoSo, "customer.update", { objectType: "customer", objectId: id });
  const truoc = await docKhachTrongPhamVi(nc, id, "customer.update");
  chanKhachDaGop(truoc);

  // Chỉ chuẩn hóa và dò trùng những khóa nhận diện thực sự đổi.
  const doiMst = d.maSoThue !== undefined && d.maSoThue !== truoc.maSoThue;
  const doiDt = d.dienThoai !== undefined && d.dienThoai !== truoc.dienThoai;
  const doiEmail = d.email !== undefined && d.email !== truoc.email;
  const doiTen = d.ten !== undefined && d.ten !== truoc.ten;
  const khoa = khoaNhanDien({
    ten: doiTen ? d.ten : null,
    maSoThue: doiMst ? d.maSoThue : null,
    dienThoai: doiDt ? d.dienThoai : null,
    email: doiEmail ? d.email : null,
  });
  if (doiMst || doiDt || doiEmail || doiTen) await kiemTraTrung(nc, { ...khoa, boQuaId: id }, d.xacNhanKhongTrung);

  if (d.nguoiPhuTrachId && d.nguoiPhuTrachId !== truoc.nguoiPhuTrach.id) {
    await kiemTraNguoiPhuTrach(nc, "customer.update", d.nguoiPhuTrachId);
  }
  await kiemTraMaDuLieu(nc, d, truoc);

  try {
    const k = await nc.tx.customer.update({
      where: { id },
      data: {
        ...(d.ten !== undefined && { name: d.ten, nameNormalized: chuanHoaTen(d.ten) }),
        ...(doiMst && { taxCode: d.maSoThue ?? null, taxCodeNormalized: khoa.maSoThue }),
        ...(doiDt && { phone: d.dienThoai ?? null, phoneNormalized: khoa.dienThoai }),
        ...(doiEmail && { email: d.email ?? null, emailNormalized: khoa.email }),
        ...(d.loaiKhach !== undefined && { customerType: d.loaiKhach }),
        ...(d.phanKhuc !== undefined && { segment: d.phanKhuc }),
        ...(d.nganh !== undefined && { industry: d.nganh }),
        ...(d.nguon !== undefined && { source: d.nguon }),
        ...(d.diaChi !== undefined && { address: d.diaChi }),
        ...(d.tinhThanh !== undefined && { province: d.tinhThanh }),
        ...(d.website !== undefined && { website: d.website }),
        ...(d.ghiChu !== undefined && { note: d.ghiChu }),
        ...(d.nguoiPhuTrachId && { ownerId: d.nguoiPhuTrachId }),
        ...(d.trangThai !== undefined && { status: d.trangThai }),
        updatedBy: nc.hoSo.userId,
      },
      select: CHON_KHACH,
    });
    const sau = chuyenDoi(k);
    await nc.kiemToan({ action: "sua", objectType: "customer", objectId: id, before: anhChup(truoc), after: anhChup(sau) });
    await nc.suKien({
      eventType: SU_KIEN.CUSTOMER_UPDATED,
      objectType: "customer",
      objectId: id,
      payload: sau.nguoiPhuTrach.id !== truoc.nguoiPhuTrach.id ? { doiNguoiPhuTrach: { tu: truoc.nguoiPhuTrach.id, sang: sau.nguoiPhuTrach.id } } : {},
    });
    return sau;
  } catch (loi) {
    if (laLoiTrung(loi)) throw new LoiNghiepVu("Mã số thuế đã thuộc một khách hàng khác.", 409, "trung-ma-so-thue");
    throw loi;
  }
}

// ---------------------------------------------------------------------------
// Liên hệ
// ---------------------------------------------------------------------------

const CHON_LIEN_HE = {
  id: true,
  customerId: true,
  fullName: true,
  title: true,
  department: true,
  phone: true,
  email: true,
  zalo: true,
  birthDate: true,
  isPrimary: true,
  note: true,
  status: true,
} satisfies Prisma.ContactSelect;

function lienHeRa(c: Prisma.ContactGetPayload<{ select: typeof CHON_LIEN_HE }>) {
  return {
    id: c.id,
    khachHangId: c.customerId,
    hoTen: c.fullName,
    chucDanh: c.title,
    phongBan: c.department,
    dienThoai: c.phone,
    email: c.email,
    zalo: c.zalo,
    ngaySinh: c.birthDate ? c.birthDate.toISOString().slice(0, 10) : null,
    laChinh: c.isPrimary,
    ghiChu: c.note,
    trangThai: c.status,
  };
}
export type LienHe = ReturnType<typeof lienHeRa>;

async function ghiLienHeMoi(nc: NguCanh, khachId: string, d: DuLieuLienHe, dt: string | null, em: string | null) {
  if (d.laChinh) {
    await nc.tx.contact.updateMany({ where: { customerId: khachId, isPrimary: true }, data: { isPrimary: false } });
  }
  const c = await nc.tx.contact.create({
    data: {
      tenantId: nc.tenantId,
      customerId: khachId,
      fullName: d.hoTen,
      title: d.chucDanh ?? null,
      department: d.phongBan ?? null,
      phone: d.dienThoai ?? null,
      phoneNormalized: dt,
      email: d.email ?? null,
      emailNormalized: em,
      zalo: d.zalo ?? null,
      birthDate: d.ngaySinh ? ngayVeDate(d.ngaySinh) : null,
      isPrimary: d.laChinh ?? false,
      note: d.ghiChu ?? null,
      createdBy: nc.hoSo.userId,
      updatedBy: nc.hoSo.userId,
    },
    select: CHON_LIEN_HE,
  });
  const kq = lienHeRa(c);
  await nc.kiemToan({ action: "tao", objectType: "contact", objectId: c.id, after: kq });
  await nc.suKien({ eventType: SU_KIEN.CONTACT_CREATED, objectType: "contact", objectId: c.id, payload: { khachHangId: khachId } });
  return kq;
}

/** Gắn liên hệ mới cho khách — dùng chung cho form, nhập CSV, script nhập từ ITW CRM. */

export async function taoLienHe(nc: NguCanh, khachId: string, d: DuLieuLienHe) {
  batBuocQuyen(nc.hoSo, "customer.update", { objectType: "customer", objectId: khachId });
  chanKhachDaGop(await docKhachTrongPhamVi(nc, khachId, "customer.update"));
  const kq = await ghiLienHeMoi(nc, khachId, d, chuanHoaDienThoai(d.dienThoai), chuanHoaEmail(d.email));
  await khiCoSuKienKhach(nc, khachId);
  return kq;
}

export async function suaLienHe(nc: NguCanh, id: string, d: z.infer<typeof LuocDoSuaLienHe>) {
  const truocGoc = await nc.tx.contact.findFirst({ where: { id }, select: CHON_LIEN_HE });
  if (!truocGoc) throw new LoiKhongTimThay("Liên hệ");
  batBuocQuyen(nc.hoSo, "customer.update", { objectType: "contact", objectId: id });
  chanKhachDaGop(await docKhachTrongPhamVi(nc, truocGoc.customerId, "customer.update"));
  const truoc = lienHeRa(truocGoc);

  if (d.laChinh) {
    await nc.tx.contact.updateMany({ where: { customerId: truoc.khachHangId, isPrimary: true, NOT: { id } }, data: { isPrimary: false } });
  }
  const c = await nc.tx.contact.update({
    where: { id },
    data: {
      ...(d.hoTen !== undefined && { fullName: d.hoTen }),
      ...(d.chucDanh !== undefined && { title: d.chucDanh }),
      ...(d.phongBan !== undefined && { department: d.phongBan }),
      ...(d.dienThoai !== undefined && { phone: d.dienThoai, phoneNormalized: chuanHoaDienThoai(d.dienThoai) }),
      ...(d.email !== undefined && { email: d.email, emailNormalized: chuanHoaEmail(d.email) }),
      ...(d.zalo !== undefined && { zalo: d.zalo }),
      ...(d.ngaySinh !== undefined && { birthDate: d.ngaySinh ? ngayVeDate(d.ngaySinh) : null }),
      ...(d.laChinh !== undefined && { isPrimary: d.laChinh }),
      ...(d.ghiChu !== undefined && { note: d.ghiChu }),
      ...(d.trangThai !== undefined && { status: d.trangThai }),
      updatedBy: nc.hoSo.userId,
    },
    select: CHON_LIEN_HE,
  });
  const sau = lienHeRa(c);
  await nc.kiemToan({ action: "sua", objectType: "contact", objectId: id, before: truoc, after: sau });
  await khiCoSuKienKhach(nc, truoc.khachHangId);
  return sau;
}

// ---------------------------------------------------------------------------
// Customer 360
// ---------------------------------------------------------------------------

export interface MucDongThoiGian {
  thoiDiem: Date;
  loai: string;
  tieuDe: string;
  moTa?: string | null;
  nguoi?: string | null;
  href?: string;
}

/**
 * Toàn cảnh một khách hàng (mục 7 prompt): tổng quan, liên hệ, cơ hội, tương tác, công việc
 * và dòng thời gian hợp nhất. Ai thấy khách thì thấy mọi thứ gắn với khách đó (theo
 * quyền xem phân hệ tương ứng) — CRM lấy tài khoản khách làm trung tâm.
 *
 * Dòng thời gian KHÔNG chép dữ liệu sang bảng riêng: đọc thẳng từ các bảng gốc rồi ghép.
 * Báo giá, đơn hàng, dự án, thanh toán, hỗ trợ, bảo hành sẽ thêm nhánh ở phase của chúng.
 */
export async function khach360(nc: NguCanh, id: string) {
  const khach = await chiTietKhachHang(nc, id);
  const xemCoHoi = coQuyen(nc.hoSo, "sales.view");
  const xemTuongTac = coQuyen(nc.hoSo, "crm.view") || coQuyen(nc.hoSo, "customer.view");
  const xemViec = coQuyen(nc.hoSo, "task.view");

  const [lienHe, coHoi, tuongTac, viec, leadGoc] = await Promise.all([
    nc.tx.contact.findMany({ where: { customerId: id }, select: CHON_LIEN_HE, orderBy: [{ status: "asc" }, { isPrimary: "desc" }, { fullName: "asc" }] }),
    xemCoHoi
      ? nc.tx.opportunity.findMany({
          where: { customerId: id },
          select: {
            id: true, code: true, title: true, stage: true, estimatedValue: true, probability: true,
            expectedCloseDate: true, nextAction: true, nextActionDate: true, closedAt: true, createdAt: true,
            owner: { select: { fullName: true } },
          },
          orderBy: [{ createdAt: "desc" }],
          take: 100,
        })
      : Promise.resolve([]),
    xemTuongTac
      ? nc.tx.interaction.findMany({
          where: { customerId: id, status: "hoat-dong" },
          select: {
            id: true, type: true, subject: true, content: true, outcome: true, occurredAt: true,
            owner: { select: { fullName: true } }, contact: { select: { fullName: true } },
            opportunity: { select: { id: true, code: true } },
          },
          orderBy: { occurredAt: "desc" },
          take: 50,
        })
      : Promise.resolve([]),
    xemViec
      ? nc.tx.task.findMany({
          where: { customerId: id },
          select: {
            id: true, title: true, status: true, priority: true, dueAt: true, completedAt: true, createdAt: true,
            result: true, outcome: true,
            owner: { select: { fullName: true } },
          },
          orderBy: [{ status: "asc" }, { dueAt: "asc" }],
          take: 50,
        })
      : Promise.resolve([]),
    nc.tx.lead.findMany({
      where: { convertedCustomerId: id },
      select: { id: true, code: true, fullName: true, convertedAt: true, source: true },
    }),
  ]);

  const dongThoiGian: MucDongThoiGian[] = [
    { thoiDiem: khach.taoLuc, loai: "khach-hang", tieuDe: `Tạo khách hàng ${khach.ma}` },
    ...leadGoc.map((l) => ({
      thoiDiem: l.convertedAt ?? khach.taoLuc,
      loai: "lead",
      tieuDe: `Chuyển đổi từ lead ${l.code} — ${l.fullName}`,
      href: `/crm/lead/${l.id}`,
    })),
    ...tuongTac.map((t) => ({
      thoiDiem: t.occurredAt,
      loai: "tuong-tac",
      tieuDe: `${NHAN_TUONG_TAC[t.type] ?? t.type}: ${t.subject}`,
      moTa: [t.content, t.outcome && `Kết quả: ${t.outcome}`].filter(Boolean).join(" — ") || null,
      nguoi: t.owner.fullName,
      href: t.opportunity ? `/ban-hang/co-hoi/${t.opportunity.id}` : undefined,
    })),
    ...coHoi.flatMap((c) => {
      const ds: MucDongThoiGian[] = [
        { thoiDiem: c.createdAt, loai: "co-hoi", tieuDe: `Mở cơ hội ${c.code} — ${c.title}`, nguoi: c.owner.fullName, href: `/ban-hang/co-hoi/${c.id}` },
      ];
      if (c.closedAt) {
        ds.push({
          thoiDiem: c.closedAt,
          loai: c.stage === "WON" ? "thang" : "thua",
          tieuDe: `${NHAN_GIAI_DOAN[c.stage]} cơ hội ${c.code}`,
          nguoi: c.owner.fullName,
          href: `/ban-hang/co-hoi/${c.id}`,
        });
      }
      return ds;
    }),
    ...viec.flatMap((v) => {
      const ds: MucDongThoiGian[] = [{ thoiDiem: v.createdAt, loai: "viec", tieuDe: `Giao việc: ${v.title}`, nguoi: v.owner.fullName, href: `/cong-viec/${v.id}` }];
      // 0.17.0 (CV-04): kết quả công việc hiện ngay trên dòng thời gian của khách — người sau
      // mở hồ sơ khách là biết lần trước đã làm gì, khách nói gì.
      if (v.completedAt) {
        ds.push({
          thoiDiem: v.completedAt,
          loai: "viec-xong",
          tieuDe: `Hoàn thành${v.outcome ? ` (${NHAN_DANH_GIA_KET_QUA[v.outcome] ?? v.outcome})` : ""}: ${v.title}`,
          moTa: v.result,
          nguoi: v.owner.fullName,
          href: `/cong-viec/${v.id}`,
        });
      }
      return ds;
    }),
  ].sort((a, b) => b.thoiDiem.getTime() - a.thoiDiem.getTime());

  const pipeline = tinhPipeline(coHoi);
  const daThang = coHoi.filter((c) => c.stage === "WON");

  return {
    khach,
    lienHe: lienHe.map(lienHeRa),
    coHoi: coHoi.map((c) => ({
      id: c.id,
      ma: c.code,
      tieuDe: c.title,
      giaiDoan: c.stage,
      giaTri: tienVeChuoi(c.estimatedValue) ?? "0",
      xacSuat: c.probability,
      ngayDuKienChot: c.expectedCloseDate,
      hanhDongKeTiep: c.nextAction,
      ngayHanhDong: c.nextActionDate,
      nguoiPhuTrach: c.owner.fullName,
    })),
    tuongTac: tuongTac.map((t) => ({
      id: t.id,
      loai: t.type,
      tieuDe: t.subject,
      noiDung: t.content,
      ketQua: t.outcome,
      luc: t.occurredAt,
      nguoi: t.owner.fullName,
      lienHe: t.contact?.fullName ?? null,
      coHoi: t.opportunity,
    })),
    viec: viec.map((v) => ({
      id: v.id,
      tieuDe: v.title,
      trangThai: v.status,
      uuTien: v.priority,
      han: v.dueAt,
      nguoi: v.owner.fullName,
      ketQua: v.result,
      danhGia: v.outcome,
    })),
    dongThoiGian: dongThoiGian.slice(0, 100),
    // 0.17.0 (HS-01): độ đầy đủ hồ sơ, tính lúc đọc từ chính các trường — không lưu điểm.
    hoSo: danhGiaHoSoKhach({
      loaiKhach: khach.loaiKhach,
      maSoThue: khach.maSoThue,
      dienThoai: khach.dienThoai,
      email: khach.email,
      diaChi: khach.diaChi,
      tinhThanh: khach.tinhThanh,
      nganh: khach.nganh,
      nguon: khach.nguon,
      soLienHe: lienHe.filter((l) => l.status === "hoat-dong").length,
    }),
    thongKe: {
      soCoHoiMo: pipeline.soLuong,
      giaTriPipeline: pipeline.tong,
      pipelineTrongSo: pipeline.coTrongSo,
      soCoHoiThang: daThang.length,
      giaTriDaThang: daThang.reduce((s, c) => s + Number(c.estimatedValue.toString()), 0),
    },
    quyen: { xemCoHoi, xemTuongTac, xemViec },
  };
}

/** Quyền giao diện của trang khách hàng — chỉ để ẩn/hiện nút; máy chủ kiểm lại khi gọi API. */
export async function quyenGiaoDienKhach(nc: NguCanh, ownerId?: string) {
  const sua = coQuyen(nc.hoSo, "customer.update") && (!ownerId || (await trongPhamVi(nc, "customer.update", ownerId)));
  return {
    tao: coQuyen(nc.hoSo, "customer.create"),
    sua,
    xuat: coQuyen(nc.hoSo, "customer.export"),
    quanLy: coQuyen(nc.hoSo, "customer.approve"),
    taoCoHoi: coQuyen(nc.hoSo, "sales.create"),
    ghiTuongTac: coQuyen(nc.hoSo, "crm.create"),
    taoViec: coQuyen(nc.hoSo, "task.create"),
  };
}
