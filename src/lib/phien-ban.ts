// Chỉ chạy ở máy chủ: dùng node:fs nên Next sẽ báo lỗi ngay nếu ai đó lỡ nhập vào
// một tệp "use client".
import { readFileSync, statSync } from "node:fs";
import path from "node:path";

/**
 * Phiên bản đang chạy của chính máy chủ này.
 *
 * Vì sao cần: ngày 21/09/2026 mất gần một buổi chỉ vì không ai trả lời được câu
 * "máy thật đang chạy bản nào". Dò từ ngoài không ra — proxy đẩy mọi đường dẫn chưa
 * đăng nhập về `/dang-nhap`, kể cả đường không tồn tại, nên mã 307 không chứng minh
 * được route nào có thật.
 *
 * Đọc ở **máy chủ**, không nhúng vào gói JavaScript gửi xuống trình duyệt. Phiên bản
 * không phải bí mật, nhưng đây là phần mềm nội bộ — không có lý do gì để người chưa
 * đăng nhập biết máy chủ đang chạy bản nào.
 *
 * `BUILD_ID` do Next sinh mỗi lần dựng, nên nó trả lời được câu hỏi thật sự quan
 * trọng: *mã đang chạy có đúng là mã tôi vừa gửi lên không*, chứ không chỉ "số phiên
 * bản trong package.json là bao nhiêu" — hai bản dựng khác nhau vẫn có thể cùng số.
 */

export interface PhienBanUngDung {
  /** Số phiên bản trong package.json, ví dụ "0.14.0". */
  so: string;
  /** Mã bản dựng của Next — đổi mỗi lần dựng lại. Null nếu chạy chế độ phát triển. */
  maBanDung: string | null;
  /** Thời điểm dựng (giờ UTC, ISO). Null nếu không đọc được. */
  dungLuc: string | null;
}

function docAnToan<T>(viec: () => T, macDinh: T): T {
  try {
    return viec();
  } catch {
    return macDinh;
  }
}

// Tính một lần cho cả vòng đời tiến trình: tệp không đổi khi máy chủ đang chạy.
let daTinh: PhienBanUngDung | null = null;

export function phienBanUngDung(): PhienBanUngDung {
  if (daTinh) return daTinh;

  const goc = process.cwd();
  const so = docAnToan(() => {
    const pkg = JSON.parse(readFileSync(path.join(goc, "package.json"), "utf8")) as { version?: string };
    return pkg.version ?? "không rõ";
  }, "không rõ");

  const tepBanDung = path.join(goc, ".next", "BUILD_ID");
  const maBanDung = docAnToan(() => readFileSync(tepBanDung, "utf8").trim() || null, null);
  const dungLuc = docAnToan(() => statSync(tepBanDung).mtime.toISOString(), null);

  daTinh = { so, maBanDung, dungLuc };
  return daTinh;
}
