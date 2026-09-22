// Chỉ chạy ở máy chủ: dùng node:fs.
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { duongDanHopLe } from "./tinh-toan";

/**
 * Nơi cất nội dung tệp đính kèm: **trên đĩa**, không trong cơ sở dữ liệu.
 *
 * Để nội dung trong CSDL thì mỗi lần `pg_dump` phải kéo theo hàng gigabyte ảnh chụp
 * hóa đơn, và bản sao lưu chậm dần theo thời gian cho tới lúc không ai chạy nữa.
 *
 * Thư mục gốc gắn thành volume Docker (`./data/dinh-kem`), nên nó **không** nằm trong
 * ảnh và sống qua mỗi lần triển khai lại.
 *
 * GIỚI HẠN phải nói rõ: `scripts/sao-luu.sh` nay có đóng gói thư mục này, nhưng bản
 * sao lưu vẫn nằm trên cùng máy chủ — mất máy là mất cả hai (`VD-068`).
 */

export function thuMucGoc(): string {
  return process.env.THU_MUC_DINH_KEM ?? path.join(process.cwd(), "data", "dinh-kem");
}

function duongDanTuyetDoi(duongDanTuongDoi: string): string {
  if (!duongDanHopLe(duongDanTuongDoi)) {
    throw new Error(`Đường dẫn tệp đính kèm không hợp lệ: ${duongDanTuongDoi}`);
  }
  const goc = path.resolve(thuMucGoc());
  const day = path.resolve(goc, duongDanTuongDoi);
  // Lớp chặn thứ hai. Lớp thứ nhất là `duongDanHopLe` ở trên; hai lớp vì đây là chỗ
  // một lỗi nhỏ thành "đọc được tệp bất kỳ trên máy chủ".
  if (day !== goc && !day.startsWith(goc + path.sep)) {
    throw new Error("Đường dẫn tệp đính kèm thoát khỏi thư mục gốc.");
  }
  return day;
}

export function maBam(noiDung: Uint8Array): string {
  return createHash("sha256").update(noiDung).digest("hex");
}

export async function ghiTep(duongDanTuongDoi: string, noiDung: Uint8Array): Promise<void> {
  const day = duongDanTuyetDoi(duongDanTuongDoi);
  await mkdir(path.dirname(day), { recursive: true });
  // Cờ "wx": không đè tệp đã có. Tên tệp là id sinh ngẫu nhiên nên trùng nghĩa là
  // có chuyện lạ, và đè lên là mất tệp cũ mà không ai biết.
  await writeFile(day, noiDung, { flag: "wx" });
}

export async function docTep(duongDanTuongDoi: string): Promise<Buffer> {
  return readFile(duongDanTuyetDoi(duongDanTuongDoi));
}
