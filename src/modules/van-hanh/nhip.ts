import type { ClientTenant } from "@/lib/db";
import { danhGiaNhipWorker, danhGiaSaoLuu, type TrangThaiNhip, type TrangThaiSaoLuu } from "./tinh-toan";

/**
 * Nhịp sống của tiến trình hệ thống — bảng `system_heartbeats` (QĐ-87, QĐ-88).
 *
 * Bảng toàn hệ thống (không có tenant_id), nên hàm ở đây nhận BẤT KỲ client nào: client gốc
 * ngoài giao dịch (worker, /api/khoe) hay `tx` của một giao dịch tenant (màn hình Tự động hóa).
 * RLS cho đọc mọi dòng, chỉ cho vai ứng dụng ghi dòng 'worker…'.
 */

/** Phần tối thiểu của PrismaClient / ClientTenant mà module này cần. */
export type ClientNhip = Pick<ClientTenant, "$executeRaw" | "systemHeartbeat">;

export const TEN_NHIP_WORKER = "worker";
export const TEN_NHIP_SAO_LUU = "sao-luu";
export const TEN_NHIP_THU_PHUC_HOI = "thu-phuc-hoi";

/** Ghi một nhịp: upsert theo tên. `ok = false` giữ nguyên mốc thành công cũ. */
export async function ghiNhip(client: ClientNhip, ten: string, info: Record<string, unknown> = {}, ok = true): Promise<void> {
  const json = JSON.stringify(info);
  await client.$executeRaw`
    INSERT INTO system_heartbeats (name, last_at, ok, last_ok_at, info)
    VALUES (${ten}, now(), ${ok}, CASE WHEN ${ok} THEN now() ELSE NULL END, ${json}::jsonb)
    ON CONFLICT (name) DO UPDATE SET
      last_at = now(),
      ok = EXCLUDED.ok,
      last_ok_at = CASE WHEN EXCLUDED.ok THEN now() ELSE system_heartbeats.last_ok_at END,
      info = EXCLUDED.info`;
}

export interface TinhTrangVanHanh {
  worker: { trangThai: TrangThaiNhip; lanCuoi: Date | null; info: Record<string, unknown> };
  saoLuu: {
    trangThai: TrangThaiSaoLuu;
    lanCuoi: Date | null;
    lanThanhCongCuoi: Date | null;
    ok: boolean | null;
    info: Record<string, unknown>;
  };
  /** Lần chạy scripts/thu-phuc-hoi.sh gần nhất — null nếu chưa chạy lần nào. */
  thuPhucHoi: { lanCuoi: Date | null; ok: boolean | null; lanThanhCongCuoi: Date | null; info: Record<string, unknown> };
}

function laDoiTuong(x: unknown): Record<string, unknown> {
  return x && typeof x === "object" && !Array.isArray(x) ? (x as Record<string, unknown>) : {};
}

/** Đọc tình trạng worker + sao lưu cho màn hình quản trị. Bản chi tiết — KHÔNG trả ra trang công khai. */
export async function docTinhTrangVanHanh(client: ClientNhip, bayGio: Date = new Date()): Promise<TinhTrangVanHanh> {
  const ds = await client.systemHeartbeat.findMany({ select: { name: true, lastAt: true, ok: true, lastOkAt: true, info: true } });
  const w = ds.find((d) => d.name === TEN_NHIP_WORKER) ?? null;
  const s = ds.find((d) => d.name === TEN_NHIP_SAO_LUU) ?? null;
  const p = ds.find((d) => d.name === TEN_NHIP_THU_PHUC_HOI) ?? null;
  return {
    worker: {
      trangThai: danhGiaNhipWorker(w?.lastAt ?? null, bayGio),
      lanCuoi: w?.lastAt ?? null,
      info: laDoiTuong(w?.info),
    },
    saoLuu: {
      trangThai: danhGiaSaoLuu(s ? { lanCuoi: s.lastAt, ok: s.ok, lanThanhCongCuoi: s.lastOkAt } : null, bayGio),
      lanCuoi: s?.lastAt ?? null,
      lanThanhCongCuoi: s?.lastOkAt ?? null,
      ok: s?.ok ?? null,
      info: laDoiTuong(s?.info),
    },
    thuPhucHoi: {
      lanCuoi: p?.lastAt ?? null,
      ok: p?.ok ?? null,
      lanThanhCongCuoi: p?.lastOkAt ?? null,
      info: laDoiTuong(p?.info),
    },
  };
}
