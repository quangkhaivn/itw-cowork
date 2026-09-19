import { prisma, voiTenant } from "../src/lib/db";
import { clientChuSoHuu, dat, datNemLoi, ketLuan } from "./thu-lib";

/**
 * BÀI KIỂM CHỨNG QUAN TRỌNG NHẤT CỦA PHASE 1.
 *
 * Mục 30 đặc tả cấm trộn dữ liệu giữa tenant. Bài này dựng hai doanh nghiệp giả
 * rồi chứng minh doanh nghiệp này không thấy được một dòng nào của doanh nghiệp kia,
 * kể cả khi code cố tình làm sai.
 *
 * Chạy: npm run thu:cach-ly
 */

const chu = clientChuSoHuu();

async function main() {
  console.log("=== Thử cách ly tenant ===\n");

  // Dọn tàn dư của lần chạy trước.
  await chu.tenant.deleteMany({ where: { code: { in: ["thu-a", "thu-b"] } } });

  const a = await chu.tenant.create({ data: { code: "thu-a", name: "Doanh nghiệp A (bài thử)" } });
  const b = await chu.tenant.create({ data: { code: "thu-b", name: "Doanh nghiệp B (bài thử)" } });

  await chu.user.create({
    data: { tenantId: a.id, email: "nguoi@a.test", passwordHash: "x", fullName: "Người của A" },
  });
  await chu.user.create({
    data: { tenantId: b.id, email: "nguoi@b.test", passwordHash: "x", fullName: "Người của B" },
  });

  console.log("Đã dựng 2 doanh nghiệp, mỗi bên 1 người dùng.\n");

  // --- 1. Trong ngữ cảnh A chỉ thấy người của A ---
  const trongA = await voiTenant(a.id, (tx) => tx.user.findMany({ select: { email: true } }));
  dat("Ngữ cảnh A thấy đúng 1 người dùng", trongA.length === 1, `thấy ${trongA.length}`);
  dat("Ngữ cảnh A thấy đúng người của A", trongA[0]?.email === "nguoi@a.test", trongA[0]?.email);
  dat(
    "Ngữ cảnh A KHÔNG thấy người của B",
    !trongA.some((u) => u.email === "nguoi@b.test"),
  );

  // --- 2. Trong ngữ cảnh B chỉ thấy người của B ---
  const trongB = await voiTenant(b.id, (tx) => tx.user.findMany({ select: { email: true } }));
  dat("Ngữ cảnh B thấy đúng 1 người dùng", trongB.length === 1, `thấy ${trongB.length}`);
  dat("Ngữ cảnh B thấy đúng người của B", trongB[0]?.email === "nguoi@b.test", trongB[0]?.email);

  // --- 3. Quên đặt ngữ cảnh thì không thấy gì (đây là điểm mấu chốt) ---
  const quenNguCanh = await prisma.user.findMany({ select: { email: true } });
  dat(
    "Truy vấn KHÔNG có ngữ cảnh tenant trả về 0 dòng",
    quenNguCanh.length === 0,
    `trả về ${quenNguCanh.length} dòng — RLS không chặn!`,
  );

  // --- 4. Cố tình tra thẳng theo id của tenant khác cũng không ra ---
  const doXuyenTenant = await voiTenant(a.id, (tx) =>
    tx.user.findMany({ where: { email: "nguoi@b.test" }, select: { email: true } }),
  );
  dat("Ở ngữ cảnh A, tìm thẳng email của B vẫn ra rỗng", doXuyenTenant.length === 0);

  // --- 5. Không ghi được dữ liệu mang tenant_id của người khác ---
  await datNemLoi("Ở ngữ cảnh A, chèn bản ghi gắn tenant_id của B bị từ chối", () =>
    voiTenant(a.id, (tx) =>
      tx.user.create({
        data: { tenantId: b.id, email: "xam-nhap@b.test", passwordHash: "x", fullName: "Xâm nhập" },
      }),
    ),
  );

  // --- 6. Không sửa được bản ghi của tenant khác ---
  const soSuaDuoc = await voiTenant(a.id, (tx) =>
    tx.user.updateMany({ where: { email: "nguoi@b.test" }, data: { fullName: "Bị sửa trộm" } }),
  );
  dat("Ở ngữ cảnh A, sửa bản ghi của B không chạm được dòng nào", soSuaDuoc.count === 0, `sửa ${soSuaDuoc.count} dòng`);

  // --- 7. Không xóa được bản ghi của tenant khác ---
  const soXoaDuoc = await voiTenant(a.id, (tx) => tx.user.deleteMany({ where: { email: "nguoi@b.test" } }));
  dat("Ở ngữ cảnh A, xóa bản ghi của B không chạm được dòng nào", soXoaDuoc.count === 0, `xóa ${soXoaDuoc.count} dòng`);

  // Xác nhận người của B còn nguyên vẹn.
  const bConNguyen = await chu.user.findFirst({ where: { tenantId: b.id, email: "nguoi@b.test" } });
  dat("Người dùng của B còn nguyên sau mọi phép thử", bConNguyen?.fullName === "Người của B", bConNguyen?.fullName);

  // Dọn dẹp.
  await chu.tenant.deleteMany({ where: { code: { in: ["thu-a", "thu-b"] } } });
  await chu.$disconnect();
  await prisma.$disconnect();

  ketLuan("Thử cách ly tenant");
}

main().catch(async (loi) => {
  console.error("Bài thử gặp lỗi ngoài dự kiến:", loi);
  await chu.tenant.deleteMany({ where: { code: { in: ["thu-a", "thu-b"] } } }).catch(() => {});
  process.exit(1);
});
