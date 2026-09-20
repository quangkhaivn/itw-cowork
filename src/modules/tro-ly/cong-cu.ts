import { z } from "zod";
import type { NguCanh } from "@/lib/api";
import { batBuocQuyen } from "@/lib/phan-quyen";
import { LuocDoLocKhachHang } from "@/modules/khach-hang/luoc-do";
import { danhSachKhachHang, khach360 } from "@/modules/khach-hang/service";
import { LuocDoLocCoHoi } from "@/modules/co-hoi/luoc-do";
import { danhSachCoHoi, duLieuPipeline } from "@/modules/co-hoi/service";
import { LuocDoLocViec, danhSachViec } from "@/modules/cong-viec/service";
import { LuocDoLocSanPham } from "@/modules/san-pham/luoc-do";
import { danhSachSanPham, giaChoBaoGia } from "@/modules/san-pham/service";
import { LuocDoLocTonKho } from "@/modules/kho/luoc-do";
import { tonKho } from "@/modules/kho/service";
import { LuocDoLocBaoGia } from "@/modules/bao-gia/luoc-do";
import { danhSachBaoGia, chiTietBaoGia } from "@/modules/bao-gia/service";
import { LuocDoLocGiaHan } from "@/modules/bao-tri/luoc-do";
import { danhSachGiaHan } from "@/modules/bao-tri/service";
import { congNoTheoKhach } from "@/modules/tai-chinh/service";
import { bangDieuKhien } from "@/modules/bang-dieu-khien/service";

/**
 * Sổ công cụ của trợ lý — AI_ARCHITECTURE.md mục 2.
 *
 * Mỗi công cụ là một hàm **mỏng** bọc service sẵn có. Không có công cụ nào tự truy vấn
 * cơ sở dữ liệu: nhờ vậy mọi luật nghiệp vụ, kiểm quyền và phạm vi dữ liệu của bảy phase
 * trước tự động áp cho trợ lý, không phải viết lại lần thứ hai.
 *
 * Quy tắc xuyên suốt: công cụ chạy với `NguCanh` **của người đang hỏi**. Trợ lý không
 * có quyền riêng rộng hơn người hỏi (AI-01). Thiếu quyền thì trả về một câu cho mô hình
 * đọc, và vết từ chối vẫn được ghi như mọi API khác.
 *
 * **Sổ này chỉ có công cụ ĐỌC.** Công cụ ghi duy nhất của trợ lý nằm ở `de-xuat.ts`, và
 * nó cũng chỉ ghi được một lời đề nghị chờ người bấm duyệt (AI-03).
 */

export interface CongCu {
  ten: string;
  moTa: string;
  quyen: string;
  thamSo: z.ZodType;
  /** Mô tả tham số theo JSON Schema để gửi cho mô hình. */
  luocDoJson: Record<string, unknown>;
  chay(nc: NguCanh, thamSo: Record<string, unknown>): Promise<unknown>;
}

const chuoi = (moTa: string) => ({ type: "string", description: moTa });

function doiTuong(thuocTinh: Record<string, unknown>, batBuoc: string[] = []): Record<string, unknown> {
  return { type: "object", properties: thuocTinh, required: batBuoc, additionalProperties: false };
}

/** Giới hạn số dòng trả cho mô hình: trả cả nghìn dòng chỉ tốn token và làm loãng câu trả lời. */
const TOI_DA_DONG = 25;

export const SO_CONG_CU: CongCu[] = [
  {
    ten: "tim_khach_hang",
    moTa:
      "Tìm khách hàng theo tên, mã số thuế, điện thoại hoặc email. Trả về danh sách rút gọn kèm id " +
      "để dùng cho các công cụ khác. Chỉ trả khách trong phạm vi của người đang hỏi.",
    quyen: "customer.view",
    thamSo: z.object({ tuKhoa: z.string().trim().min(1).max(100) }),
    luocDoJson: doiTuong({ tuKhoa: chuoi("Tên, mã số thuế, điện thoại hoặc email cần tìm.") }, ["tuKhoa"]),
    async chay(nc, t) {
      const kq = await danhSachKhachHang(nc, LuocDoLocKhachHang.parse({ q: t.tuKhoa, coTrang: TOI_DA_DONG }));
      return {
        tong: kq.tong,
        khachHang: kq.dong.map((k) => ({
          id: k.id,
          ma: k.ma,
          ten: k.ten,
          maSoThue: k.maSoThue,
          dienThoai: k.dienThoai,
          nguoiPhuTrach: k.nguoiPhuTrach?.hoTen ?? null,
        })),
      };
    },
  },
  {
    ten: "ho_so_khach_hang",
    moTa:
      "Hồ sơ đầy đủ của một khách hàng: liên hệ, cơ hội, tương tác gần đây, đơn hàng, việc đang mở. " +
      "Dùng khi cần trả lời 'khách này đang thế nào'.",
    quyen: "customer.view",
    thamSo: z.object({ khachHangId: z.uuid() }),
    luocDoJson: doiTuong({ khachHangId: chuoi("id khách hàng lấy từ tim_khach_hang.") }, ["khachHangId"]),
    async chay(nc, t) {
      const k = await khach360(nc, String(t.khachHangId));
      return k;
    },
  },
  {
    ten: "tim_co_hoi",
    moTa:
      "Cơ hội bán hàng. Lọc theo giai đoạn ('dang-mo', 'da-dong' hoặc mã giai đoạn cụ thể) và " +
      "theo quá hạn hành động. Chỉ trả cơ hội trong phạm vi của người đang hỏi.",
    quyen: "sales.view",
    thamSo: z.object({
      tuKhoa: z.string().trim().max(100).optional().default(""),
      giaiDoan: z.string().trim().max(20).optional().default("dang-mo"),
      quaHanHanhDong: z.boolean().optional().default(false),
    }),
    luocDoJson: doiTuong({
      tuKhoa: chuoi("Từ khóa tìm trong tiêu đề hoặc tên khách."),
      giaiDoan: chuoi("dang-mo | da-dong | OPPORTUNITY | QUOTATION | NEGOTIATION | WON | LOST."),
      quaHanHanhDong: { type: "boolean", description: "Chỉ lấy cơ hội đã quá hạn hành động kế tiếp." },
    }),
    async chay(nc, t) {
      const kq = await danhSachCoHoi(
        nc,
        LuocDoLocCoHoi.parse({
          q: t.tuKhoa ?? "",
          giaiDoan: t.giaiDoan ?? "dang-mo",
          quaHan: t.quaHanHanhDong ? "1" : "",
          coTrang: TOI_DA_DONG,
        }),
      );
      return {
        tong: kq.tong,
        coHoi: kq.dong.map((c) => ({
          id: c.id,
          ma: c.ma,
          tieuDe: c.tieuDe,
          khachHang: c.khachHang.ten,
          giaiDoan: c.giaiDoan,
          giaTri: c.giaTri,
          xacSuat: c.xacSuat,
          hanhDongKeTiep: c.hanhDongKeTiep,
          ngayHanhDong: c.ngayHanhDong,
          nguoiPhuTrach: c.nguoiPhuTrach.hoTen,
        })),
      };
    },
  },
  {
    ten: "pipeline_ban_hang",
    moTa: "Tổng giá trị và số cơ hội theo từng giai đoạn, trong phạm vi của người đang hỏi.",
    quyen: "sales.view",
    thamSo: z.object({}),
    luocDoJson: doiTuong({}),
    async chay(nc) {
      const p = await duLieuPipeline(nc, { nguoiPhuTrach: "" });
      return p;
    },
  },
  {
    ten: "viec_can_lam",
    moTa: "Công việc của người đang hỏi. Chế độ 'qua-han' lấy việc đã quá hạn.",
    quyen: "task.view",
    thamSo: z.object({ cheDo: z.enum(["cua-toi", "qua-han", "tat-ca"]).optional().default("cua-toi") }),
    luocDoJson: doiTuong({ cheDo: chuoi("cua-toi | qua-han | tat-ca.") }),
    async chay(nc, t) {
      const kq = await danhSachViec(nc, LuocDoLocViec.parse({ cheDo: t.cheDo ?? "cua-toi", coTrang: TOI_DA_DONG }));
      return {
        tong: kq.tong,
        viec: kq.dong.map((v) => ({ id: v.id, tieuDe: v.tieuDe, han: v.han, trangThai: v.trangThai, uuTien: v.uuTien })),
      };
    },
  },
  {
    ten: "tim_san_pham",
    moTa:
      "Tìm sản phẩm theo tên, SKU hoặc model. Trả giá bán và giá vốn tham chiếu. " +
      "Dùng khi khách hỏi 'có hàng gì', hoặc khi cần id sản phẩm để dựng báo giá.",
    quyen: "product.view",
    thamSo: z.object({ tuKhoa: z.string().trim().min(1).max(100) }),
    luocDoJson: doiTuong({ tuKhoa: chuoi("Tên, SKU hoặc model.") }, ["tuKhoa"]),
    async chay(nc, t) {
      const kq = await danhSachSanPham(nc, LuocDoLocSanPham.parse({ q: t.tuKhoa, coTrang: TOI_DA_DONG }));
      return {
        tong: kq.tong,
        sanPham: kq.dong.map((s) => ({
          id: s.id,
          sku: s.sku,
          ten: s.ten,
          giaBan: s.giaBan,
          giaVon: s.giaVon,
          donViTinh: s.donViTinh,
          baoHanhThang: s.baoHanhThang,
        })),
      };
    },
  },
  {
    ten: "gia_va_nguon_hang",
    moTa:
      "Giá bán, giá vốn tham chiếu và nguồn nên mua của một hoặc nhiều sản phẩm. " +
      "Dùng trước khi dựng báo giá để biết biên lợi nhuận.",
    quyen: "product.view",
    thamSo: z.object({ sanPhamIds: z.array(z.uuid()).min(1).max(20) }),
    luocDoJson: doiTuong(
      { sanPhamIds: { type: "array", items: { type: "string" }, description: "Danh sách id sản phẩm." } },
      ["sanPhamIds"],
    ),
    async chay(nc, t) {
      return giaChoBaoGia(nc, t.sanPhamIds as string[]);
    },
  },
  {
    ten: "ton_kho",
    moTa: "Tồn kho hiện tại: còn bao nhiêu, giữ chỗ bao nhiêu, bán được bao nhiêu.",
    quyen: "inventory.view",
    thamSo: z.object({
      tuKhoa: z.string().trim().max(100).optional().default(""),
      chiCanhBao: z.boolean().optional().default(false),
    }),
    luocDoJson: doiTuong({
      tuKhoa: chuoi("Tên hoặc SKU sản phẩm."),
      chiCanhBao: { type: "boolean", description: "Chỉ lấy mặt hàng hết hoặc sắp hết." },
    }),
    async chay(nc, t) {
      const kq = await tonKho(
        nc,
        LuocDoLocTonKho.parse({ q: t.tuKhoa ?? "", canhBao: t.chiCanhBao ? "1" : "", coTrang: TOI_DA_DONG }),
      );
      return {
        tong: kq.tong,
        tonKho: kq.dong.map((d) => ({
          sanPham: d.sanPham.ten,
          sku: d.sanPham.sku,
          kho: d.kho.ten,
          conTrongKho: d.tonKho,
          giuCho: d.giuCho,
          banDuoc: d.conBanDuoc,
          mucTon: d.mucCanhBao,
        })),
      };
    },
  },
  {
    ten: "tim_bao_gia",
    moTa:
      "Báo giá. Lọc theo trạng thái, hoặc chỉ lấy bản đang chờ duyệt. " +
      "Dùng cho câu hỏi 'báo giá nào chưa thấy khách trả lời'.",
    quyen: "quotation.view",
    thamSo: z.object({
      tuKhoa: z.string().trim().max(100).optional().default(""),
      trangThai: z.string().trim().max(20).optional().default(""),
      choDuyet: z.boolean().optional().default(false),
    }),
    luocDoJson: doiTuong({
      tuKhoa: chuoi("Số báo giá hoặc tên khách."),
      trangThai: chuoi("dang-chay | tat-ca | DRAFT | PENDING_APPROVAL | SENT | ACCEPTED | REJECTED…"),
      choDuyet: { type: "boolean", description: "Chỉ lấy báo giá đang chờ duyệt." },
    }),
    async chay(nc, t) {
      const kq = await danhSachBaoGia(
        nc,
        LuocDoLocBaoGia.parse({
          q: t.tuKhoa ?? "",
          trangThai: t.trangThai ?? "",
          choDuyet: t.choDuyet ? "1" : "",
          coTrang: TOI_DA_DONG,
        }),
      );
      return {
        tong: kq.tong,
        baoGia: kq.dong.map((b) => ({
          id: b.id,
          so: b.so,
          khachHang: b.khachHang.ten,
          trangThai: b.trangThai,
          tongCong: b.phienBanHienHanh?.tongCong ?? null,
          bienLoiNhuan: b.phienBanHienHanh?.bienLoiNhuan ?? null,
          nguoiPhuTrach: b.nguoiPhuTrach.hoTen,
        })),
      };
    },
  },
  {
    ten: "chi_tiet_bao_gia",
    moTa: "Toàn bộ một báo giá: dòng hàng, số tiền, biên lợi nhuận, lịch sử phiên bản.",
    quyen: "quotation.view",
    thamSo: z.object({ baoGiaId: z.uuid() }),
    luocDoJson: doiTuong({ baoGiaId: chuoi("id báo giá lấy từ tim_bao_gia.") }, ["baoGiaId"]),
    async chay(nc, t) {
      return chiTietBaoGia(nc, String(t.baoGiaId));
    },
  },
  {
    ten: "cong_no_phai_thu",
    moTa: "Công nợ theo khách kèm tuổi nợ: ai đang nợ bao nhiêu, quá hạn bao lâu.",
    quyen: "finance.view",
    thamSo: z.object({}),
    luocDoJson: doiTuong({}),
    async chay(nc) {
      const kq = await congNoTheoKhach(nc);
      return {
        tomTat: kq.tomTat,
        khach: kq.khach.slice(0, TOI_DA_DONG).map((k) => ({
          khachHang: k.khachHang.ten,
          conNo: k.conNo,
          quaHan: k.quaHan,
          soHoaDon: k.soHoaDon,
          quaHanLauNhat: k.quaHanLauNhat,
        })),
      };
    },
  },
  {
    ten: "lich_gia_han",
    moTa: "Bảo hành và hợp đồng bảo trì sắp hết hạn, đang chờ chốt thành cơ hội.",
    quyen: "service_desk.view",
    thamSo: z.object({ trangThai: z.string().trim().max(20).optional().default("") }),
    luocDoJson: doiTuong({ trangThai: chuoi("Bỏ trống = đang chờ chốt; tat-ca | da-tao-co-hoi | bo-qua.") }),
    async chay(nc, t) {
      const kq = await danhSachGiaHan(nc, LuocDoLocGiaHan.parse({ trangThai: t.trangThai ?? "", coTrang: TOI_DA_DONG }));
      return {
        tong: kq.tong,
        giaHan: kq.dong.map((g) => ({
          tieuDe: g.tieuDe,
          khachHang: g.khachHang.ten,
          denHan: g.denHan,
          soNgayConLai: g.soNgayConLai,
          nguon: g.nguon,
          trangThai: g.trangThai,
        })),
      };
    },
  },
  {
    ten: "chi_so_kinh_doanh",
    moTa:
      "Các chỉ số của Bảng điều hành trong phạm vi của người đang hỏi: doanh thu tháng, lợi nhuận gộp, " +
      "công nợ, pipeline, đơn chờ giao, cảnh báo kho, phiếu hỗ trợ trễ hạn. " +
      "Khối nào người hỏi không có quyền xem thì trả null.",
    quyen: "dashboard.view",
    thamSo: z.object({}),
    luocDoJson: doiTuong({}),
    async chay(nc) {
      return bangDieuKhien(nc);
    },
  },
];

export function timCongCu(ten: string): CongCu | undefined {
  return SO_CONG_CU.find((c) => c.ten === ten);
}

export const TEN_CONG_CU = SO_CONG_CU.map((c) => c.ten);

/** Chỉ gửi cho mô hình những công cụ mà người đang hỏi thật sự có quyền dùng. */
export function congCuChoNguoi(hoSo: { quyen: Set<string> }): CongCu[] {
  return SO_CONG_CU.filter((c) => hoSo.quyen.has(c.quyen));
}

/** Kiểm quyền ngay trước khi chạy — lớp chặn thứ hai, không tin danh sách đã lọc. */
export function batBuocQuyenCongCu(nc: NguCanh, c: CongCu): void {
  batBuocQuyen(nc.hoSo, c.quyen, { objectType: "ai_tool", objectId: null });
}
