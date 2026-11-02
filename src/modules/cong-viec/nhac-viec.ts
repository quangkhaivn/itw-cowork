import { voiTenant } from "@/lib/db";
import { taoThongBao } from "@/modules/thong-bao/service";
import { docCauHinhDanhGia } from "@/modules/danh-gia/chung";

/**
 * Nhắc giao / duyệt việc (0.20.0) — worker gọi mỗi nhịp, mỗi doanh nghiệp một giao dịch:
 *  - DG-04: giao quá `cong_viec.han_nhan_gio` giờ mà người làm chưa Nhận / Từ chối → nhắc người giao,
 *    một lần cho mỗi lần giao (khóa chống trùng theo `assigned_at`).
 *  - DG-25: chờ duyệt ở một cấp quá `cong_viec.han_duyet_gio` giờ → nhắc người duyệt cấp đó, một lần cho
 *    mỗi (lần gửi duyệt, cấp). Mốc tính từ lần gửi duyệt / lần cấp trước duyệt.
 */
export async function quetCongViec(tenantId: string, bayGio = new Date()): Promise<{ soNhacNhan: number; soNhacDuyet: number }> {
  return voiTenant(tenantId, async (tx) => {
    const ch = await docCauHinhDanhGia(tx);
    const kq = { soNhacNhan: 0, soNhacDuyet: 0 };

    const nguongNhan = new Date(bayGio.getTime() - ch.hanNhanGio * 3_600_000);
    const chuaNhan = await tx.task.findMany({
      where: { acceptStatus: "cho-nhan", status: { in: ["mo", "dang-lam"] }, assignedAt: { lt: nguongNhan }, assignedBy: { not: null } },
      select: { id: true, title: true, assignedBy: true, assignedAt: true, owner: { select: { fullName: true } } },
      take: 500,
    });
    for (const v of chuaNhan) {
      if (!v.assignedBy) continue;
      const tao = await taoThongBao(tx, tenantId, {
        nguoiNhanId: v.assignedBy,
        loai: "viec-chua-nhan",
        mucDo: "canh-bao",
        tieuDe: `${v.owner.fullName} chưa nhận việc: ${v.title}`.slice(0, 300),
        noiDung: `Đã giao quá ${ch.hanNhanGio} giờ mà chưa bấm Nhận / Từ chối. Hỏi lại, hoặc giao cho người khác.`,
        duongDan: `/cong-viec/${v.id}`,
        doiTuong: "task",
        doiTuongId: v.id,
        khoaChongTrung: `viec-chua-nhan:${v.id}:${v.assignedAt?.getTime() ?? 0}`,
      });
      if (tao) kq.soNhacNhan += 1;
    }

    const choDuyet = await tx.$queryRaw<{ id: string; title: string; approver_id: string; round: number; level: number; tu: Date }[]>`
      SELECT t.id::text AS id, t.title, a.approver_id::text AS approver_id, t.approval_round AS round, t.approval_level::int AS level,
             COALESCE(MAX(l.created_at), t.submitted_at) AS tu
      FROM tasks t
      JOIN task_approvers a ON a.task_id = t.id AND a.level = t.approval_level
      LEFT JOIN task_approval_logs l ON l.task_id = t.id AND l.round = t.approval_round
      WHERE t.status = 'cho-duyet'
      GROUP BY t.id, t.title, a.approver_id, t.approval_round, t.approval_level, t.submitted_at
      HAVING COALESCE(MAX(l.created_at), t.submitted_at) < ${new Date(bayGio.getTime() - ch.hanDuyetGio * 3_600_000)}
      LIMIT 500`;
    for (const v of choDuyet) {
      const tao = await taoThongBao(tx, tenantId, {
        nguoiNhanId: v.approver_id,
        loai: "viec-qua-han-duyet",
        mucDo: "canh-bao",
        tieuDe: `Việc chờ bạn duyệt quá ${ch.hanDuyetGio} giờ: ${v.title}`.slice(0, 300),
        noiDung: "Duyệt kèm chấm chất lượng, hoặc trả lại kèm lý do để người làm sửa.",
        duongDan: `/cong-viec/${v.id}`,
        doiTuong: "task",
        doiTuongId: v.id,
        khoaChongTrung: `viec-qua-han-duyet:${v.id}:${v.round}:${v.level}`,
      });
      if (tao) kq.soNhacDuyet += 1;
    }
    return kq;
  });
}
