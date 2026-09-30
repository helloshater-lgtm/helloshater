-- ==============================================================================
-- Shatir Classes (شاطر كلاسيز) - Supabase Schema & Security Test Suite
-- File: supabase/tests/001_schema_tests.sql
-- Description: Automated verification for RLS policies, role permissions, 
--              course options constraints, rating statistics, and admin privacy.
-- Execution: Run inside Supabase SQL Editor. Wrapped in ROLLBACK so it leaves no test data.
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- Setup Mock Data for Testing (Will be completely rolled back at the end)
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    v_published_tutor_id TEXT := 'test-published-tutor';
    v_draft_tutor_id TEXT := 'test-draft-tutor';
    v_course_option_id UUID;
    v_review_approved_id UUID;
    v_review_pending_id UUID;
    v_count INTEGER;
    v_rating NUMERIC(3, 2);
    v_err_occurred BOOLEAN;
BEGIN
    RAISE NOTICE '>>> بدء تشغيل حزمة اختبارات صلاحيات وعلاقات قاعدة بيانات شاطر...';

    -- 1. Insert Published Tutor (service_role context)
    INSERT INTO public.tutors (
        id, name, headline, hourly_rate_min, hourly_rate_max, is_published,
        session_duration_minutes, trial_duration_minutes
    ) VALUES (
        v_published_tutor_id, 'معلم تجريبي منشور', 'خبير تدريس', 100, 150, TRUE, 50, 30
    );

    -- 2. Insert Draft / Unpublished Tutor
    INSERT INTO public.tutors (
        id, name, headline, hourly_rate_min, hourly_rate_max, is_published,
        session_duration_minutes, trial_duration_minutes
    ) VALUES (
        v_draft_tutor_id, 'معلم مسودة غير منشور', 'قيد المراجعة', 120, 160, FALSE, 50, 30
    );

    -- 3. Insert Private info for published tutor
    INSERT INTO public.tutor_private_info (
        tutor_id, country_code, phone_number, full_legal_name, internal_notes
    ) VALUES (
        v_published_tutor_id, '+966', '555123456', 'الاسم الحقيقي السري', 'ملاحظة سرية جداً'
    );

    -- --------------------------------------------------------------------------
    -- اختبار 5: بقاء تقييم المعلم NULL عند عدم وجود مراجعات معتمدة
    -- --------------------------------------------------------------------------
    SELECT rating, reviews_count INTO v_rating, v_count
    FROM public.tutors WHERE id = v_published_tutor_id;

    IF v_rating IS NOT NULL OR v_count <> 0 THEN
        RAISE EXCEPTION 'فشل اختبار 5: يجب أن يكون تقييم المعلم الجديد NULL وعدد المراجعات 0';
    ELSE
        RAISE NOTICE '✓ نجح اختبار 5: تقييم المعلم الجديد NULL وعدد المراجعات 0 بدقة.';
    END IF;

    -- Add an approved review and verify stats update
    INSERT INTO public.tutor_reviews (
        tutor_id, reviewer_name, rating, comment, status
    ) VALUES (
        v_published_tutor_id, 'ولي أمر 1', 5, 'ممتاز جداً', 'approved'
    ) RETURNING id INTO v_review_approved_id;

    -- Add a pending review (should NOT affect stats)
    INSERT INTO public.tutor_reviews (
        tutor_id, reviewer_name, rating, comment, status
    ) VALUES (
        v_published_tutor_id, 'ولي أمر 2', 1, 'سيء لم يعتمد', 'pending_review'
    ) RETURNING id INTO v_review_pending_id;

    -- Attach admin note to review
    INSERT INTO public.tutor_review_admin_notes (review_id, admin_notes)
    VALUES (v_review_approved_id, 'تم التأكد من رقم هاتف ولي الأمر هاتفياً');

    -- Verify stats after 1 approved (rating=5.00, count=1)
    SELECT rating, reviews_count INTO v_rating, v_count
    FROM public.tutors WHERE id = v_published_tutor_id;

    IF v_rating <> 5.00 OR v_count <> 1 THEN
        RAISE EXCEPTION 'فشل حساب التقييم: المتوقع 5.00 ومراجعة واحدة، الفعلي rating=%, count=%', v_rating, v_count;
    ELSE
        RAISE NOTICE '✓ نجح اختبار احتساب التقييم: تم احتساب المراجعة المعتمدة فقط وتجاهل المعلقة.';
    END IF;

    -- --------------------------------------------------------------------------
    -- اختبار 4: رفض تركيبة تدريس غير موجودة في school_course_options
    -- --------------------------------------------------------------------------
    v_err_occurred := FALSE;
    BEGIN
        INSERT INTO public.tutor_school_offerings (tutor_id, course_option_id)
        VALUES (v_published_tutor_id, '00000000-0000-0000-0000-000000000000'::uuid);
    EXCEPTION WHEN foreign_key_violation THEN
        v_err_occurred := TRUE;
    END;

    IF NOT v_err_occurred THEN
        RAISE EXCEPTION 'فشل اختبار 4: تم قبول ربط تركيبة تدريس غير مسجلة في school_course_options!';
    ELSE
        RAISE NOTICE '✓ نجح اختبار 4: تم رفض إدخال تركيبة تدريس غير مسجلة في school_course_options بموجب قيد المفتاح الأجنبي.';
    END IF;

    -- الآن نسجل تركيبة معتمدة ونربط المعلم بها بنجاح
    INSERT INTO public.school_course_options (grade_id, subject_id, curriculum_id, is_active)
    VALUES ('elem_4', 'math', 'national_arabic', TRUE)
    RETURNING id INTO v_course_option_id;

    INSERT INTO public.tutor_school_offerings (tutor_id, course_option_id)
    VALUES (v_published_tutor_id, v_course_option_id);

    -- تحقق من استنتاج المرحلة من الصف عبر الـ View المساعد
    SELECT COUNT(*) INTO v_count
    FROM public.v_tutor_school_offerings
    WHERE tutor_id = v_published_tutor_id AND stage_id = 'elementary';

    IF v_count <> 1 THEN
        RAISE EXCEPTION 'فشل استنتاج المرحلة من الصف عبر v_tutor_school_offerings!';
    ELSE
        RAISE NOTICE '✓ نجح استنتاج المرحلة: تم استنتاج المرحلة الابتدائية تلقائياً من الصف الرابع.';
    END IF;

    -- --------------------------------------------------------------------------
    -- اختبار 1: إخفاء المعلمين غير المنشورين والتقييمات غير المعتمدة للزائر (anon)
    -- --------------------------------------------------------------------------
    -- محاكاة دور الزائر العام anon
    SET LOCAL ROLE anon;

    -- 1.1 المعلم غير المنشور يجب ألا يظهر مطلقاً
    SELECT COUNT(*) INTO v_count FROM public.tutors WHERE id = v_draft_tutor_id;
    IF v_count <> 0 THEN
        RAISE EXCEPTION 'فشل اختبار 1: الزائر يستطيع رؤية المعلم غير المنشور!';
    END IF;

    -- 1.2 المعلم المنشور يجب أن يظهر
    SELECT COUNT(*) INTO v_count FROM public.tutors WHERE id = v_published_tutor_id;
    IF v_count <> 1 THEN
        RAISE EXCEPTION 'فشل اختبار 1: الزائر لا يستطيع رؤية المعلم المنشور!';
    END IF;

    -- 1.3 المراجعة غير المعتمدة يجب ألا تظهر للزائر
    SELECT COUNT(*) INTO v_count FROM public.tutor_reviews WHERE id = v_review_pending_id;
    IF v_count <> 0 THEN
        RAISE EXCEPTION 'فشل اختبار 1: الزائر يستطيع رؤية مراجعة قيد التدقيق (غير معتمدة)!';
    END IF;

    -- 1.4 المراجعة المعتمدة يجب أن تظهر
    SELECT COUNT(*) INTO v_count FROM public.tutor_reviews WHERE id = v_review_approved_id;
    IF v_count <> 1 THEN
        RAISE EXCEPTION 'فشل اختبار 1: الزائر لم يستطع رؤية المراجعة المعتمدة!';
    END IF;
    RAISE NOTICE '✓ نجح اختبار 1: تم حجب المعلم غير المنشور والمراجعات المعلقة بنجاح تام عن الزائر.';

    -- --------------------------------------------------------------------------
    -- اختبار 2: منع قراءة البيانات الخاصة وملاحظات الإدارة وطلبات الانضمام
    -- --------------------------------------------------------------------------
    -- 2.1 محاولة قراءة بيانات المعلم الخاصة
    v_err_occurred := FALSE;
    BEGIN
        PERFORM * FROM public.tutor_private_info;
    EXCEPTION WHEN insufficient_privilege THEN
        v_err_occurred := TRUE;
    END;
    IF NOT v_err_occurred THEN
        RAISE EXCEPTION 'فشل اختبار 2: الزائر يستطيع الاستعلام من tutor_private_info!';
    END IF;

    -- 2.2 محاولة قراءة ملاحظات الإدارة على المراجعات
    v_err_occurred := FALSE;
    BEGIN
        PERFORM * FROM public.tutor_review_admin_notes;
    EXCEPTION WHEN insufficient_privilege THEN
        v_err_occurred := TRUE;
    END;
    IF NOT v_err_occurred THEN
        RAISE EXCEPTION 'فشل اختبار 2: الزائر يستطيع الاستعلام من tutor_review_admin_notes!';
    END IF;

    -- 2.3 محاولة قراءة طلبات الانضمام
    v_err_occurred := FALSE;
    BEGIN
        PERFORM * FROM public.tutor_applications;
    EXCEPTION WHEN insufficient_privilege THEN
        v_err_occurred := TRUE;
    END;
    IF NOT v_err_occurred THEN
        RAISE EXCEPTION 'فشل اختبار 2: الزائر يستطيع الاستعلام من tutor_applications!';
    END IF;
    RAISE NOTICE '✓ نجح اختبار 2: تم حظر قراءة البيانات الخاصة وملاحظات الإدارة وطلبات الانضمام تماماً (Permission Denied).';

    -- --------------------------------------------------------------------------
    -- اختبار 3: منع الزائر من الكتابة في الجداول
    -- --------------------------------------------------------------------------
    v_err_occurred := FALSE;
    BEGIN
        INSERT INTO public.tutors (id, name, headline, hourly_rate_min, hourly_rate_max)
        VALUES ('hacked-tutor', 'مخترق', 'تعديل غير مسموح', 10, 20);
    EXCEPTION WHEN insufficient_privilege THEN
        v_err_occurred := TRUE;
    END;
    IF NOT v_err_occurred THEN
        RAISE EXCEPTION 'فشل اختبار 3: الزائر تمكن من الإدراج في جدول tutors!';
    ELSE
        RAISE NOTICE '✓ نجح اختبار 3: تم منع الزائر من الكتابة أو الإدراج في الجداول بنجاح (Permission Denied).';
    END IF;

    -- إعادة الدور للوضع الطبيعي قبل إنهاء الاختبار
    RESET ROLE;

    RAISE NOTICE '=======================================================';
    RAISE NOTICE '✓ جميع الاختبارات الـ 5 اجتازت بنجاح وتطابق متطلبات الأمان.';
    RAISE NOTICE '=======================================================';
END;
$$;

-- التراجع عن بيانات الاختبار لضمان بقاء قاعدة البيانات نقية ونظيفة
ROLLBACK;
