import { createSign, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chuoiKySns, type ThongDiepSns } from "../src/modules/email/sns";

/**
 * Dụng cụ thử SNS: chứng chỉ TỰ KÝ (openssl) + ký thông điệp đúng cách SNS ký. Bài thử cắm chứng chỉ
 * này qua `datMangSns()` — không gọi ra AWS. Dùng chung cho thu:don-vi và thu:email-gui-lon.
 */

export interface ChungChiGia {
  pem: string;
  khoaRieng: string;
}

export function taoChungChiTuKy(cn = "sns.amazonaws.com"): ChungChiGia {
  const thuMuc = mkdtempSync(join(tmpdir(), "cowork-sns-"));
  try {
    execFileSync(
      "openssl",
      ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", join(thuMuc, "k.pem"), "-out", join(thuMuc, "c.pem"), "-days", "2", "-subj", `/CN=${cn}`],
      { stdio: "ignore" },
    );
    return { pem: readFileSync(join(thuMuc, "c.pem"), "utf8"), khoaRieng: readFileSync(join(thuMuc, "k.pem"), "utf8") };
  } finally {
    rmSync(thuMuc, { recursive: true, force: true });
  }
}

type ChuaKy = Omit<ThongDiepSns, "Signature" | "SignatureVersion"> & { SignatureVersion?: "1" | "2" };

export function kyThongDiep(m: ChuaKy, khoaRieng: string): ThongDiepSns {
  const ban = { ...m, SignatureVersion: m.SignatureVersion ?? "2", Signature: "A".repeat(16) } as ThongDiepSns;
  const k = createSign(ban.SignatureVersion === "1" ? "RSA-SHA1" : "RSA-SHA256");
  k.update(chuoiKySns(ban), "utf8");
  return { ...ban, Signature: k.sign(khoaRieng, "base64") };
}

export const VUNG = "ap-southeast-1";
export const URL_CHUNG_CHI = `https://sns.${VUNG}.amazonaws.com/SimpleNotificationService-0000000000000000000000.pem`;

export function thongBaoSes(topicArn: string, suKien: Record<string, unknown>, khoaRieng: string, them: Partial<ChuaKy> = {}): ThongDiepSns {
  return kyThongDiep(
    {
      Type: "Notification",
      MessageId: randomUUID(),
      TopicArn: topicArn,
      Message: JSON.stringify(suKien),
      Timestamp: new Date().toISOString(),
      SigningCertURL: URL_CHUNG_CHI,
      ...them,
    },
    khoaRieng,
  );
}
