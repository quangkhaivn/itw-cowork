import { z } from "zod";
import type { NguCanh } from "@/lib/api";
import { batBuocQuyen } from "@/lib/phan-quyen";
import { LoiNghiepVu } from "@/lib/loi";
import { SU_KIEN } from "@/lib/su-kien";
import { docBangCsv, taoCsv, type CotCsv } from "@/lib/csv";
import { boDau, chuanHoaDienThoai, chuanHoaEmail, chuanHoaMaSoThue } from "@/modules/crm/chuan-hoa";
import { NHAN_TRANG_THAI_KHACH, TRANG_THAI_KHACH } from "@/modules/crm/hang-so";
import { doiHanhTrinh } from "@/modules/hanh-trinh/service";
import { ganKhachVaoNhom } from "@/modules/nhom-khach/service";
import { LuocDoLocKhachHang, LuocDoTaoKhachHang } from "./luoc-do";
import { docNgayCsv } from "./tinh-toan";
import { danhSachKhachHang, suaKhachHang, suaLienHe, taoKhachHang, taoLienHe, type UngVienTrung } from "./service";

/**
 * Xuất / nhập khách hàng bằng CSV — BUSINESS_RULES.md mục 21 (KHN-16), làm y quy trình nhập
 * sản phẩm (SP-09): luôn XEM TRƯỚC rồi mới ghi, dòng hỏng bỏ qua kèm lý do, dòng tốt vẫn vào,
 * mỗi lần ghi lưu một `import_jobs`.
 *
 * Khác nhập sản phẩm một điểm: mỗi dòng chạy trong một SAVEPOINT. Xem trước = chạy THẬT từng
 * dòng qua đúng service rồi cuộn ngược savepoint — nên xem trước bắt được cả lỗi ràng buộc
 * CSDL, và kết quả xem trước trùng khít kết quả ghi. Một dòng hỏng giữa chừng cũng không
 * làm hỏng cả giao dịch.
 *
 * Dò trùng: Mã KH có sẵn → cập nhật khách đó; trùng MST (KH-02) → cập nhật khách mang MST đó;
 * trùng điện thoại / email / tên gần giống (KH-03) → bỏ qua dòng, trừ khi người nhập tích
 * "đã kiểm, đây là khách mới".
 */

export const LuocDoNhapKhachCsv = z.object({
  tenTep: z.string().trim().min(1).max(255),
  noiDung: z.string().max(10_000_000, "Tệp quá lớn (tối đa ~10 MB)."),
  ghiThat: z.boolean().optional().default(false),
  /** KH-03: người nhập đã kiểm danh sách "có thể trùng" và xác nhận đều là khách mới. */
  xacNhanTrung: z.boolean().optional().default(false),
});

const COT: CotCsv[] = [
  { truong: "ma", ten: ["ma kh", "mã kh", "ma khach", "ma khach hang", "mã khách hàng"] },
  { truong: "ten", ten: ["ten", "tên", "ten khach hang", "tên khách hàng", "khach hang", "khách hàng", "name"], batBuoc: true },
  { truong: "maSoThue", ten: ["mst", "ma so thue", "mã số thuế", "tax code"] },
  { truong: "loaiKhach", ten: ["loai khach", "loại khách"] },
  { truong: "phanKhuc", ten: ["phan khuc", "phân khúc"] },
  { truong: "nganh", ten: ["nganh", "ngành", "nganh nghe", "ngành nghề"] },
  { truong: "nguon", ten: ["nguon", "nguồn"] },
  { truong: "dienThoai", ten: ["dien thoai", "điện thoại", "sdt", "phone"] },
  { truong: "email", ten: ["email"] },
  { truong: "diaChi", ten: ["dia chi", "địa chỉ"] },
  { truong: "tinhThanh", ten: ["tinh thanh", "tỉnh / thành", "tinh/thanh", "tinh"] },
  { truong: "website", ten: ["website", "web"] },
  { truong: "nguoiPhuTrach", ten: ["nguoi phu trach", "người phụ trách", "phu trach", "email phu trach", "người phụ trách (email)"] },
  { truong: "trangThai", ten: ["trang thai", "trạng thái", "trang thai giao dich", "trạng thái giao dịch"] },
  { truong: "hanhTrinh", ten: ["hanh trinh", "hành trình", "trang thai hanh trinh", "trạng thái hành trình"] },
  { truong: "nhom", ten: ["nhom", "nhóm", "nhom khach", "nhóm khách"] },
  { truong: "lienHe", ten: ["lien he", "liên hệ", "nguoi lien he", "người liên hệ", "lien he chinh", "liên hệ chính"] },
  { truong: "dtLienHe", ten: ["dt lien he", "đt liên hệ", "dien thoai lien he", "điện thoại liên hệ"] },
  { truong: "emailLienHe", ten: ["email lien he", "email liên hệ"] },
  { truong: "ngaySinh", ten: ["ngay sinh", "ngày sinh", "ngay sinh lien he", "ngày sinh liên hệ"] },
  { truong: "ghiChu", ten: ["ghi chu", "ghi chú", "note"] },
  // Cột chỉ có khi xuất — nhập lại thì bỏ qua, không báo "cột lạ".
  { truong: "_diem", ten: ["diem", "điểm"] },
  // Cờ nhận tin marketing của liên hệ (gói Marketing, MK-13): CHỈ XUẤT. Đồng ý phải do chính người
  // đó tự tích (form / ghi nhận có bằng chứng) nên nhập CSV không bao giờ ghi cờ này.
  { truong: "_nhanTin", ten: ["lien he nhan tin", "nhan tin marketing", "dong y nhan tin"] },
];

const TIEU_DE_XUAT = [
  "Mã KH", "Tên", "MST", "Loại khách", "Phân khúc", "Ngành", "Nguồn", "Điện thoại", "Email", "Địa chỉ",
  "Tỉnh / thành", "Website", "Người phụ trách (email)", "Trạng thái", "Trạng thái hành trình", "Nhóm",
  "Liên hệ chính", "ĐT liên hệ", "Email liên hệ", "Ngày sinh liên hệ", "Liên hệ nhận tin", "Điểm", "Ghi chú",
];

/** Cột chỉ có khi xuất — mẫu nhập không có. */
const COT_CHI_XUAT = new Set(["Điểm", "Liên hệ nhận tin"]);

/** MK-13: từ chối luôn thắng; còn lại chỉ "Đồng ý" khi cờ đồng ý đang bật. */
function nhanNhanTin(l: { marketingOptIn: boolean; marketingOptOutAt: Date | null } | undefined): string {
  if (!l) return "";
  if (l.marketingOptOutAt) return "Từ chối";
  return l.marketingOptIn ? "Đồng ý" : "";
}

const khoa = (s: string) => boDau(s).replace(/[^a-z0-9]+/g, " ").trim();

function dinhDangNgayCsv(d: string | null): string {
  if (!d) return "";
  const [y, m, n] = d.split("-");
  return `${n}/${m}/${y}`;
}

export interface DongNhapKhach {
  soDong: number;
  ten: string;
  viec: "tao" | "sua" | "bo-qua";
  ma?: string;
  loi?: string;
  canhBao?: string;
}

export interface KetQuaNhapKhach {
  tenTep: string;
  ghiThat: boolean;
  tongDong: number;
  soTao: number;
  soSua: number;
  soLoi: number;
  cotLa: string[];
  dong: DongNhapKhach[];
  importJobId: string | null;
}

const LOAI_DU_LIEU: Record<string, string> = {
  loaiKhach: "loai_khach_hang",
  phanKhuc: "phan_khuc_khach_hang",
  nganh: "nganh_nghe",
  nguon: "nguon_lead",
};

export async function nhapKhachCsv(nc: NguCanh, d: z.infer<typeof LuocDoNhapKhachCsv>): Promise<KetQuaNhapKhach> {
  batBuocQuyen(nc.hoSo, "customer.create", { objectType: "import_job" });
  const bang = docBangCsv(d.noiDung, COT);
  if (bang.thieuCot.length) {
    throw new LoiNghiepVu(`Tệp thiếu cột bắt buộc: ${bang.thieuCot.join(", ")}. Tải tệp mẫu rồi điền theo đúng tiêu đề cột.`, 400, "thieu-cot", {
      thieuCot: bang.thieuCot,
      cotLa: bang.cotLa,
    });
  }
  if (bang.dong.length > 5000) throw new LoiNghiepVu("Tệp quá 5.000 dòng — tách nhỏ rồi nhập từng phần.", 400, "qua-nhieu-dong");

  // Tra cứu sẵn.
  const [duLieuGoc, nguoi, trangThaiHT, nhom] = await Promise.all([
    nc.tx.masterDataItem.findMany({ where: { type: { in: Object.values(LOAI_DU_LIEU) }, status: "hoat-dong" }, select: { type: true, code: true, name: true } }),
    nc.tx.user.findMany({ where: { status: "hoat-dong", isSystem: false }, select: { id: true, email: true } }),
    nc.tx.customerJourneyStage.findMany({ where: { status: "hoat-dong" }, select: { id: true, code: true, name: true } }),
    nc.tx.customerGroup.findMany({ where: { status: "hoat-dong" }, select: { id: true, name: true } }),
  ]);
  const maDuLieu = (truong: string, gt: string): string | null => {
    if (!gt) return null;
    const loai = LOAI_DU_LIEU[truong];
    const m = duLieuGoc.find((x) => x.type === loai && (x.code === gt || khoa(x.name) === khoa(gt)));
    if (!m) throw new Error(`"${gt}" không có trong Dữ liệu gốc (${truong}).`);
    return m.code;
  };
  const theoEmail = new Map(nguoi.map((u) => [u.email.toLowerCase(), u.id]));
  const timHanhTrinh = (gt: string) => trangThaiHT.find((t) => t.code === gt || khoa(t.name) === khoa(gt));
  const timNhom = (gt: string) => nhom.find((g) => khoa(g.name) === khoa(gt));
  const nhanTrangThai = new Map<string, string>(TRANG_THAI_KHACH.flatMap((t) => [[t, t], [khoa(NHAN_TRANG_THAI_KHACH[t]), t]] as [string, string][]));

  const kq: KetQuaNhapKhach = {
    tenTep: d.tenTep,
    ghiThat: d.ghiThat,
    tongDong: bang.dong.length,
    soTao: 0,
    soSua: 0,
    soLoi: 0,
    cotLa: bang.cotLa,
    dong: [],
    importJobId: null,
  };
  const daGap = new Set<string>();

  for (const { soDong, duLieu: r } of bang.dong) {
    const ten = (r.ten ?? "").trim();
    await nc.tx.$executeRawUnsafe("SAVEPOINT nhap_khach_dong");
    try {
      if (ten.length < 2) throw new Error("Thiếu tên khách hàng.");
      const mst = chuanHoaMaSoThue(r.maSoThue);
      const khoaTrung = r.ma?.trim() ? `ma:${r.ma.trim().toUpperCase()}` : mst ? `mst:${mst}` : null;
      if (khoaTrung && daGap.has(khoaTrung)) throw new Error("Khách này đã xuất hiện ở một dòng trước trong cùng tệp — giữ dòng đầu tiên.");
      if (khoaTrung) daGap.add(khoaTrung);

      const truong = {
        loaiKhach: maDuLieu("loaiKhach", r.loaiKhach ?? ""),
        phanKhuc: maDuLieu("phanKhuc", r.phanKhuc ?? ""),
        nganh: maDuLieu("nganh", r.nganh ?? ""),
        nguon: maDuLieu("nguon", r.nguon ?? ""),
      };
      let ownerId: string | null = null;
      if (r.nguoiPhuTrach?.trim()) {
        ownerId = theoEmail.get(r.nguoiPhuTrach.trim().toLowerCase()) ?? null;
        if (!ownerId) throw new Error(`Không có người dùng đang hoạt động mang email "${r.nguoiPhuTrach}".`);
      }
      let trangThai: (typeof TRANG_THAI_KHACH)[number] | null = null;
      if (r.trangThai?.trim()) {
        const t = nhanTrangThai.get(khoa(r.trangThai)) ?? nhanTrangThai.get(r.trangThai.trim());
        if (!t) throw new Error(`Trạng thái "${r.trangThai}" không hợp lệ (Tiềm năng / Đang giao dịch / Ngừng giao dịch).`);
        trangThai = t as (typeof TRANG_THAI_KHACH)[number];
      }
      const ht = r.hanhTrinh?.trim() ? timHanhTrinh(r.hanhTrinh.trim()) : null;
      if (r.hanhTrinh?.trim() && !ht) throw new Error(`Trạng thái hành trình "${r.hanhTrinh}" chưa có (hoặc đã ngừng).`);
      const dsNhom = (r.nhom ?? "").split(/[|;]/).map((x) => x.trim()).filter(Boolean);
      const nhomIds = dsNhom.map((g) => {
        const n = timNhom(g);
        if (!n) throw new Error(`Nhóm "${g}" chưa có — tạo nhóm trước ở trang Nhóm khách hàng.`);
        return n.id;
      });
      const ngaySinh = docNgayCsv(r.ngaySinh ?? "");
      const tenLienHe = (r.lienHe ?? "").trim();
      if ((ngaySinh || r.dtLienHe || r.emailLienHe) && tenLienHe.length < 2) throw new Error("Có thông tin liên hệ nhưng thiếu tên người liên hệ.");

      // Khách đã có: theo Mã KH, rồi theo MST (KH-02).
      const daCo = r.ma?.trim()
        ? await nc.tx.customer.findFirst({ where: { code: r.ma.trim().toUpperCase() }, select: { id: true, code: true, status: true } })
        : mst
          ? await nc.tx.customer.findFirst({ where: { taxCodeNormalized: mst }, select: { id: true, code: true, status: true } })
          : null;
      if (r.ma?.trim() && !daCo) throw new Error(`Không có khách mang mã ${r.ma.trim()} — để trống cột Mã KH nếu là khách mới.`);

      const chuoi = (x?: string) => (x?.trim() ? x.trim() : undefined);
      let khachId: string;
      let viec: "tao" | "sua";
      let maKhach: string;
      if (daCo) {
        if (daCo.status === "da-gop") throw new Error(`Khách ${daCo.code} đã được gộp vào khách khác — sửa dòng này sang khách giữ lại.`);
        const sau = await suaKhachHang(nc, daCo.id, {
          ten,
          maSoThue: chuoi(r.maSoThue),
          ...(truong.loaiKhach && { loaiKhach: truong.loaiKhach }),
          ...(truong.phanKhuc && { phanKhuc: truong.phanKhuc }),
          ...(truong.nganh && { nganh: truong.nganh }),
          ...(truong.nguon && { nguon: truong.nguon }),
          dienThoai: chuoi(r.dienThoai),
          email: chuoi(r.email),
          diaChi: chuoi(r.diaChi),
          tinhThanh: chuoi(r.tinhThanh),
          website: chuoi(r.website),
          ghiChu: chuoi(r.ghiChu),
          ...(ownerId && { nguoiPhuTrachId: ownerId }),
          ...(trangThai && { trangThai }),
          xacNhanKhongTrung: true,
        });
        khachId = sau.id;
        maKhach = sau.ma;
        viec = "sua";
        if (tenLienHe) {
          const dt = chuanHoaDienThoai(r.dtLienHe);
          const em = chuanHoaEmail(r.emailLienHe);
          const lh = await nc.tx.contact.findFirst({
            where: {
              customerId: khachId,
              OR: [...(dt ? [{ phoneNormalized: dt }] : []), ...(em ? [{ emailNormalized: em }] : []), { fullName: { equals: tenLienHe, mode: "insensitive" as const } }],
            },
            select: { id: true },
          });
          if (lh) {
            if (ngaySinh) await suaLienHe(nc, lh.id, { ngaySinh });
          } else {
            await taoLienHe(nc, khachId, { hoTen: tenLienHe, dienThoai: chuoi(r.dtLienHe) ?? null, email: chuoi(r.emailLienHe) ?? null, ngaySinh });
          }
        }
      } else {
        const moi = await taoKhachHang(
          nc,
          LuocDoTaoKhachHang.parse({
            ten,
            maSoThue: r.maSoThue ?? "",
            ...truong,
            dienThoai: r.dienThoai ?? "",
            email: r.email ?? "",
            diaChi: r.diaChi ?? "",
            tinhThanh: r.tinhThanh ?? "",
            website: r.website ?? "",
            ghiChu: r.ghiChu ?? "",
            nguoiPhuTrachId: ownerId,
            lienHe: tenLienHe ? { hoTen: tenLienHe, dienThoai: r.dtLienHe ?? "", email: r.emailLienHe ?? "", ngaySinh } : null,
            xacNhanKhongTrung: d.xacNhanTrung,
          }),
        );
        khachId = moi.id;
        maKhach = moi.ma;
        viec = "tao";
        if (trangThai && trangThai !== moi.trangThai) await suaKhachHang(nc, khachId, { trangThai, xacNhanKhongTrung: false });
      }
      if (ht) await doiHanhTrinh(nc, khachId, { trangThaiId: ht.id, ghiChu: null }, { ghiChuMacDinh: `Nhập CSV ${d.tenTep}` });
      for (const g of nhomIds) await ganKhachVaoNhom(nc, g, [khachId]);

      await nc.tx.$executeRawUnsafe(d.ghiThat ? "RELEASE SAVEPOINT nhap_khach_dong" : "ROLLBACK TO SAVEPOINT nhap_khach_dong");
      if (viec === "tao") kq.soTao++;
      else kq.soSua++;
      kq.dong.push({ soDong, ten, viec, ma: d.ghiThat || viec === "sua" ? maKhach : undefined });
    } catch (e) {
      await nc.tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT nhap_khach_dong");
      kq.soLoi++;
      let loi = e instanceof Error ? e.message : String(e);
      if (e instanceof LoiNghiepVu && e.ma === "co-the-trung") {
        const uv = ((e.chiTiet as { ungVien?: UngVienTrung[] } | undefined)?.ungVien ?? []).slice(0, 3);
        loi = `Có thể trùng ${uv.map((u) => `${u.ma} — ${u.ten} (${u.lyDo.join(", ")})`).join("; ")}. Kiểm lại; nếu đúng là khách mới thì tích "đã kiểm trùng" rồi nhập lại.`;
      }
      kq.dong.push({ soDong, ten, viec: "bo-qua", loi });
    }
  }

  if (d.ghiThat) {
    const job = await nc.tx.importJob.create({
      data: {
        tenantId: nc.tenantId,
        type: "khach-hang",
        fileName: d.tenTep,
        status: kq.soLoi === kq.tongDong && kq.tongDong > 0 ? "that-bai" : "da-nhap",
        totalRows: kq.tongDong,
        okRows: kq.soTao + kq.soSua,
        errorRows: kq.soLoi,
        createdRows: kq.soTao,
        updatedRows: kq.soSua,
        errors: kq.dong.filter((r) => r.loi).slice(0, 200) as never,
        createdBy: nc.hoSo.userId,
      },
      select: { id: true },
    });
    kq.importJobId = job.id;
    await nc.kiemToan({ action: "tao", objectType: "import_job", objectId: job.id, after: { loai: "khach-hang", tenTep: d.tenTep, soTao: kq.soTao, soSua: kq.soSua, soLoi: kq.soLoi } });
    await nc.suKien({ eventType: SU_KIEN.IMPORT_COMPLETED, objectType: "import_job", objectId: job.id, payload: { loai: "khach-hang", soTao: kq.soTao, soSua: kq.soSua, soLoi: kq.soLoi } });
  }
  return kq;
}

export function mauCsvKhach(): string {
  return taoCsv(TIEU_DE_XUAT.filter((t) => !COT_CHI_XUAT.has(t)), [
    ["", "Công ty TNHH Mẫu Nhập Liệu", "0312345678", "", "", "", "", "0909 123 456", "mua.hang@mau.vn", "12 Lê Lợi", "TP. Hồ Chí Minh", "", "", "Tiềm năng", "Khách mới", "", "Nguyễn Văn A", "0912 345 678", "a.nguyen@mau.vn", "15/08/1985", ""],
  ]);
}

/** Xuất theo đúng bộ lọc đang xem (tối đa 5.000 dòng), trong phạm vi `customer.view`. */
export async function xuatKhachCsv(nc: NguCanh, thamSo: Record<string, string>): Promise<{ tenTep: string; noiDung: string }> {
  batBuocQuyen(nc.hoSo, "customer.export", { objectType: "customer" });
  const boLoc = LuocDoLocKhachHang.parse({ ...thamSo, trang: 1, coTrang: 200 });
  const dong: (string | number | null)[][] = [];
  const nguoi = new Map((await nc.tx.user.findMany({ select: { id: true, email: true } })).map((u) => [u.id, u.email]));
  for (let trang = 1; trang <= 25; trang++) {
    const kq = await danhSachKhachHang(nc, { ...boLoc, trang });
    const lienHe = await nc.tx.contact.findMany({
      where: { customerId: { in: kq.dong.map((k) => k.id) }, status: "hoat-dong" },
      select: { customerId: true, fullName: true, phone: true, email: true, birthDate: true, isPrimary: true, marketingOptIn: true, marketingOptOutAt: true },
      orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
    });
    const lhChinh = new Map<string, (typeof lienHe)[number]>();
    for (const l of lienHe) if (!lhChinh.has(l.customerId)) lhChinh.set(l.customerId, l);
    for (const k of kq.dong) {
      const l = lhChinh.get(k.id);
      dong.push([
        k.ma, k.ten, k.maSoThue, k.loaiKhach, k.phanKhuc, k.nganh, k.nguon, k.dienThoai, k.email, k.diaChi,
        k.tinhThanh, k.website, nguoi.get(k.nguoiPhuTrach.id) ?? "", NHAN_TRANG_THAI_KHACH[k.trangThai] ?? k.trangThai,
        k.hanhTrinh?.ten ?? "", k.nhom.map((n) => n.ten).join(" | "),
        l?.fullName ?? "", l?.phone ?? "", l?.email ?? "", dinhDangNgayCsv(l?.birthDate ? l.birthDate.toISOString().slice(0, 10) : null),
        nhanNhanTin(l), k.diem ?? "", k.ghiChu,
      ]);
    }
    if (kq.dong.length < boLoc.coTrang || dong.length >= kq.tong) break;
  }
  await nc.kiemToan({ action: "xuat-csv", objectType: "customer", objectId: null, after: { soDong: dong.length, boLoc: thamSo } });
  return { tenTep: `khach-hang-${new Date().toISOString().slice(0, 10)}.csv`, noiDung: taoCsv(TIEU_DE_XUAT, dong) };
}
