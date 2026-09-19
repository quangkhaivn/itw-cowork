import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

/** Tiện ích dùng chung cho các bài kiểm chứng. */

export function clientChuSoHuu(): PrismaClient {
  const connectionString = process.env.DATABASE_URL_OWNER;
  if (!connectionString) throw new Error("Thiếu DATABASE_URL_OWNER — bài thử cần vai chủ sở hữu để dựng dữ liệu.");
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

let soDat = 0;
let soHong = 0;

export function dat(ten: string, dieuKien: boolean, chiTiet = "") {
  if (dieuKien) {
    soDat++;
    console.log(`  ✓ ${ten}`);
  } else {
    soHong++;
    console.log(`  ❌ HỎNG: ${ten}${chiTiet ? ` — ${chiTiet}` : ""}`);
  }
}

/** Khẳng định một khối lệnh PHẢI ném lỗi. Dùng cho các chốt chặn an toàn. */
export async function datNemLoi(ten: string, khoi: () => Promise<unknown>) {
  try {
    await khoi();
    dat(ten, false, "không ném lỗi như mong đợi");
  } catch {
    dat(ten, true);
  }
}

export function ketLuan(tenBai: string): never {
  console.log(`\n${tenBai}: ${soDat} đạt, ${soHong} hỏng`);
  if (soHong > 0) {
    console.log("❌ HỎNG — không được đưa lên môi trường thật.");
    process.exit(1);
  }
  console.log("✓ Toàn bộ đạt.");
  process.exit(0);
}
