import net from "node:net";
import { spawnSync } from "node:child_process";
import Redis from "ioredis";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { voiTenant } from "../src/lib/db";
import { taoNguCanh, type NguCanh } from "../src/lib/api";
import { buocChoNguoiDung, type BuocGiaoDich } from "../src/lib/api-nhieu-buoc";
import { layHoSoQuyen, LoiThieuQuyen } from "../src/lib/phan-quyen";
import { capNhatCauHinh } from "../src/modules/cau-hinh/service";
import { congNgay } from "../src/modules/nhac-viec/tinh-toan";
import { MA_TAC_VU_QUET } from "../src/modules/nhac-viec/quy-tac";
import {
  chayQuetTay,
  LoiQuetHong,
  quetBenVung,
  quetTheoLich,
  xemTuDongHoa,
  xemVanHanh,
} from "../src/modules/nhac-viec/service";
import { homNayVN } from "../src/modules/crm/chung";
import { LuocDoTaoViec, taoViec } from "../src/modules/cong-viec/service";
import { hoiDap } from "../src/modules/tro-ly/service";
import { datNhaCungCapThu, type NhaCungCapAI } from "../src/modules/tro-ly/nha-cung-cap";
import { guiThuKiemTraKetNoi, luuKetNoi } from "../src/modules/email/ket-noi";
import { LuocDoKetNoiEmail } from "../src/modules/email/luoc-do";
import { ghiNhip } from "../src/modules/van-hanh/nhip";
import { ghiNhipSong } from "../worker/nhip";
import { seedNenMong } from "../prisma/seed/index";
import { clientChuSoHuu, dat, ketLuan } from "./thu-lib";

/**
 * Kiểm chứng "Vận hành bền vững" (0.16.1, QĐ-86 → QĐ-90) trên CSDL THẬT:
 *  - bản quét hỏng vẫn được ghi vào job_runs dù giao dịch quét đã cuộn ngược; thử lại có giãn cách;
 *    hỏng liên tiếp thì báo quản trị; lần hỏng không chiếm chỗ "một lần theo lịch mỗi ngày";
 *  - nhịp worker ghi vào PostgreSQL kể cả khi Redis hỏng; healthcheck đọc được; RLS chặn giả sao lưu;
 *  - trợ lý AI: mô hình chậm không giữ giao dịch CSDL nào, hết hạn báo lỗi gọn;
 *  - gửi thư thử SMTP nằm ngoài giao dịch (máy chủ thư chậm hơn hạn 5 giây của Prisma vẫn chạy).
 */

if (process.env.NODE_ENV === "production" && !process.env.CHO_PHEP_THU_TREN_MAY_THAT) {
  console.error("Bài thử này ghi dữ liệu thử vĩnh viễn. Không chạy trên môi trường thật.");
  process.exit(1);
}

const chu = clientChuSoHuu();
// Client bằng vai ỨNG DỤNG (cowork_app) — như worker thật, để RLS và quyền bảng có hiệu lực.
const ungDung = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const DAU = Date.now().toString(36);
const ngu = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function voi<T>(tenantId: string, userId: string, viec: (nc: NguCanh) => Promise<T>): Promise<T> {
  return voiTenant(tenantId, async (tx) => {
    const hoSo = await layHoSoQuyen(tx, userId);
    if (!hoSo) throw new Error(`Không đọc được hồ sơ quyền của ${userId}`);
    return viec(taoNguCanh(tx, tenantId, hoSo, "127.0.0.1", "thu-van-hanh"));
  });
}

/** Như route thật (`xuLyApiNhieuBuoc`): mỗi bước một giao dịch ngắn riêng. */
function buoc(tenantId: string, userId: string): BuocGiaoDich {
  return buocChoNguoiDung(
    tenantId,
    async (tx) => {
      const h = await layHoSoQuyen(tx, userId);
      if (!h) throw new Error(`Không đọc được hồ sơ quyền của ${userId}`);
      return h;
    },
    "127.0.0.1",
    "thu-van-hanh",
  );
}

/** Số kết nối của vai ứng dụng đang "idle in transaction" — tức đang giữ một giao dịch mở. */
async function soGiaoDichDangMo(): Promise<number> {
  const r = await ungDung.$queryRaw<{ n: bigint }[]>`
    SELECT count(*) AS n FROM pg_stat_activity
    WHERE usename = current_user AND datname = current_database() AND state LIKE 'idle in transaction%'`;
  return Number(r[0]?.n ?? 0);
}

async function main() {
  console.log("=== Thử Vận hành bền vững (0.16.1) ===\n");
  const tenant = await seedNenMong(chu, `thu-vh-${DAU}`, "Doanh nghiệp thử vận hành");
  const T = tenant.id;
  const vaiTro = async (code: string) => (await chu.role.findUniqueOrThrow({ where: { tenantId_code: { tenantId: T, code } } })).id;
  const nguoi = async (ten: string, vai: string) =>
    (
      await chu.user.create({
        data: {
          tenantId: T,
          email: `${ten}.${DAU}@thu.test`,
          passwordHash: "x",
          fullName: ten,
          userRoles: { create: { tenantId: T, roleId: await vaiTro(vai) } },
          staffProfile: { create: { tenantId: T } },
        },
      })
    ).id;
  const gd = await nguoi("giam-doc", "ceo");
  const nv = await nguoi("nhan-vien", "sales");

  // ------------------------------------------------------------------
  console.log("— QĐ-86: bản quét hỏng được ghi bằng giao dịch riêng —");
  const homNay = homNayVN();
  const NGAY_HONG = congNgay(homNay, -40);
  // Một việc quá hạn để bản quét có việc thật để ghi.
  await voi(T, nv, (nc) =>
    taoViec(nc, LuocDoTaoViec.parse({ tieuDe: `Gọi lại ${DAU}`, han: `${congNgay(homNay, -2)}T09:00:00+07:00`, nguoiPhuTrachId: nv })),
  );

  let loi1: unknown = null;
  try {
    // Hạn giao dịch 1 ms = giả lập đúng lỗi cũ (bản quét vượt hạn 5 giây của Prisma).
    await quetBenVung(T, { ngay: NGAY_HONG, trigger: "lich", hanGiaoDichMs: 1 });
  } catch (e) {
    loi1 = e;
  }
  dat("Bản quét quá hạn giao dịch ném LoiQuetHong (503, mã quet-hong)", loi1 instanceof LoiQuetHong && loi1.status === 503 && loi1.ma === "quet-hong", String(loi1));
  const hong1 = await chu.jobRun.findMany({ where: { tenantId: T, forDate: new Date(`${NGAY_HONG}T00:00:00Z`) } });
  dat(
    "job_runs có MỘT dòng 'hong' (kèm lỗi, giờ kết thúc) dù giao dịch quét đã cuộn ngược",
    hong1.length === 1 && hong1[0].status === "hong" && Boolean(hong1[0].error) && hong1[0].finishedAt !== null && hong1[0].trigger === "lich",
    JSON.stringify(hong1.map((r) => [r.status, r.error])),
  );
  dat("Giao dịch quét cuộn ngược hết: không có việc nào của ngày đó", (await chu.dailyActionItem.count({ where: { tenantId: T, forDate: new Date(`${NGAY_HONG}T00:00:00Z`) } })) === 0);
  dat("Hỏng 1 lần chưa báo ai (ngưỡng 2 lần liên tiếp)", (await chu.notification.count({ where: { tenantId: T, type: "he-thong-quet-hong" } })) === 0);

  await quetBenVung(T, { ngay: NGAY_HONG, trigger: "lich", hanGiaoDichMs: 1 }).catch(() => {});
  const bao2 = await chu.notification.findMany({ where: { tenantId: T, type: "he-thong-quet-hong" } });
  dat("Hỏng 2 lần liên tiếp → báo Giám đốc (người có setting.update)", bao2.some((b) => b.userId === gd) && !bao2.some((b) => b.userId === nv), JSON.stringify(bao2.map((b) => b.title)));
  await quetBenVung(T, { ngay: NGAY_HONG, trigger: "lich", hanGiaoDichMs: 1 }).catch(() => {});
  dat(
    "Hỏng lần 3 cùng ngày không rung chuông thêm (chống trùng theo ngày)",
    (await chu.notification.count({ where: { tenantId: T, type: "he-thong-quet-hong", userId: gd } })) === 1,
  );

  // ------------------------------------------------------------------
  console.log("\n— Giãn cách thử lại theo lịch —");
  await voi(T, gd, (nc) => capNhatCauHinh(nc, { giaTri: { "tu_dong.gio_quet_hang_ngay": 7 } }));
  const bayGio = new Date();
  const kqCho = await quetTheoLich(T, 23, { ngay: NGAY_HONG, bayGio, hanGiaoDichMs: 1 });
  dat("Vừa hỏng 3 lần → worker CHỜ, không quét lại mỗi phút", kqCho.trangThai === "cho-thu-lai", JSON.stringify(kqCho));
  const truocCho = await chu.jobRun.count({ where: { tenantId: T, jobCode: MA_TAC_VU_QUET } });
  dat("Lúc chờ không sinh thêm dòng job_runs", truocCho === 3, String(truocCho));
  const kqSau = await quetTheoLich(T, 23, { ngay: NGAY_HONG, bayGio: new Date(bayGio.getTime() + 61 * 60_000), hanGiaoDichMs: 1 });
  dat("Qua giãn cách (60 phút sau lần hỏng thứ 3) thì thử lại — và hỏng lần 4 được ghi", kqSau.trangThai === "hong");
  await quetTheoLich(T, 23, { ngay: NGAY_HONG, bayGio: new Date(bayGio.getTime() + 300 * 60_000), hanGiaoDichMs: 1 });
  const soHong = await chu.jobRun.count({ where: { tenantId: T, forDate: new Date(`${NGAY_HONG}T00:00:00Z`), status: "hong" } });
  dat("Đủ 5 lần hỏng trong ngày", soHong === 5, String(soHong));
  const kqHet = await quetTheoLich(T, 23, { ngay: NGAY_HONG, bayGio: new Date(bayGio.getTime() + 24 * 3_600_000), hanGiaoDichMs: 1 });
  dat("Hết lượt (5 lần/ngày) → ngừng tự thử lại", kqHet.trangThai === "cho-thu-lai" && /ngừng/.test(kqHet.lyDo), JSON.stringify(kqHet));
  dat(
    "Hết lượt → báo mức KHẨN cho Giám đốc",
    (await chu.notification.count({ where: { tenantId: T, userId: gd, severity: "khan", dedupeKey: `quet-hong-het-luot:${NGAY_HONG}` } })) === 1,
  );
  dat("Chưa tới giờ quét thì không làm gì", (await quetTheoLich(T, 3, { ngay: congNgay(homNay, -41) })).trangThai === "chua-toi-gio");

  const vh = await voi(T, gd, (nc) => xemVanHanh(nc));
  dat("Màn hình quản trị thấy bản quét hỏng 5 lần liên tiếp kèm câu lỗi", vh.quet.hongLienTiep === 5 && Boolean(vh.quet.loiCuoi), JSON.stringify(vh.quet));
  await datNemLoiQuyen("Nhân viên không xem được tình trạng vận hành", () => voi(T, nv, (nc) => xemVanHanh(nc)));

  // Lần hỏng KHÔNG chiếm chỗ "một lần theo lịch mỗi ngày": quét lại cùng ngày, hạn bình thường → xong.
  const ok = await quetBenVung(T, { ngay: NGAY_HONG, trigger: "lich" });
  dat("Sau 5 lần hỏng, bản quét theo lịch cùng ngày vẫn chạy XONG (chỉ mục mới bỏ qua dòng hỏng)", ok.soQuyTacChay > 0 && ok.soViec >= 1, JSON.stringify(ok));
  dat("Đã xong thì worker coi là đã quét", (await quetTheoLich(T, 23, { ngay: NGAY_HONG })).trangThai === "da-quet");
  let trung: unknown = null;
  await quetBenVung(T, { ngay: NGAY_HONG, trigger: "lich" }).catch((e) => (trung = e));
  dat("Lần theo lịch thứ hai trong ngày vẫn bị CSDL chặn (không ghi thành 'hỏng')", (trung as Error | null)?.name === "LoiQuetDaCoLanKhac", String(trung));
  dat(
    "…và không thêm dòng hỏng nào",
    (await chu.jobRun.count({ where: { tenantId: T, forDate: new Date(`${NGAY_HONG}T00:00:00Z`), status: "hong" } })) === 5,
  );
  dat("Chuỗi hỏng liên tiếp về 0 sau lần thành công", (await voi(T, gd, (nc) => xemVanHanh(nc))).quet.hongLienTiep === 0);

  // createMany + skipDuplicates: chạy tay lại cùng ngày không nhân đôi việc.
  const tay1 = await chayQuetTay(buoc(T, gd));
  const tay2 = await chayQuetTay(buoc(T, gd));
  dat("Chạy quét tay qua nhiều bước: lần 1 sinh việc, lần 2 không nhân đôi", tay1.soViec >= 1 && tay2.soViec === 0, `${tay1.soViec}/${tay2.soViec}`);
  dat("Chạy tay ghi nhật ký kiểm toán", (await chu.auditLog.count({ where: { tenantId: T, objectType: "job_run", objectId: tay2.jobRunId } })) === 1);
  let loiTay: unknown = null;
  await chayQuetTay(buoc(T, gd), { hanGiaoDichMs: 1 }).catch((e) => (loiTay = e));
  const dongTay = await chu.jobRun.findFirst({ where: { tenantId: T, trigger: "tay", status: "hong" }, orderBy: { startedAt: "desc" } });
  dat("Chạy tay hỏng → LoiQuetHong, dòng 'hong' ghi kèm người bấm", loiTay instanceof LoiQuetHong && dongTay?.startedBy === gd, String(loiTay));
  await datNemLoiQuyen("Nhân viên không chạy được bản quét tay (nhiều bước)", () => chayQuetTay(buoc(T, nv)));

  // ------------------------------------------------------------------
  console.log("\n— QĐ-87: nhịp worker vào PostgreSQL, Redis hỏng không ảnh hưởng —");
  const redisHong = new Redis("redis://127.0.0.1:1", { maxRetriesPerRequest: 3, connectTimeout: 300 });
  redisHong.on("error", () => {});
  const truoc = Date.now();
  const nhip = await ghiNhipSong(ungDung, redisHong, { thu: DAU });
  redisHong.disconnect();
  dat("Redis sai địa chỉ: nhịp VẪN ghi vào PostgreSQL (vai cowork_app)", nhip.pg && nhip.redis === false, JSON.stringify(nhip));
  dat("…và không treo nhịp quá 3 giây", Date.now() - truoc < 3_000, `${Date.now() - truoc} ms`);
  const dongNhip = await chu.systemHeartbeat.findUnique({ where: { name: "worker" } });
  dat(
    "Dòng 'worker' mới ghi, đúng thông tin",
    dongNhip !== null && Date.now() - dongNhip.lastAt.getTime() < 10_000 && (dongNhip.info as { thu?: string }).thu === DAU,
  );
  if (process.env.REDIS_URL) {
    const redisTot = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 1 });
    redisTot.on("error", () => {});
    const n2 = await ghiNhipSong(ungDung, redisTot, { thu: DAU });
    redisTot.disconnect();
    dat("Redis chạy: ghi cả hai nơi", n2.pg && n2.redis === true, JSON.stringify(n2));
  }
  let chanGia = false;
  try {
    await ghiNhip(ungDung, "sao-luu", { gia: true });
  } catch {
    chanGia = true;
  }
  dat("RLS: ứng dụng KHÔNG ghi được dòng 'sao-luu' (chỉ script sao lưu bằng vai chủ sở hữu)", chanGia);

  const song = spawnSync("node_modules/.bin/tsx", ["worker/kiem-tra-song.ts"], { env: process.env, encoding: "utf8" });
  dat("Healthcheck worker/kiem-tra-song.ts: nhịp mới → mã thoát 0", song.status === 0, song.stdout + song.stderr);
  await chu.systemHeartbeat.update({ where: { name: "worker" }, data: { lastAt: new Date(Date.now() - 10 * 60_000) } });
  const tre = spawnSync("node_modules/.bin/tsx", ["worker/kiem-tra-song.ts"], { env: process.env, encoding: "utf8" });
  dat("Healthcheck: nhịp cũ 10 phút → mã thoát 1", tre.status === 1, tre.stdout + tre.stderr);
  const kqTd = await voi(T, gd, (nc) => xemTuDongHoa(nc));
  dat("Màn hình Tự động hóa thấy worker 'tre'", kqTd.vanHanh.worker.trangThai === "tre");
  const { GET: khoe } = await import("../src/app/api/khoe/route");
  const tlKhoe = (await (await khoe()).json()) as Record<string, unknown>;
  dat(
    "/api/khoe công khai chỉ nói worker 'tre', không lộ thời điểm / chi tiết",
    tlKhoe.ok === true && tlKhoe.worker === "tre" && Object.keys(tlKhoe).sort().join(",") === "db,luc,ok,worker",
    JSON.stringify(tlKhoe),
  );
  await ghiNhipSong(ungDung, null, { thu: DAU });
  const tlKhoe2 = (await (await khoe()).json()) as Record<string, unknown>;
  dat("/api/khoe: nhịp mới → worker 'ok'", tlKhoe2.worker === "ok", JSON.stringify(tlKhoe2));

  // ------------------------------------------------------------------
  console.log("\n— QĐ-89: trợ lý AI — mô hình chậm không giữ giao dịch CSDL —");
  const fetchGoc = globalThis.fetch;
  const envGoc = { k: process.env.ANTHROPIC_API_KEY, p: process.env.AI_PROVIDER, h: process.env.AI_HAN_GOI_GIAY };
  process.env.ANTHROPIC_API_KEY = "khoa-thu-khong-that";
  process.env.AI_PROVIDER = "anthropic";
  process.env.AI_HAN_GOI_GIAY = "0.5";
  datNhaCungCapThu(null); // dùng nhà cung cấp Anthropic THẬT, chỉ thay fetch
  const quanSat: { giaoDichMo: number; cauHoiDaGhi: boolean } = { giaoDichMo: -1, cauHoiDaGhi: false };
  globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
    // Lúc mô hình "đang nghĩ": câu hỏi phải đã COMMIT, và vai ứng dụng không giữ giao dịch nào.
    quanSat.giaoDichMo = await soGiaoDichDangMo();
    quanSat.cauHoiDaGhi = (await chu.aiMessage.count({ where: { tenantId: T, role: "nguoi-dung", content: `Câu hỏi chậm ${DAU}` } })) === 1;
    return new Promise((_, tuChoi) => {
      const s = init?.signal;
      if (!s) return; // không có hạn = treo mãi: bài thử sẽ hỏng vì quá giờ
      s.addEventListener("abort", () => tuChoi(s.reason), { once: true });
    });
  }) as typeof fetch;
  let kqAi: Awaited<ReturnType<typeof hoiDap>> | null = null;
  let loiAi: unknown = null;
  const batDauAi = Date.now();
  try {
    kqAi = await hoiDap(buoc(T, gd), { cauHoi: `Câu hỏi chậm ${DAU}` });
  } catch (e) {
    loiAi = e;
  } finally {
    globalThis.fetch = fetchGoc;
  }
  dat("Trong lúc chờ mô hình: KHÔNG có giao dịch nào của ứng dụng đang mở", quanSat.giaoDichMo === 0, String(quanSat.giaoDichMo));
  dat("Trong lúc chờ mô hình: câu hỏi đã được ghi (bước 1 đã commit)", quanSat.cauHoiDaGhi);
  dat("Mô hình treo → hết hạn sau ~0,5 giây, không ném lỗi 500", kqAi !== null && loiAi === null && Date.now() - batDauAi < 5_000, String(loiAi));
  dat("Lỗi báo gọn: 'Mô hình không trả lời trong … giây'", Boolean(kqAi?.loi && /không trả lời trong/.test(kqAi.loi)), kqAi?.loi ?? "");
  const tinLoi = await chu.aiMessage.findFirst({ where: { tenantId: T, role: "tro-ly", conversationId: kqAi?.hoiThoaiId ?? "" } });
  dat("Lượt trả lời ghi lỗi vào CSDL (bước cuối), không bịa câu trả lời", Boolean(tinLoi?.error) && /chưa gọi được mô hình/.test(tinLoi?.content ?? ""), JSON.stringify(tinLoi));
  process.env.ANTHROPIC_API_KEY = envGoc.k ?? "";
  if (envGoc.k === undefined) delete process.env.ANTHROPIC_API_KEY;
  if (envGoc.p === undefined) delete process.env.AI_PROVIDER;
  else process.env.AI_PROVIDER = envGoc.p;
  if (envGoc.h === undefined) delete process.env.AI_HAN_GOI_GIAY;
  else process.env.AI_HAN_GOI_GIAY = envGoc.h;

  // Công cụ chạy trong giao dịch ngắn riêng, vẫn với quyền của người hỏi.
  const kichBan: NhaCungCapAI = (() => {
    let lan = 0;
    return {
      ten: "kich-ban",
      model: "kich-ban",
      async goi() {
        lan += 1;
        if (lan === 1) {
          return { khoi: [{ loai: "goi-cong-cu", id: "g1", ten: "tim_khach_hang", thamSo: { tuKhoa: "khong-co" } }], doiCongCu: true, tokensIn: 1, tokensOut: 1, model: "kich-ban" };
        }
        await ngu(5_500); // lâu hơn hạn 5 giây của Prisma — trước 0.16.1 sẽ hỏng "Transaction already closed"
        return { khoi: [{ loai: "van-ban", noiDung: "Không thấy khách nào." }], doiCongCu: false, tokensIn: 1, tokensOut: 1, model: "kich-ban" };
      },
    };
  })();
  datNhaCungCapThu(kichBan);
  const kqCc = await hoiDap(buoc(T, gd), { cauHoi: "Tìm khách giúp tôi" });
  datNhaCungCapThu(null);
  dat(
    "Mô hình nghĩ 5,5 giây giữa hai vòng (quá hạn giao dịch mặc định) vẫn trả lời được, công cụ chạy ok",
    kqCc.traLoi === "Không thấy khách nào." && kqCc.congCuDaGoi[0]?.ketCuc === "ok" && kqCc.loi === null,
    JSON.stringify(kqCc),
  );

  // ------------------------------------------------------------------
  console.log("\n— QĐ-89: gửi thư thử SMTP ngoài giao dịch —");
  if (!process.env.APP_ENC_KEY) {
    console.log("  (bỏ qua — thiếu APP_ENC_KEY)");
  } else {
    const smtp = await mayChuSmtpCham(6_000);
    await voi(T, gd, (nc) =>
      luuKetNoi(nc, LuocDoKetNoiEmail.parse({ host: "127.0.0.1", port: smtp.cong, baoMat: "none", xoaMatKhau: true, tenNguoiGui: "TGTH", emailNguoiGui: "noreply@tgth.test" })),
    );
    let moTrongLucCho = -1;
    smtp.khiChao = async () => {
      moTrongLucCho = await soGiaoDichDangMo();
    };
    const kqThu = await guiThuKiemTraKetNoi(buoc(T, gd));
    smtp.dong();
    dat("Máy chủ thư chậm 6 giây (> hạn 5 giây của Prisma): gửi thư thử vẫn thành công", kqThu.ok, JSON.stringify(kqThu));
    dat("Trong lúc chờ SMTP: không giao dịch nào đang mở", moTrongLucCho === 0, String(moTrongLucCho));
    dat("Kết quả lần thử ghi ở bước sau", (await chu.emailSetting.findFirstOrThrow({ where: { tenantId: T } })).lastTestOk === true);
  }

  await ungDung.$disconnect();
  await chu.$disconnect();
  ketLuan("Vận hành bền vững");
}

async function datNemLoiQuyen(ten: string, khoi: () => Promise<unknown>) {
  try {
    await khoi();
    dat(ten, false, "không ném lỗi");
  } catch (e) {
    dat(ten, e instanceof LoiThieuQuyen, String(e));
  }
}

/** Máy chủ SMTP giả: chờ `treMs` rồi mới chào (giả máy chủ thư chậm), sau đó nhận thư bình thường. */
function mayChuSmtpCham(treMs: number): Promise<{ cong: number; dong: () => void; khiChao: (() => Promise<void>) | null }> {
  return new Promise((ok) => {
    const ra = { cong: 0, dong: () => {}, khiChao: null as (() => Promise<void>) | null };
    const s = net.createServer((sock) => {
      const gui = (x: string) => sock.write(`${x}\r\n`);
      let dem = "";
      let trongData = false;
      sock.on("error", () => {});
      setTimeout(async () => {
        await ra.khiChao?.();
        gui("220 may-gia-cham ESMTP");
      }, treMs);
      sock.on("data", (b) => {
        dem += b.toString("utf8");
        for (;;) {
          if (trongData) {
            const ket = dem.indexOf("\r\n.\r\n");
            if (ket < 0) return;
            dem = dem.slice(ket + 5);
            trongData = false;
            gui("250 OK");
            continue;
          }
          const xd = dem.indexOf("\r\n");
          if (xd < 0) return;
          const lenh = dem.slice(0, 4).toUpperCase();
          dem = dem.slice(xd + 2);
          if (lenh === "EHLO") gui("250-may-gia\r\n250 8BITMIME");
          else if (lenh === "DATA") {
            trongData = true;
            gui("354 tiep");
          } else if (lenh === "QUIT") {
            gui("221 bye");
            sock.end();
          } else gui("250 OK");
        }
      });
    });
    s.listen(0, "127.0.0.1", () => {
      ra.cong = (s.address() as net.AddressInfo).port;
      ra.dong = () => s.close();
      ok(ra);
    });
  });
}

main().catch(async (e) => {
  console.error(e);
  process.exit(1);
});
