import type { Prisma } from "@/generated/prisma/client";
import type { NguCanh } from "@/lib/api";
import { laLoiPhien, thanhBuoc, type BuocGiaoDich } from "@/lib/api-nhieu-buoc";
import { batBuocQuyen, coQuyen, LoiThieuQuyen } from "@/lib/phan-quyen";
import { LoiDinhDang, LoiKhongTimThay, LoiNghiepVu } from "@/lib/loi";
import { SU_KIEN } from "@/lib/su-kien";
import { homNayVN } from "@/modules/crm/chung";
import { batBuocQuyenCongCu, congCuChoNguoi, timCongCu } from "./cong-cu";
import { congCuDeXuat } from "./de-xuat";
import { LoiNhaCungCapAI, nhaCungCapDangDung, tinhTrangAI, type KhoiPhanHoi, type TinNhanAI } from "./nha-cung-cap";
import {
  CAU_VUOT_TRAN,
  TOI_DA_VONG,
  cauBaoLoiCongCu,
  datTenHoiThoai,
  gopVanBan,
  ketQuaSangVanBan,
  loiNhacHeThong,
  type KetCucGoi,
} from "./tinh-toan";

/**
 * Trợ lý ITA — Phase 9. Thiết kế: AI_ARCHITECTURE.md. Luật: BUSINESS_RULES.md mục 15.
 *
 * Vòng lặp: mô hình chọn công cụ → **kiểm quyền của người đang hỏi** → chạy service →
 * trả kết quả về cho mô hình → lặp cho tới khi mô hình trả lời bằng chữ, hoặc chạm trần.
 *
 * Ba điều không có đường vòng:
 *  1. Công cụ chạy bằng `NguCanh` của người hỏi, nên trợ lý không thấy rộng hơn họ (AI-01).
 *  2. Công cụ đều là công cụ ĐỌC, trừ đúng một công cụ chỉ ghi được một lời **đề xuất**;
 *     mọi hành động ghi thật vẫn phải có người bấm duyệt (AI-03).
 *  3. Chưa cấu hình nhà cung cấp thì từ chối rõ ràng, không bịa câu trả lời (AI-06).
 */

export interface KetQuaHoiDap {
  hoiThoaiId: string;
  tinNhanId: string;
  traLoi: string;
  soVong: number;
  congCuDaGoi: { ten: string; ketCuc: string }[];
  vuotTran: boolean;
  /** Lỗi gọi mô hình của lượt này (hết thời gian, nhà cung cấp trả lỗi…) — null khi trả lời được. */
  loi: string | null;
}

// ---------------------------------------------------------------------------
// Đọc
// ---------------------------------------------------------------------------

export async function trangThaiTroLy(nc: NguCanh) {
  batBuocQuyen(nc.hoSo, "ai.view");
  const tt = tinhTrangAI();
  const congCu = congCuChoNguoi(nc.hoSo);
  return {
    daCauHinh: tt.daCauHinh,
    lyDo: tt.lyDo,
    nhaCungCap: tt.nhaCungCap,
    model: tt.model,
    congCu: congCu.map((c) => ({ ten: c.ten, moTa: c.moTa, quyen: c.quyen })),
    soCongCuKhaDung: congCu.length,
  };
}

export async function danhSachHoiThoai(nc: NguCanh, gioiHan = 20) {
  batBuocQuyen(nc.hoSo, "ai.view");
  const ds = await nc.tx.aiConversation.findMany({
    where: { userId: nc.hoSo.userId },
    orderBy: { lastMessageAt: "desc" },
    take: Math.min(Math.max(gioiHan, 1), 100),
    select: { id: true, title: true, status: true, lastMessageAt: true, createdAt: true },
  });
  return ds.map((h) => ({ id: h.id, tieuDe: h.title, trangThai: h.status, lucCuoi: h.lastMessageAt, taoLuc: h.createdAt }));
}

async function docHoiThoai(nc: NguCanh, id: string) {
  // Hội thoại là của riêng người hỏi — không có đường xem hội thoại người khác (AI-04).
  const h = await nc.tx.aiConversation.findFirst({
    where: { id, userId: nc.hoSo.userId },
    select: { id: true, title: true, status: true },
  });
  if (!h) throw new LoiKhongTimThay("Hội thoại");
  return h;
}

export async function chiTietHoiThoai(nc: NguCanh, id: string) {
  batBuocQuyen(nc.hoSo, "ai.view");
  const h = await docHoiThoai(nc, id);
  const tin = await nc.tx.aiMessage.findMany({
    where: { conversationId: id },
    orderBy: { createdAt: "asc" },
    select: {
      id: true, role: true, content: true, turns: true, error: true, createdAt: true,
      toolCalls: { select: { toolName: true, outcome: true, durationMs: true }, orderBy: { createdAt: "asc" } },
    },
  });
  const deXuat = await nc.tx.aiAction.findMany({
    where: { conversationId: id },
    orderBy: { createdAt: "asc" },
    select: {
      id: true, actionType: true, summary: true, payload: true, status: true,
      objectType: true, objectId: true, rejectReason: true, error: true, createdAt: true,
    },
  });
  return {
    hoiThoai: { id: h.id, tieuDe: h.title, trangThai: h.status },
    tinNhan: tin.map((t) => ({
      id: t.id,
      vaiTro: t.role,
      noiDung: t.content,
      soVong: t.turns,
      loi: t.error,
      luc: t.createdAt,
      congCu: t.toolCalls.map((c) => ({ ten: c.toolName, ketCuc: c.outcome, mili: c.durationMs })),
    })),
    deXuat: deXuat.map((d) => ({
      id: d.id,
      loai: d.actionType,
      tomTat: d.summary,
      thamSo: d.payload,
      trangThai: d.status,
      doiTuong: d.objectType,
      doiTuongId: d.objectId,
      lyDoTuChoi: d.rejectReason,
      loi: d.error,
      luc: d.createdAt,
    })),
  };
}

// ---------------------------------------------------------------------------
// Hỏi đáp
// ---------------------------------------------------------------------------

/** Lịch sử gửi lại cho mô hình: cắt bớt cho khỏi phình, giữ mạch hội thoại. */
const SO_LUOT_NHO = 12;

async function lichSuChoMoHinh(nc: NguCanh, hoiThoaiId: string): Promise<TinNhanAI[]> {
  const ds = await nc.tx.aiMessage.findMany({
    where: { conversationId: hoiThoaiId, role: { in: ["nguoi-dung", "tro-ly"] }, error: null },
    orderBy: { createdAt: "desc" },
    take: SO_LUOT_NHO,
    select: { role: true, content: true },
  });
  return ds
    .reverse()
    .map((t) => ({ vaiTro: t.role === "tro-ly" ? ("tro-ly" as const) : ("nguoi-dung" as const), noiDung: t.content }));
}

/**
 * Một lượt hỏi đáp — 0.16.1 (QĐ-89): **không gọi mô hình bên trong giao dịch CSDL**.
 *
 *  - Bước 1 (giao dịch ngắn): kiểm quyền, mở / kiểm hội thoại, đọc lịch sử, GHI câu hỏi.
 *  - Gọi mô hình NGOÀI mọi giao dịch, có hạn (`AI_HAN_GOI_GIAY`, mặc định 60 giây).
 *  - Mỗi lần mô hình gọi công cụ: một giao dịch ngắn riêng, với quyền của người hỏi đọc lại mới.
 *  - Bước cuối (giao dịch ngắn): ghi câu trả lời (hoặc lỗi), các lần gọi công cụ, sự kiện.
 *
 * Mô hình chậm / treo / hỏng thì câu hỏi vẫn còn, lượt trả lời ghi lỗi rõ ràng — không còn cảnh
 * giữ một kết nối CSDL trong lúc chờ mạng rồi hỏng vì quá hạn 5 giây của Prisma.
 *
 * Nhận `NguCanh` (bài thử cũ: mọi bước chạy trong giao dịch đang có) hoặc `BuocGiaoDich` (route
 * `/api/v1/tro-ly/hoi` qua `xuLyApiNhieuBuoc`).
 */
export async function hoiDap(x: NguCanh | BuocGiaoDich, d: { hoiThoaiId?: string; cauHoi: string }): Promise<KetQuaHoiDap> {
  const nb = thanhBuoc(x);
  const cauHoi = d.cauHoi.trim();

  // Bước 1 — kiểm quyền, ghi câu hỏi. Chưa cấu hình thì dừng NGAY, trước khi ghi gì (AI-06).
  const buoc1 = await nb.giaoDich(async (nc) => {
    batBuocQuyen(nc.hoSo, "ai.view", { objectType: "ai_conversation" });
    if (cauHoi.length < 2) throw new LoiDinhDang("cauHoi", "Nhập câu hỏi.");
    const ncc = (() => {
      try {
        return nhaCungCapDangDung();
      } catch (loi) {
        if (loi instanceof LoiNhaCungCapAI) {
          throw new LoiNghiepVu(
            `Trợ lý chưa dùng được: ${loi.message} Hệ thống không trả lời khi chưa gọi được mô hình.`,
            503,
            "ai-chua-cau-hinh",
          );
        }
        throw loi;
      }
    })();

    let hoiThoaiId = d.hoiThoaiId ?? "";
    if (hoiThoaiId) {
      const h = await docHoiThoai(nc, hoiThoaiId);
      if (h.status !== "dang-mo") throw new LoiNghiepVu("Hội thoại đã đóng.", 409, "hoi-thoai-da-dong");
    } else {
      const moi = await nc.tx.aiConversation.create({
        data: {
          tenantId: nc.tenantId,
          userId: nc.hoSo.userId,
          title: datTenHoiThoai(cauHoi),
          provider: ncc.ten,
          model: ncc.model,
        },
        select: { id: true },
      });
      hoiThoaiId = moi.id;
    }

    const lichSu = await lichSuChoMoHinh(nc, hoiThoaiId);
    await nc.tx.aiMessage.create({
      data: { tenantId: nc.tenantId, conversationId: hoiThoaiId, role: "nguoi-dung", content: cauHoi },
    });

    // Công cụ đọc + đúng MỘT công cụ ghi: đặt đề xuất chờ người bấm (AI-03).
    const congCu = [...congCuChoNguoi(nc.hoSo), ...congCuDeXuat(hoiThoaiId, nc.hoSo)];
    const heThong = loiNhacHeThong(
      { hoTen: nc.hoSo.hoTen, vaiTro: nc.hoSo.vaiTro.map((v) => v.name) },
      homNayVN(),
    );
    return { ncc, hoiThoaiId, lichSu, congCu, heThong };
  });

  const { ncc, hoiThoaiId, congCu, heThong } = buoc1;
  const tt = tinhTrangAI();

  // 2. Vòng lặp mô hình ↔ công cụ — NGOÀI giao dịch.
  const moTaCongCu = congCu.map((c) => ({ ten: c.ten, moTa: c.moTa, thamSo: c.luocDoJson }));
  const tinNhan: TinNhanAI[] = [...buoc1.lichSu, { vaiTro: "nguoi-dung", noiDung: cauHoi }];

  const daGoi: { ten: string; thamSo: Record<string, unknown>; ketCuc: KetCucGoi; ketQua: string | null; loi: string | null; mili: number }[] = [];
  let soVong = 0;
  let traLoi = "";
  let tokensIn: number | null = null;
  let tokensOut: number | null = null;
  let loiLuot: string | null = null;
  let vuotTran = false;

  try {
    while (soVong < TOI_DA_VONG) {
      soVong += 1;
      const ph = await ncc.goi({ heThong, tinNhan, congCu: moTaCongCu, toiDaToken: 4096 });
      tokensIn = ph.tokensIn ?? tokensIn;
      tokensOut = ph.tokensOut ?? tokensOut;

      const goi = ph.khoi.filter((k): k is Extract<KhoiPhanHoi, { loai: "goi-cong-cu" }> => k.loai === "goi-cong-cu");
      if (!ph.doiCongCu || goi.length === 0) {
        traLoi = gopVanBan(ph.khoi);
        break;
      }

      tinNhan.push({ vaiTro: "tro-ly", noiDung: ph.khoi });

      for (const g of goi) {
        const batDau = Date.now();
        let ketCuc: KetCucGoi = "ok";
        let ketQua: string | null = null;
        let loi: string | null = null;

        const cc = congCu.find((x) => x.ten === g.ten) ?? timCongCu(g.ten);
        if (!cc) {
          ketCuc = "tham-so-sai";
          loi = `Không có công cụ tên "${g.ten}".`;
        } else {
          try {
            // Mỗi công cụ một giao dịch ngắn: công cụ hỏng ở tầng CSDL không làm hỏng các công cụ sau.
            ketQua = await nb.giaoDich(async (nc) => {
              // Lớp chặn thứ hai: kiểm quyền ngay trước khi chạy, không tin danh sách đã lọc.
              batBuocQuyenCongCu(nc, cc);
              const thamSo = cc.thamSo.parse(g.thamSo) as Record<string, unknown>;
              return ketQuaSangVanBan(await cc.chay(nc, thamSo));
            });
          } catch (e) {
            // Phiên bị thu hồi / bắt đổi mật khẩu giữa lượt: dừng hẳn, không gọi mô hình thêm vòng nào
            // (tốn tiền, và kết quả không ghi được cho một phiên đã hết hiệu lực) — QA 0.16.1.
            if (laLoiPhien(e)) throw e;
            if (e instanceof LoiThieuQuyen) {
              ketCuc = "thieu-quyen";
              loi = `Thiếu quyền ${cc.quyen}.`;
            } else if (e instanceof LoiDinhDang || (e as { name?: string })?.name === "ZodError") {
              ketCuc = "tham-so-sai";
              loi = e instanceof Error ? e.message : String(e);
            } else {
              ketCuc = "loi";
              loi = e instanceof Error ? e.message : String(e);
            }
          }
        }

        const mili = Date.now() - batDau;
        daGoi.push({ ten: g.ten, thamSo: g.thamSo, ketCuc, ketQua, loi, mili });
        tinNhan.push({
          vaiTro: "ket-qua-cong-cu",
          idGoi: g.id,
          noiDung: ketCuc === "ok" ? (ketQua ?? "null") : cauBaoLoiCongCu(ketCuc, loi ?? ""),
          loi: ketCuc !== "ok",
        });
      }
    }

    if (!traLoi) {
      vuotTran = true;
      traLoi = CAU_VUOT_TRAN;
    }
  } catch (e) {
    if (laLoiPhien(e)) throw e;
    loiLuot = e instanceof Error ? e.message : String(e);
    traLoi =
      "Tôi chưa gọi được mô hình nên không trả lời câu này. Số liệu thì tôi không đoán — bạn thử lại sau ít phút giúp tôi.";
  }

  // 3. Ghi lượt trả lời và từng lần gọi công cụ — giao dịch ngắn riêng.
  const tinId = await nb.giaoDich(async (nc) => {
    const tin = await nc.tx.aiMessage.create({
      data: {
        tenantId: nc.tenantId,
        conversationId: hoiThoaiId,
        role: "tro-ly",
        content: traLoi,
        turns: soVong,
        tokensIn,
        tokensOut,
        error: loiLuot,
      },
      select: { id: true },
    });
    // Từng dòng một (không createMany) để thứ tự created_at giữ đúng thứ tự gọi.
    for (const g of daGoi) {
      await nc.tx.aiToolCall.create({
        data: {
          tenantId: nc.tenantId,
          messageId: tin.id,
          toolName: g.ten,
          args: g.thamSo as Prisma.InputJsonValue,
          result: g.ketQua,
          outcome: g.ketCuc,
          error: g.loi,
          durationMs: g.mili,
        },
      });
    }
    await nc.tx.aiConversation.update({ where: { id: hoiThoaiId }, data: { lastMessageAt: new Date() } });
    await nc.suKien({
      eventType: SU_KIEN.AI_SUGGESTION_CREATED,
      objectType: "ai_conversation",
      objectId: hoiThoaiId,
      payload: { soVong, soCongCu: daGoi.length, nhaCungCap: tt.nhaCungCap, model: ncc.model, loi: loiLuot },
    });
    return tin.id;
  });

  return {
    hoiThoaiId,
    tinNhanId: tinId,
    traLoi,
    soVong,
    congCuDaGoi: daGoi.map((g) => ({ ten: g.ten, ketCuc: g.ketCuc })),
    vuotTran,
    loi: loiLuot,
  };
}

export async function dongHoiThoai(nc: NguCanh, id: string) {
  batBuocQuyen(nc.hoSo, "ai.view", { objectType: "ai_conversation", objectId: id });
  await docHoiThoai(nc, id);
  await nc.tx.aiConversation.update({ where: { id }, data: { status: "da-dong" } });
  return { id, trangThai: "da-dong" };
}

// ---------------------------------------------------------------------------
// Quyền xem của giao diện
// ---------------------------------------------------------------------------

export function quyenGiaoDienTroLy(nc: NguCanh) {
  return {
    hoi: coQuyen(nc.hoSo, "ai.view"),
    duyetDeXuat: coQuyen(nc.hoSo, "quotation.create") || coQuyen(nc.hoSo, "task.create"),
  };
}
