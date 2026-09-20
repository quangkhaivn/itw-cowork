import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import type { NguCanh } from "@/lib/api";
import { batBuocQuyen, coQuyen } from "@/lib/phan-quyen";
import { LoiKhongTimThay, LoiNghiepVu } from "@/lib/loi";
import { SU_KIEN } from "@/lib/su-kien";
import { LuocDoTaoBaoGia } from "@/modules/bao-gia/luoc-do";
import { taoBaoGia } from "@/modules/bao-gia/service";
import { LuocDoTaoViec, taoViec } from "@/modules/cong-viec/service";
import type { CongCu } from "./cong-cu";

/**
 * Đề xuất hành động của trợ lý — AI_ARCHITECTURE.md mục 4, luật AI-03.
 *
 * Trợ lý **không bao giờ** tự ghi dữ liệu nghiệp vụ. Nó chỉ ghi được một dòng `ai_actions`
 * trạng thái `de-xuat` — tức là một lời đề nghị. Người dùng đọc, bấm Đồng ý, và **service
 * chạy với quyền của người bấm**, không phải quyền của trợ lý.
 *
 * Không có hàm nào trong tệp này chuyển thẳng `de-xuat` → `da-chay` mà thiếu người duyệt;
 * và kể cả mã có lỗi thì CHECK `ai_actions_duyet_check` ở tầng CSDL vẫn chặn.
 */

export interface LoaiHanhDong {
  ma: string;
  nhan: string;
  /** Quyền mà NGƯỜI DUYỆT phải có để chạy được. */
  quyen: string;
  thamSo: z.ZodType;
  luocDoJson: Record<string, unknown>;
  /** Câu mô tả cho người duyệt đọc trước khi bấm. */
  tomTat(thamSo: Record<string, unknown>): string;
  chay(nc: NguCanh, thamSo: Record<string, unknown>): Promise<{ doiTuong: string; doiTuongId: string; nhan: string }>;
}

const LuocDoDeXuatBaoGia = z.object({
  khachHangId: z.uuid(),
  ghiChu: z.string().trim().max(2000).optional().default(""),
  dong: z
    .array(
      z.object({
        sanPhamId: z.uuid().optional(),
        ten: z.string().trim().min(2).max(500),
        soLuong: z.union([z.number(), z.string()]),
        donGia: z.union([z.number(), z.string()]),
        donViTinh: z.string().trim().max(50).optional().default(""),
        vat: z.number().min(0).max(100).optional().default(10),
        giaVon: z.union([z.number(), z.string()]).optional().default("0"),
      }),
    )
    .min(1)
    .max(50),
});

const LuocDoDeXuatViec = z.object({
  tieuDe: z.string().trim().min(3).max(255),
  moTa: z.string().trim().max(2000).optional().default(""),
  khachHangId: z.uuid().optional(),
  coHoiId: z.uuid().optional(),
  han: z.string().trim().max(40).optional().default(""),
});

export const LOAI_HANH_DONG: LoaiHanhDong[] = [
  {
    ma: "tao-nhap-bao-gia",
    nhan: "Tạo báo giá nháp",
    quyen: "quotation.create",
    thamSo: LuocDoDeXuatBaoGia,
    luocDoJson: {
      type: "object",
      properties: {
        khachHangId: { type: "string", description: "id khách hàng." },
        ghiChu: { type: "string", description: "Ghi chú cho báo giá." },
        dong: {
          type: "array",
          description: "Các dòng hàng.",
          items: {
            type: "object",
            properties: {
              sanPhamId: { type: "string", description: "id sản phẩm nếu là hàng trong danh mục." },
              ten: { type: "string" },
              soLuong: { type: "string" },
              donGia: { type: "string", description: "Đơn giá bán, đồng." },
              donViTinh: { type: "string" },
              vat: { type: "integer", description: "Thuế suất %, mặc định 10." },
              giaVon: { type: "string", description: "Giá vốn tham chiếu, đồng." },
            },
            required: ["ten", "soLuong", "donGia"],
          },
        },
      },
      required: ["khachHangId", "dong"],
      additionalProperties: false,
    },
    tomTat(t) {
      const dong = (t.dong as { ten: string }[]) ?? [];
      return `Tạo báo giá nháp gồm ${dong.length} dòng hàng: ${dong.map((d) => d.ten).slice(0, 3).join(", ")}${dong.length > 3 ? "…" : ""}`;
    },
    async chay(nc, t) {
      const d = LuocDoDeXuatBaoGia.parse(t);
      const bg = await taoBaoGia(
        nc,
        LuocDoTaoBaoGia.parse({
          khachHangId: d.khachHangId,
          ghiChu: d.ghiChu,
          dong: d.dong.map((x) => ({
            sanPhamId: x.sanPhamId ?? "",
            ten: x.ten,
            soLuong: String(x.soLuong),
            donGia: String(x.donGia),
            donViTinh: x.donViTinh ?? "",
            vat: x.vat ?? 10,
            giaVon: String(x.giaVon ?? "0"),
          })),
        }),
      );
      return { doiTuong: "quotation", doiTuongId: bg.id, nhan: bg.so };
    },
  },
  {
    ma: "tao-viec",
    nhan: "Tạo việc cần làm",
    quyen: "task.create",
    thamSo: LuocDoDeXuatViec,
    luocDoJson: {
      type: "object",
      properties: {
        tieuDe: { type: "string" },
        moTa: { type: "string" },
        khachHangId: { type: "string", description: "id khách hàng liên quan, nếu có." },
        coHoiId: { type: "string", description: "id cơ hội liên quan, nếu có." },
        han: { type: "string", description: "Hạn, dạng yyyy-mm-ddThh:mm:ss+07:00." },
      },
      required: ["tieuDe"],
      additionalProperties: false,
    },
    tomTat(t) {
      return `Tạo việc "${String(t.tieuDe)}"${t.han ? `, hạn ${String(t.han)}` : ""}`;
    },
    async chay(nc, t) {
      const d = LuocDoDeXuatViec.parse(t);
      const v = await taoViec(
        nc,
        LuocDoTaoViec.parse({
          tieuDe: d.tieuDe,
          moTa: d.moTa,
          khachHangId: d.khachHangId ?? "",
          coHoiId: d.coHoiId ?? "",
          han: d.han || "",
        }),
      );
      return { doiTuong: "task", doiTuongId: v.id, nhan: d.tieuDe };
    },
  },
];

export function timLoaiHanhDong(ma: string): LoaiHanhDong | undefined {
  return LOAI_HANH_DONG.find((l) => l.ma === ma);
}

/**
 * Công cụ **duy nhất** của trợ lý có ghi xuống cơ sở dữ liệu — và nó chỉ ghi được một
 * lời đề nghị, không chạm dữ liệu nghiệp vụ. Chỉ đưa cho mô hình khi người đang hỏi
 * có quyền tạo thứ tương ứng; không thì đề nghị cũng vô nghĩa.
 */
export function congCuDeXuat(hoiThoaiId: string, hoSo: { quyen: Set<string> }): CongCu[] {
  const duoc = LOAI_HANH_DONG.filter((l) => hoSo.quyen.has(l.quyen));
  if (duoc.length === 0) return [];
  return [
    {
      ten: "de_xuat_hanh_dong",
      moTa:
        "Đề nghị một hành động ghi để người dùng bấm duyệt. Công cụ này KHÔNG thực hiện gì cả — " +
        "nó chỉ tạo một thẻ đề xuất hiện trong khung chat. Loại hợp lệ: " +
        duoc.map((l) => `${l.ma} (${l.nhan})`).join(", ") +
        ". Sau khi gọi, hãy nói cho người dùng biết đã đặt đề xuất và họ cần bấm Đồng ý.",
      quyen: "ai.view",
      thamSo: z.object({ loai: z.string().trim().min(3).max(50), thamSo: z.record(z.string(), z.unknown()) }),
      luocDoJson: {
        type: "object",
        properties: {
          loai: { type: "string", description: duoc.map((l) => l.ma).join(" | ") },
          thamSo: {
            type: "object",
            description: "Tham số của hành động. Xem mô tả từng loại.",
            additionalProperties: true,
          },
        },
        required: ["loai", "thamSo"],
        additionalProperties: false,
      },
      async chay(nc, t) {
        const loai = timLoaiHanhDong(String(t.loai));
        if (!loai) throw new LoiNghiepVu(`Không có loại hành động "${String(t.loai)}".`, 400, "loai-khong-hop-le");
        if (!coQuyen(nc.hoSo, loai.quyen)) {
          throw new LoiNghiepVu(`Người dùng không có quyền ${loai.quyen} nên đề xuất này vô nghĩa.`, 403, "thieu-quyen");
        }
        const thamSo = loai.thamSo.parse(t.thamSo) as Record<string, unknown>;
        const dx = await nc.tx.aiAction.create({
          data: {
            tenantId: nc.tenantId,
            conversationId: hoiThoaiId,
            actionType: loai.ma,
            summary: loai.tomTat(thamSo),
            payload: thamSo as Prisma.InputJsonValue,
          },
          select: { id: true, summary: true },
        });
        return {
          deXuatId: dx.id,
          trangThai: "de-xuat",
          tomTat: dx.summary,
          ghiChu: "Đã đặt đề xuất. Người dùng phải bấm Đồng ý thì mới chạy.",
        };
      },
    },
  ];
}

// ---------------------------------------------------------------------------
// Duyệt / từ chối
// ---------------------------------------------------------------------------

async function docDeXuat(nc: NguCanh, id: string) {
  const d = await nc.tx.aiAction.findFirst({
    where: { id, conversation: { userId: nc.hoSo.userId } },
    select: { id: true, actionType: true, summary: true, payload: true, status: true, conversationId: true },
  });
  if (!d) throw new LoiKhongTimThay("Đề xuất");
  return d;
}

/**
 * Người dùng bấm Đồng ý. Service chạy với `NguCanh` của **người bấm**, nên mọi kiểm
 * quyền, phạm vi dữ liệu và nhật ký đúng như họ tự làm bằng tay.
 */
export async function duyetDeXuat(nc: NguCanh, id: string) {
  const dx = await docDeXuat(nc, id);
  if (dx.status !== "de-xuat") throw new LoiNghiepVu("Đề xuất này đã xử lý rồi.", 409, "da-xu-ly");

  const loai = timLoaiHanhDong(dx.actionType);
  if (!loai) throw new LoiNghiepVu("Loại hành động không còn được hỗ trợ.", 409, "loai-khong-hop-le");
  batBuocQuyen(nc.hoSo, loai.quyen, { objectType: "ai_action", objectId: id });

  try {
    const kq = await loai.chay(nc, dx.payload as Record<string, unknown>);
    await nc.tx.aiAction.update({
      where: { id },
      data: {
        status: "da-chay",
        objectType: kq.doiTuong,
        objectId: kq.doiTuongId,
        approvedBy: nc.hoSo.userId,
        approvedAt: new Date(),
      },
    });
    await nc.kiemToan({
      action: "tao",
      objectType: "ai_action",
      objectId: id,
      after: { loai: dx.actionType, doiTuong: kq.doiTuong, doiTuongId: kq.doiTuongId, nguoiDuyet: nc.hoSo.email },
    });
    await nc.suKien({
      eventType: SU_KIEN.AI_ACTION_EXECUTED,
      objectType: "ai_action",
      objectId: id,
      payload: { loai: dx.actionType, doiTuong: kq.doiTuong, doiTuongId: kq.doiTuongId },
    });
    return { id, trangThai: "da-chay", doiTuong: kq.doiTuong, doiTuongId: kq.doiTuongId, nhan: kq.nhan };
  } catch (e) {
    // Chạy hỏng thì đề xuất VẪN ở trạng thái đề xuất, kèm lỗi — để người dùng sửa rồi bấm lại.
    await nc.tx.aiAction.update({
      where: { id },
      data: { error: e instanceof Error ? e.message : String(e) },
    });
    throw e;
  }
}

export async function tuChoiDeXuat(nc: NguCanh, id: string, lyDo: string) {
  batBuocQuyen(nc.hoSo, "ai.view", { objectType: "ai_action", objectId: id });
  const dx = await docDeXuat(nc, id);
  if (dx.status !== "de-xuat") throw new LoiNghiepVu("Đề xuất này đã xử lý rồi.", 409, "da-xu-ly");
  await nc.tx.aiAction.update({
    where: { id },
    data: { status: "tu-choi", approvedBy: nc.hoSo.userId, approvedAt: new Date(), rejectReason: lyDo },
  });
  return { id, trangThai: "tu-choi" };
}
