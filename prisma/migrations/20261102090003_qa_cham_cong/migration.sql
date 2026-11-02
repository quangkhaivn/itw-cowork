-- 0.19.0 QA — vá lỗi phát hiện khi kiểm thử độc lập phân hệ chấm công (BUSINESS_RULES.md mục 30).

-- NS-14: số sê-ri máy chấm công DUY NHẤT TOÀN HỆ THỐNG, KHÔNG PHÂN BIỆT HOA THƯỜNG. Trước đây
-- "ABC123" (doanh nghiệp A) và "abc123" (doanh nghiệp B) cùng đăng ký được; tra cứu lại phân biệt hoa
-- thường — nên một doanh nghiệp gõ nhầm chữ thường thì máy của họ bị 401, còn doanh nghiệp khác đăng ký
-- đúng chữ hoa sẽ NHẬN dữ liệu chấm công của nhân viên doanh nghiệp kia.
-- Dữ liệu cũ đã có hai máy chỉ khác hoa thường → dừng với thông báo rõ (không tự đổi / xóa máy của ai):
-- Nhân sự kiểm SN thật trên máy, chuyển máy đăng ký sai sang "ngung-hoat-dong" và đổi SN của nó (vai chủ sở hữu).
DO $$
DECLARE
    trung text;
BEGIN
    SELECT string_agg(sn, ', ') INTO trung
      FROM (SELECT upper(serial_number) AS sn FROM attendance_devices GROUP BY 1 HAVING count(*) > 1) x;
    IF trung IS NOT NULL THEN
        RAISE EXCEPTION 'Co may cham cong trung so se-ri (chi khac hoa thuong): %. Sua du lieu truoc khi chay migration nay.', trung;
    END IF;
END $$;
CREATE UNIQUE INDEX "attendance_devices_so_seri_khong_hoa_thuong_key"
    ON "attendance_devices" (upper("serial_number"));

CREATE OR REPLACE FUNCTION public.tra_may_cham_cong(p_sn text)
RETURNS TABLE (tenant_id uuid, device_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT d.tenant_id, d.id
      FROM attendance_devices d
      JOIN tenants t ON t.id = d.tenant_id
     WHERE upper(d.serial_number) = upper(p_sn) AND d.status = 'hoat-dong' AND t.status = 'hoat-dong'
     LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.tra_may_cham_cong(text) FROM PUBLIC;
