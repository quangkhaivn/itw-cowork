/**
 * Lớp nhà cung cấp mô hình — AI_ARCHITECTURE.md mục 2.
 *
 * Đổi mô hình là đổi **cấu hình**, không sửa mã nghiệp vụ: mọi thứ phía trên chỉ biết
 * giao diện `NhaCungCapAI`. Khóa API đọc từ biến môi trường, **không bao giờ** lưu trong
 * cơ sở dữ liệu và không bao giờ đi vào nhật ký.
 *
 * Chưa cấu hình thì hệ thống **nói thẳng là chưa cấu hình** và từ chối trả lời. Không có
 * đường nào để trợ lý bịa một câu trả lời khi không gọi được mô hình (AI-06).
 */

export interface KhoiVanBan {
  loai: "van-ban";
  noiDung: string;
}

export interface KhoiGoiCongCu {
  loai: "goi-cong-cu";
  id: string;
  ten: string;
  thamSo: Record<string, unknown>;
}

export type KhoiPhanHoi = KhoiVanBan | KhoiGoiCongCu;

export interface TinNhanAI {
  vaiTro: "nguoi-dung" | "tro-ly" | "ket-qua-cong-cu";
  /** Với `ket-qua-cong-cu`: id của lần gọi mà kết quả này trả lời. */
  idGoi?: string;
  noiDung: string | KhoiPhanHoi[];
  /** Với `ket-qua-cong-cu`: công cụ chạy hỏng hay không. */
  loi?: boolean;
}

export interface MoTaCongCuChoMoHinh {
  ten: string;
  moTa: string;
  thamSo: Record<string, unknown>;
}

export interface DauVaoGoi {
  heThong: string;
  tinNhan: TinNhanAI[];
  congCu: MoTaCongCuChoMoHinh[];
  toiDaToken: number;
}

export interface PhanHoiAI {
  khoi: KhoiPhanHoi[];
  /** true = mô hình muốn gọi công cụ và chờ kết quả. */
  doiCongCu: boolean;
  tokensIn: number | null;
  tokensOut: number | null;
  model: string;
}

export interface NhaCungCapAI {
  ten: string;
  model: string;
  goi(dauVao: DauVaoGoi): Promise<PhanHoiAI>;
}

/** Lỗi riêng cho việc chưa cấu hình / không gọi được mô hình. */
export class LoiNhaCungCapAI extends Error {
  constructor(
    message: string,
    readonly ma: string,
  ) {
    super(message);
    this.name = "LoiNhaCungCapAI";
  }
}

// ---------------------------------------------------------------------------
// Anthropic (mặc định)
// ---------------------------------------------------------------------------

const URL_ANTHROPIC = "https://api.anthropic.com/v1/messages";
const PHIEN_BAN_API = "2023-06-01";

interface KhoiAnthropic {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
}

function tinNhanSangAnthropic(t: TinNhanAI): Record<string, unknown> {
  if (t.vaiTro === "ket-qua-cong-cu") {
    return {
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: t.idGoi,
          content: typeof t.noiDung === "string" ? t.noiDung : JSON.stringify(t.noiDung),
          ...(t.loi ? { is_error: true } : {}),
        },
      ],
    };
  }
  if (typeof t.noiDung === "string") {
    return { role: t.vaiTro === "tro-ly" ? "assistant" : "user", content: t.noiDung };
  }
  return {
    role: "assistant",
    content: t.noiDung.map((k) =>
      k.loai === "van-ban"
        ? { type: "text", text: k.noiDung }
        : { type: "tool_use", id: k.id, name: k.ten, input: k.thamSo },
    ),
  };
}

export function taoNhaCungCapAnthropic(khoa: string, model: string): NhaCungCapAI {
  return {
    ten: "anthropic",
    model,
    async goi(dauVao) {
      const r = await fetch(URL_ANTHROPIC, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": khoa,
          "anthropic-version": PHIEN_BAN_API,
        },
        body: JSON.stringify({
          model,
          max_tokens: dauVao.toiDaToken,
          system: dauVao.heThong,
          messages: dauVao.tinNhan.map(tinNhanSangAnthropic),
          ...(dauVao.congCu.length
            ? {
                tools: dauVao.congCu.map((c) => ({
                  name: c.ten,
                  description: c.moTa,
                  input_schema: c.thamSo,
                })),
              }
            : {}),
        }),
      });

      if (!r.ok) {
        // Cố ý KHÔNG đưa thân lỗi của nhà cung cấp vào thông báo cho người dùng:
        // nó có thể chứa lại một phần prompt. Ghi mã lỗi là đủ để chẩn đoán.
        throw new LoiNhaCungCapAI(`Nhà cung cấp AI trả lỗi ${r.status}.`, `nha-cung-cap-${r.status}`);
      }

      const d = (await r.json()) as {
        content: KhoiAnthropic[];
        stop_reason: string;
        model: string;
        usage?: { input_tokens?: number; output_tokens?: number };
      };

      const khoi: KhoiPhanHoi[] = [];
      for (const k of d.content ?? []) {
        if (k.type === "text" && k.text) khoi.push({ loai: "van-ban", noiDung: k.text });
        else if (k.type === "tool_use" && k.id && k.name) {
          khoi.push({ loai: "goi-cong-cu", id: k.id, ten: k.name, thamSo: k.input ?? {} });
        }
      }

      return {
        khoi,
        doiCongCu: d.stop_reason === "tool_use",
        tokensIn: d.usage?.input_tokens ?? null,
        tokensOut: d.usage?.output_tokens ?? null,
        model: d.model ?? model,
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Chọn nhà cung cấp theo cấu hình
// ---------------------------------------------------------------------------

export interface TinhTrangAI {
  daCauHinh: boolean;
  nhaCungCap: string | null;
  model: string | null;
  lyDo: string;
}

const MODEL_MAC_DINH = "claude-sonnet-5";

/** Trợ lý đã dùng được chưa — để giao diện nói thật thay vì hiện ô chat chết. */
export function tinhTrangAI(): TinhTrangAI {
  const ncc = (process.env.AI_PROVIDER ?? "anthropic").trim().toLowerCase();
  const model = (process.env.AI_MODEL ?? MODEL_MAC_DINH).trim();
  if (ncc !== "anthropic") {
    return { daCauHinh: false, nhaCungCap: ncc, model, lyDo: `Chưa hỗ trợ nhà cung cấp "${ncc}".` };
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return {
      daCauHinh: false,
      nhaCungCap: ncc,
      model,
      lyDo: "Chưa đặt khóa API trong biến môi trường ANTHROPIC_API_KEY trên máy chủ.",
    };
  }
  return { daCauHinh: true, nhaCungCap: ncc, model, lyDo: "" };
}

export function layNhaCungCap(): NhaCungCapAI {
  const tt = tinhTrangAI();
  if (!tt.daCauHinh) throw new LoiNhaCungCapAI(tt.lyDo, "chua-cau-hinh");
  return taoNhaCungCapAnthropic(process.env.ANTHROPIC_API_KEY!, tt.model!);
}

/**
 * Cho phép bài thử cắm một nhà cung cấp **kịch bản** (trả lời theo bản dựng sẵn) để
 * kiểm chứng toàn bộ vòng lặp, kiểm quyền và luồng duyệt mà không gọi mạng.
 * Chỉ dùng trong kiểm thử; mã sản phẩm luôn đi qua `layNhaCungCap()`.
 */
let nhaCungCapThu: NhaCungCapAI | null = null;

export function datNhaCungCapThu(ncc: NhaCungCapAI | null): void {
  nhaCungCapThu = ncc;
}

export function nhaCungCapDangDung(): NhaCungCapAI {
  return nhaCungCapThu ?? layNhaCungCap();
}
