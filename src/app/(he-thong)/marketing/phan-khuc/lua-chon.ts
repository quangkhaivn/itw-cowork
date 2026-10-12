import type { NguCanh } from "@/lib/api";
import { luaChonDuLieuGoc } from "@/modules/crm/chung";
import { luaChonChienDich } from "@/modules/marketing/chung";
import type { LuaChonPhanKhuc } from "./SuaPhanKhuc";

export async function docLuaChonPhanKhuc(nc: NguCanh): Promise<LuaChonPhanKhuc> {
  const [dg, cd] = await Promise.all([luaChonDuLieuGoc(nc, ["nguon_lead", "phan_khuc_khach_hang", "nganh_nghe", "loai_khach_hang"]), luaChonChienDich(nc)]);
  return {
    nguon: dg.nguon_lead,
    phanKhuc: dg.phan_khuc_khach_hang,
    nganh: dg.nganh_nghe,
    loaiKhach: dg.loai_khach_hang,
    chienDich: cd.map((c) => ({ ma: c.id, ten: `${c.ma} — ${c.ten}` })),
  };
}
