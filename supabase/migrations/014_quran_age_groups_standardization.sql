-- ==============================================================================
-- Shatir Classes (شاطر كلاسيز) - Supabase Migration 014
-- File: supabase/migrations/014_quran_age_groups_standardization.sql
-- Description:
--   تصحيح وتوحيد الفئات العمرية وتحسين وصف البرامج التعليمية لمسار القرآن والتأسيس:
--   1. التحقق المسبق من وجود جميع المعرّفات المستهدفة في الجداول المرجعية
--      (quran_age_groups و quran_levels) ورفع خطأ واضح إذا نقص أي معرّف لمنع
--      انتهاء التنفيذ بنجاح ظاهري دون تحديث البيانات المطلوبة.
--   2. حصر تعديل الفئات العمرية في:
--      - age_4_7: «الأطفال الصغار» — من ٤ إلى ٧ سنوات.
--      - age_8_12: «الأطفال» — من ٨ إلى ١٢ سنة.
--      - age_13_18: «اليافعون» — من ١٣ إلى ١٨ سنة.
--      مع ترك فئة age_adults بجميع بياناتها وحالة تفعيلها دون أي تعديل.
--   3. تحسين أوصاف البرامج التعليمية المعتمدة في جدول quran_levels
--      (noor_bayan, hifz_tilawa, tajweed_rules, khatt_imlaa) لشرح هدف كل برنامج
--      بوضوح مع الحفاظ الكامل على معاني البرامج المعتمدة ونطاقها وأسمائها.
--   4. عدم المساس بالسجلات التاريخية في جداول المواعيد أو المجموعات أو الحجوزات
--      أو منطق Migration 013.
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. التحقق المسبق من وجود جميع المعرّفات المستهدفة قبل التحديث
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    v_missing_age_ids TEXT[];
    v_missing_level_ids TEXT[];
BEGIN
    SELECT ARRAY(
        SELECT expected_id
        FROM unnest(ARRAY['age_4_7', 'age_8_12', 'age_13_18']::TEXT[]) AS expected_id
        WHERE NOT EXISTS (
            SELECT 1
            FROM public.quran_age_groups qag
            WHERE qag.id = expected_id
        )
    ) INTO v_missing_age_ids;

    IF COALESCE(array_length(v_missing_age_ids, 1), 0) > 0 THEN
        RAISE EXCEPTION 'تعذر تطبيق الهجرة 014: المعرّفات المستهدفة التالية غير موجودة في جدول quran_age_groups: %',
            array_to_string(v_missing_age_ids, ', ');
    END IF;

    SELECT ARRAY(
        SELECT expected_id
        FROM unnest(ARRAY['noor_bayan', 'hifz_tilawa', 'tajweed_rules', 'khatt_imlaa']::TEXT[]) AS expected_id
        WHERE NOT EXISTS (
            SELECT 1
            FROM public.quran_levels ql
            WHERE ql.id = expected_id
        )
    ) INTO v_missing_level_ids;

    IF COALESCE(array_length(v_missing_level_ids, 1), 0) > 0 THEN
        RAISE EXCEPTION 'تعذر تطبيق الهجرة 014: المعرّفات المستهدفة التالية غير موجودة في جدول quran_levels: %',
            array_to_string(v_missing_level_ids, ', ');
    END IF;
END;
$$;

-- ------------------------------------------------------------------------------
-- 2. تحديث الفئات العمرية الثلاث المعتمدة لمسار القرآن والتأسيس
--    (تُترك فئة age_adults بجميع بياناتها وحالة تفعيلها دون أي تعديل)
-- ------------------------------------------------------------------------------
UPDATE public.quran_age_groups
SET
    name = 'الأطفال الصغار',
    age_range = 'من ٤ إلى ٧ سنوات',
    display_order = 1
WHERE id = 'age_4_7';

UPDATE public.quran_age_groups
SET
    name = 'الأطفال',
    age_range = 'من ٨ إلى ١٢ سنة',
    display_order = 2
WHERE id = 'age_8_12';

UPDATE public.quran_age_groups
SET
    name = 'اليافعون',
    age_range = 'من ١٣ إلى ١٨ سنة',
    display_order = 3
WHERE id = 'age_13_18';

-- ------------------------------------------------------------------------------
-- 3. تحسين وصف البرامج التعليمية المعتمدة في جدول quran_levels
--    مع الحفاظ الكامل على المعرّفات والأسماء والنطاق المعتمد لكل برنامج
-- ------------------------------------------------------------------------------
UPDATE public.quran_levels
SET
    name = 'تأسيس نور البيان والقراءة العربية',
    description = 'تعليم الحروف العربية ومخارجها والتهجي السليم خطوة بخطوة حتى يتمكن الطفل من القراءة الصحيحة بطلاقة.',
    display_order = 1
WHERE id = 'noor_bayan';

UPDATE public.quran_levels
SET
    name = 'حفظ وتلقين القرآن الكريم ومراجعته',
    description = 'تحفيظ القرآن الكريم بالتلقين الصحيح مع المتابعة المنتظمة وتثبيت المحفوظ ومراجعته بما يناسب قدرة الطفل.',
    display_order = 2
WHERE id = 'hifz_tilawa';

UPDATE public.quran_levels
SET
    name = 'أحكام التجويد والإتقان برواية حفص',
    description = 'تعلم أحكام التجويد وتطبيقها عمليًا أثناء التلاوة لضبط مخارج الحروف والمدود وتحسين الأداء القرآني.',
    display_order = 3
WHERE id = 'tajweed_rules';

UPDATE public.quran_levels
SET
    name = 'تحسين الخط العربي وقواعد الإملاء',
    description = 'تدريب عملي لتحسين جودة الخط العربي وإتقان قواعد الإملاء والكتابة الصحيحة بثقة ودون أخطاء شائعة.',
    display_order = 4
WHERE id = 'khatt_imlaa';

COMMIT;
