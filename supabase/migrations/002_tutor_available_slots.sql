-- ==============================================================================
-- Shatir Classes (شاطر كلاسيز) - Supabase Migration: 002_tutor_available_slots.sql
-- Description: جدول مواعيد المعلمين المتاحة للحصص التجريبية بإدارة المشرفين يدويًا
-- Security: قراءة عامة مقتصرة على المواعيد المستقبلية المتاحة للمعلمين المنشورين
-- Note: هذا الملف مُعد للمراجعة والتشغيل اليدوي من قِبل المشرف عبر Supabase SQL Editor
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. Create Table: tutor_available_slots (مواعيد المعلمين المتاحة)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tutor_available_slots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tutor_id TEXT NOT NULL REFERENCES public.tutors(id) ON UPDATE CASCADE ON DELETE CASCADE,
    slot_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    timezone TEXT NOT NULL DEFAULT 'Africa/Cairo',
    is_available BOOLEAN NOT NULL DEFAULT TRUE,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_slot_time_order CHECK (end_time > start_time),
    CONSTRAINT uq_tutor_slot UNIQUE (tutor_id, slot_date, start_time)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_slots_tutor_lookup 
    ON public.tutor_available_slots(tutor_id, slot_date, start_time);

CREATE INDEX IF NOT EXISTS idx_slots_availability 
    ON public.tutor_available_slots(is_available);

-- Timestamp trigger
CREATE TRIGGER trg_tutor_slots_updated_at
BEFORE UPDATE ON public.tutor_available_slots
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();

-- Table & column comments
COMMENT ON TABLE public.tutor_available_slots IS 'مواعيد المعلمين المتاحة للحصص، تديرها إدارة شاطر يدوياً من Supabase';
COMMENT ON COLUMN public.tutor_available_slots.slot_date IS 'تاريخ الموعد المحدد (سنة-شهر-يوم)';
COMMENT ON COLUMN public.tutor_available_slots.start_time IS 'وقت بداية الموعد (ساعة:دقيقة)';
COMMENT ON COLUMN public.tutor_available_slots.end_time IS 'وقت نهاية الموعد (ساعة:دقيقة)';
COMMENT ON COLUMN public.tutor_available_slots.timezone IS 'المنطقة الزمنية للموعد (مثل: Africa/Cairo أو Asia/Riyadh)';
COMMENT ON COLUMN public.tutor_available_slots.is_available IS 'حالة توفر الموعد (صحيح = متاح للاختيار، خطأ = محجوز أو ملغي)';

-- ------------------------------------------------------------------------------
-- 2. Row Level Security (RLS)
-- ------------------------------------------------------------------------------
ALTER TABLE public.tutor_available_slots ENABLE ROW LEVEL SECURITY;

-- 2.1 Public Read Policy:
-- قراءة المواعيد العامة مقتصرة فقط على:
-- 1. المواعيد المتاحة (is_available = TRUE)
-- 2. المواعيد المستقبلية (تاريخ اليوم مع وقت قادم، أو تواريخ قادمة)
-- 3. المواعيد التابعة لمعلمين منشورين فقط (is_published = TRUE)
CREATE POLICY "Public can view future available slots of published tutors"
ON public.tutor_available_slots
FOR SELECT
TO anon, authenticated
USING (
    is_available = TRUE
    AND (
        slot_date > CURRENT_DATE 
        OR (slot_date = CURRENT_DATE AND start_time >= CURRENT_TIME)
    )
    AND EXISTS (
        SELECT 1 FROM public.tutors t
        WHERE t.id = tutor_available_slots.tutor_id
        AND t.is_published = TRUE
    )
);

-- 2.2 Admin Write Policy (service_role only):
-- لا يُسمح للزوار أو المستخدمين العاديين بتعديل أو حذف أو إضافة أي مواعيد
CREATE POLICY "Admin service_role can manage all tutor slots"
ON public.tutor_available_slots
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- ------------------------------------------------------------------------------
-- 3. Explicit Grants
-- ------------------------------------------------------------------------------
GRANT SELECT ON public.tutor_available_slots TO anon, authenticated;
GRANT ALL ON public.tutor_available_slots TO service_role;

COMMIT;
