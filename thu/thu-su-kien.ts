import { prisma, voiTenant } from "../src/lib/db";
import { ghiSuKien, SU_KIEN } from "../src/lib/su-kien";
import { ghiKiemToan } from "../src/lib/kiem-toan";
import { clientChuSoHuu, dat, datNemLoi, ketLuan } from "./thu-lib";

/**
 * Kiểm chứng Business Events và Audit Log (mục 16, 27 đặc tả).
 *
 * Điểm cần chứng minh: hai bảng này CHỈ GHI THÊM. Không ai sửa hay xóa được
 * lịch sử, kể cả vai chủ sở hữu — nếu không thì nhật ký kiểm toán vô giá trị.
 *
 * Chạy: npm run thu:su-kien
 */

const chu = clientChuSoHuu();

async function main() {
  console.log("=== Thử Business Events và Audit Log ===\n");

  const tenant = await chu.tenant.findUnique({ where: { code: "itw" } });
  if (!tenant) {
    console.log("  ❌ HỎNG: chưa seed tenant 'itw'. Chạy `npm run db:seed` trước.");
    process.exit(1);
  }

  const truoc = await chu.businessEvent.count({ where: { tenantId: tenant.id } });

  // --- 1. Ghi được sự kiện, và tenant_id lấy từ ngữ cảnh chứ không truyền tay ---
  const danhDau = `bai-thu-${Date.now()}`;
  await voiTenant(tenant.id, async (tx) => {
    await ghiSuKien(tx, {
      eventType: SU_KIEN.TASK_CREATED,
      actorType: "system",
      objectType: "bai-thu",
      payload: { danhDau },
    });
  });

  const sau = await chu.businessEvent.count({ where: { tenantId: tenant.id } });
  dat("Ghi thêm được 1 Business Event", sau === truoc + 1, `${truoc} → ${sau}`);

  const suKien = await chu.businessEvent.findFirst({
    where: { tenantId: tenant.id, objectType: "bai-thu" },
    orderBy: { createdAt: "desc" },
  });
  dat("Sự kiện mang đúng tenant_id lấy từ ngữ cảnh", suKien?.tenantId === tenant.id);
  dat("Sự kiện lưu đúng payload", (suKien?.payload as { danhDau?: string })?.danhDau === danhDau);

  // --- 2. Không sửa được sự kiện đã ghi ---
  await datNemLoi("Không SỬA được Business Event (chặn bằng trigger)", () =>
    chu.$executeRaw`UPDATE business_events SET event_type = 'BI_SUA_TROM' WHERE id = ${suKien!.id}::uuid`,
  );

  // --- 3. Không xóa được sự kiện đã ghi ---
  await datNemLoi("Không XÓA được Business Event (chặn bằng trigger)", () =>
    chu.$executeRaw`DELETE FROM business_events WHERE id = ${suKien!.id}::uuid`,
  );

  const conNguyen = await chu.businessEvent.findUnique({ where: { id: suKien!.id } });
  dat("Sự kiện còn nguyên sau khi bị thử sửa và xóa", conNguyen?.eventType === SU_KIEN.TASK_CREATED, conNguyen?.eventType);

  // --- 4. Audit Log: ghi được và che được dữ liệu nhạy cảm ---
  await voiTenant(tenant.id, async (tx) => {
    await ghiKiemToan(tx, {
      actorEmail: "bai-thu@thu.test",
      action: "tao",
      objectType: "bai-thu",
      after: { hoTen: "Nguyễn Văn A", password: "matkhausieubimat", apiKey: "sk-that-secret" },
    });
  });

  const vet = await chu.auditLog.findFirst({
    where: { tenantId: tenant.id, objectType: "bai-thu" },
    orderBy: { createdAt: "desc" },
  });
  const sauKhiChe = vet?.after as Record<string, unknown> | null;
  dat("Audit Log ghi được", Boolean(vet));
  dat("Audit Log giữ nguyên trường thường", sauKhiChe?.hoTen === "Nguyễn Văn A");
  dat("Audit Log CHE mật khẩu", sauKhiChe?.password === "***da-che***", String(sauKhiChe?.password));
  dat("Audit Log CHE khóa API", sauKhiChe?.apiKey === "***da-che***", String(sauKhiChe?.apiKey));

  // --- 5. Audit Log cũng không sửa/xóa được ---
  await datNemLoi("Không SỬA được Audit Log", () =>
    chu.$executeRaw`UPDATE audit_logs SET action = 'bi-sua' WHERE id = ${vet!.id}::uuid`,
  );
  await datNemLoi("Không XÓA được Audit Log", () =>
    chu.$executeRaw`DELETE FROM audit_logs WHERE id = ${vet!.id}::uuid`,
  );

  await chu.$disconnect();
  await prisma.$disconnect();

  ketLuan("Thử Business Events và Audit Log");
}

main().catch((loi) => {
  console.error("Bài thử gặp lỗi ngoài dự kiến:", loi);
  process.exit(1);
});
