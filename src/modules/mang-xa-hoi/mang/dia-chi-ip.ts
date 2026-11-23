import { BlockList, isIP } from "node:net";

/**
 * Dải địa chỉ KHÔNG được gọi tới khi URL do người dùng nhập (SEC-04 / chống SSRF): mạng nội bộ, loopback, link-local
 * (gồm 169.254.169.254 — metadata đám mây), CGNAT (100.100.100.200 — metadata Alibaba), dải tài liệu / thử nghiệm,
 * multicast, dành riêng; IPv6 ULA (fd00:ec2::254 — metadata AWS IPv6), link-local, IPv4 ánh xạ trong IPv6.
 */
const CHAN = new BlockList();
for (const [dia, tien] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12],
  ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.88.99.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24],
  ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
] as const) CHAN.addSubnet(dia, tien, "ipv4");
for (const [dia, tien] of [
  // QA 0.23.0 (QĐ-209): ::/96 (IPv4-compatible, gồm :: và ::1) và ::ffff:0:0:0/96 (IPv4-translated).
  ["::", 96], ["::ffff:0:0:0", 96], ["64:ff9b::", 96], ["64:ff9b:1::", 48], ["100::", 64], ["2001:db8::", 32], ["2002::", 16],
  ["fc00::", 7], ["fe80::", 10], ["fec0::", 10], ["ff00::", 8],
] as const) CHAN.addSubnet(dia, tien, "ipv6");

/** Tên máy luôn chặn dù phân giải ra đâu (metadata đám mây gọi bằng tên). */
const TEN_CHAN = new Set(["metadata.google.internal", "metadata", "metadata.azure.com", "instance-data", "instance-data.ec2.internal"]);

export function laTenMayBiChan(host: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, "");
  return TEN_CHAN.has(h) || h.endsWith(".internal") || h.endsWith(".local") || h.endsWith(".localhost");
}

/** IPv4 nằm trong IPv6 dạng ::ffff:a.b.c.d (hoặc dạng hex ::ffff:7f00:1). */
function ipv4AnhXa(ip: string): string | null {
  const m = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
  if (m) return m[1];
  const h = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(ip);
  if (h) {
    const a = Number.parseInt(h[1], 16);
    const b = Number.parseInt(h[2], 16);
    return `${a >> 8}.${a & 255}.${b >> 8}.${b & 255}`;
  }
  return null;
}

/** true = địa chỉ nội bộ / đặc biệt, KHÔNG được gọi. Chuỗi không phải IP → true (an toàn mặc định). */
export function laDiaChiNoiBo(ip: string): boolean {
  const s = ip.replace(/^\[|\]$/g, "").split("%")[0];
  const loai = isIP(s);
  if (loai === 4) return CHAN.check(s, "ipv4");
  if (loai === 6) {
    const v4 = ipv4AnhXa(s);
    if (v4) return CHAN.check(v4, "ipv4");
    return CHAN.check(s, "ipv6");
  }
  return true;
}

export function laLoopback(ip: string): boolean {
  const s = ip.replace(/^\[|\]$/g, "");
  return s === "::1" || /^127\./.test(s) || ipv4AnhXa(s)?.startsWith("127.") === true;
}
