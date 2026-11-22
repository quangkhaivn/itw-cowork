import { voiTenant } from "../../src/lib/db";
import { prisma } from "../../src/lib/db";
import { aadApp, aadKenh, phienBanKhoaHienTai } from "../../src/modules/mang-xa-hoi/bao-mat/khoa-chu";
import { bocLaiKhoa } from "./giai-ma";

/**
 * Xoay khóa chủ SOCIAL_MASTER_KEY (SEC-05): bọc lại mọi data key đang ở phiên bản cũ bằng phiên bản hiện tại. Bản mã dữ liệu
 * giữ nguyên. Chạy: `npm run mxh:boc-lai-khoa` sau khi đặt khóa mới + tăng SOCIAL_MASTER_KEY_VERSION + giữ khóa cũ ở
 * SOCIAL_MASTER_KEY_V<n>. Chạy lại được (dòng đã ở phiên bản mới bị bỏ qua). Xong thì có thể xóa khóa cũ khỏi .env.
 */
export async function bocLaiToanBo(env: NodeJS.ProcessEnv = process.env): Promise<{ kenh: number; app: number }> {
  const v = phienBanKhoaHienTai(env);
  let kenh = 0;
  let app = 0;
  const dn = await prisma.tenant.findMany({ select: { id: true } });
  for (const t of dn) {
    await voiTenant(t.id, async (tx) => {
      for (const c of await tx.socialCredential.findMany({ where: { keyVersion: { not: v } } })) {
        const moi = bocLaiKhoa(c, aadKenh(t.id, c.connectionId), env);
        await tx.socialCredential.update({ where: { connectionId: c.connectionId }, data: moi });
        kenh++;
      }
      for (const a of await tx.socialAppConfig.findMany({ where: { keyVersion: { not: v }, ciphertext: { not: null } } })) {
        const moi = bocLaiKhoa({ ciphertext: a.ciphertext!, iv: a.iv!, authTag: a.authTag!, wrappedKey: a.wrappedKey!, keyVersion: a.keyVersion! }, aadApp(t.id, a.provider), env);
        await tx.socialAppConfig.update({ where: { id: a.id }, data: moi });
        app++;
      }
    }, { timeoutMs: 60_000 });
  }
  return { kenh, app };
}

if (process.argv[1]?.endsWith("boc-lai-khoa.ts")) {
  bocLaiToanBo()
    .then((kq) => {
      console.log(`✓ Đã bọc lại ${kq.kenh} bí mật kênh, ${kq.app} bí mật app bằng SOCIAL_MASTER_KEY phiên bản ${phienBanKhoaHienTai()}.`);
      process.exit(0);
    })
    .catch((e) => {
      console.error("❌ Bọc lại khóa hỏng:", e instanceof Error ? e.message : e);
      process.exit(1);
    });
}
