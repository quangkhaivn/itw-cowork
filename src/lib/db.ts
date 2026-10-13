import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

/**
 * Kết nối cơ sở dữ liệu và cách ly tenant.
 *
 * Nguyên tắc: KHÔNG tin vào kỷ luật lập trình viên. Cách ly được chốt ở hai lớp:
 *
 *   Lớp 1 — ở đây: mọi truy vấn nghiệp vụ bắt buộc đi qua `voiTenant()`, hàm này
 *           mở một giao dịch và đặt biến phiên `app.tenant_id`.
 *   Lớp 2 — ở PostgreSQL: Row Level Security lọc theo `app.tenant_id`. Nếu lập
 *           trình viên quên lớp 1, cơ sở dữ liệu trả về 0 dòng chứ không trả
 *           nhầm dữ liệu của doanh nghiệp khác.
 *
 * Ứng dụng kết nối bằng vai `cowork_app`, KHÔNG phải chủ sở hữu bảng — vì chủ sở
 * hữu bảng được PostgreSQL cho bỏ qua RLS.
 */

const LA_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Next.js nạp lại module khi phát triển; giữ một thể hiện duy nhất để không mở tràn kết nối.
const bienToanCuc = globalThis as unknown as { prisma?: PrismaClient };

function layClient(): PrismaClient {
  if (bienToanCuc.prisma) return bienToanCuc.prisma;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("Thiếu biến môi trường DATABASE_URL.");
  }
  const client = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  bienToanCuc.prisma = client;
  return client;
}

/**
 * Kết nối được tạo TRỄ, ở lần dùng đầu tiên — không tạo lúc nạp module.
 *
 * Lý do: `next build` nạp mọi route để thu thập cấu hình, lúc đó chưa có
 * DATABASE_URL. Nếu tạo client ngay khi nạp module thì bản dựng hỏng.
 * Proxy này giữ nguyên cách gọi quen thuộc (`prisma.user.findMany()`) mà vẫn
 * hoãn được việc kết nối. Hàm được bind vào client thật để Prisma không nhận
 * nhầm `this` là proxy.
 */
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_muc, thuocTinh) {
    const client = layClient() as unknown as Record<string | symbol, unknown>;
    const giaTri = client[thuocTinh];
    return typeof giaTri === "function" ? giaTri.bind(client) : giaTri;
  },
});

/** Client bên trong một giao dịch đã đặt tenant. */
export type ClientTenant = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

/**
 * Chạy một khối truy vấn trong ngữ cảnh của đúng một tenant.
 *
 * Mọi thao tác đọc/ghi dữ liệu nghiệp vụ phải nằm trong hàm này. Biến `app.tenant_id`
 * đặt bằng `SET LOCAL` nên tự hết hiệu lực khi giao dịch kết thúc — không rò sang
 * yêu cầu kế tiếp dùng chung kết nối.
 */
export async function voiTenant<T>(
  tenantId: string,
  congViec: (tx: ClientTenant) => Promise<T>,
  tuyChon: TuyChonGiaoDich = {},
): Promise<T> {
  if (!LA_UUID.test(tenantId)) {
    throw new Error(`tenantId không hợp lệ: ${tenantId}`);
  }
  return prisma.$transaction(
    async (tx) => {
      // Tham số hóa qua set_config, không nối chuỗi vào câu lệnh.
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
      return congViec(tx as ClientTenant);
    },
    // Không truyền gì = giữ mặc định của Prisma (5 giây) cho mọi thao tác thường.
    tuyChon.timeoutMs ? { timeout: tuyChon.timeoutMs } : undefined,
  );
}

export interface TuyChonGiaoDich {
  /** Hạn của giao dịch (ms). Bỏ trống = mặc định Prisma 5 giây. Chỉ nới cho thao tác theo lô — QĐ-56. */
  timeoutMs?: number;
}

/**
 * Hạn giao dịch cho thao tác THEO LÔ có trần số dòng rõ ràng: nhập CSV (≤ 5.000 dòng), thao tác
 * hàng loạt (≤ 500 khách), tính lại toàn bộ điểm. Cả lô vẫn là MỘT giao dịch — hỏng giữa chừng
 * thì cuộn ngược hết; đổi lại giữ khóa lâu hơn, nên chỉ dùng ở các route đã kê (QĐ-56).
 */
export const HAN_GIAO_DICH_THEO_LO_MS = 120_000;

/**
 * Tra cứu tenant theo mã. Đây là thao tác duy nhất được phép chạy ngoài ngữ cảnh
 * tenant, vì lúc đăng nhập ta chưa biết người dùng thuộc doanh nghiệp nào.
 * Bảng `tenants` là sổ đăng ký doanh nghiệp, không chứa dữ liệu khách hàng, và
 * vai `cowork_app` chỉ được QUYỀN ĐỌC bảng này (xem migration 0002).
 */
export async function timTenantTheoMa(ma: string) {
  return prisma.tenant.findFirst({
    where: { code: ma, status: "hoat-dong" },
    select: { id: true, code: true, name: true },
  });
}
