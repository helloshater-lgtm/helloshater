-- ==============================================================================
-- Shatir Classes (شاطر كلاسيز) - Supabase Schema & Security Test Suite: 002
-- File: supabase/tests/002_tutor_portal_security_tests.sql
-- Description: حزمة اختبارات أمنية فعلية للتحقق من صلاحيات بوابة المعلمين وقواعد RLS والقيود
-- 
-- ملاحظة هامة:
-- هذا الملف مخصص للتشغيل الفعلي داخل Supabase SQL Editor أو بيئة PostgreSQL متصلة.
-- كود الاختبار مغلف داخل معاملة BEGIN ... ROLLBACK لضمان عدم ترك أي بيانات وهمية.
-- ==============================================================================

BEGIN;

DO $$
DECLARE
    -- معرفات معلمين تجريبيين لاختبار العزل بين الحسابات
    v_tutor_alice TEXT := 'tutor_test_alice';
    v_tutor_bob   TEXT := 'tutor_test_bob';

    -- معرفات مستخدمين وهميين في auth.users
    v_user_alice UUID := '11111111-1111-4111-8111-111111111111'::UUID;
    v_user_bob   UUID := '22222222-2222-4222-8222-222222222222'::UUID;

    v_slot_alice_id UUID;
    v_slot_conflict_id UUID;
    v_draft_alice_id UUID;
    v_draft_second_id UUID;

    v_err_occurred BOOLEAN;
    v_count INTEGER;
    v_val TEXT;
BEGIN
    RAISE NOTICE '==================================================================';
    RAISE NOTICE '>>> بدء تشغيل الاختبارات الأمنية الفعلية لبوابة المعلمين (شاطر)...';
    RAISE NOTICE '==================================================================';

    -- --------------------------------------------------------------------------
    -- 0. إعداد بيانات الاختبار (Service Role Context)
    -- --------------------------------------------------------------------------
    -- 0.1 إنشاء حسابي مستخدم في auth.users
    INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, raw_user_meta_data)
    VALUES 
        (v_user_alice, 'alice@test.shater.com', 'dummy_hash_alice', NOW(), '{"name": "أليس"}'::jsonb),
        (v_user_bob,   'bob@test.shater.com',   'dummy_hash_bob',   NOW(), '{"name": "بوب"}'::jsonb)
    ON CONFLICT (id) DO NOTHING;

    -- 0.2 إدراج ملفي معلمين في public.tutors
    INSERT INTO public.tutors (id, name, headline, is_published, hourly_rate_min, hourly_rate_max, session_duration_minutes)
    VALUES 
        (v_tutor_alice, 'أ. أليس خالد', 'معلمة لغة عربية متخصصة للتأسيس', TRUE, 120, 150, 50),
        (v_tutor_bob,   'أ. بوب منصور', 'معلم رياضيات ولغات للمرحلة الابتدائية', FALSE, 130, 160, 50)
    ON CONFLICT (id) DO NOTHING;

    -- 0.3 ربط المعلمة أليس (ملزمة بتغيير كلمة المرور: must_change_password = TRUE)
    INSERT INTO public.tutor_account_links (user_id, tutor_id, is_active, must_change_password)
    VALUES (v_user_alice, v_tutor_alice, TRUE, TRUE)
    ON CONFLICT (user_id) DO UPDATE SET must_change_password = TRUE, is_active = TRUE;

    -- 0.4 ربط المعلم بوب (أتم تغيير كلمة المرور: must_change_password = FALSE)
    INSERT INTO public.tutor_account_links (user_id, tutor_id, is_active, must_change_password)
    VALUES (v_user_bob, v_tutor_bob, TRUE, FALSE)
    ON CONFLICT (user_id) DO UPDATE SET must_change_password = FALSE, is_active = TRUE;

    RAISE NOTICE '✓ تم تهيئة معطيات الاختبار لمعلمين وحسابين بنجاح.';

    -- --------------------------------------------------------------------------
    -- الاختبار 1: سحب الصلاحيات الإدارية من المستخدمين والزوار
    -- --------------------------------------------------------------------------
    SET LOCAL ROLE anon;

    -- 1.1 محاولة الزائر استدعاء دالة اعتماد المسودة
    v_err_occurred := FALSE;
    BEGIN
        PERFORM public.admin_approve_profile_draft('00000000-0000-0000-0000-000000000000'::uuid, 'ملاحظة');
    EXCEPTION WHEN insufficient_privilege THEN
        v_err_occurred := TRUE;
    END;
    IF NOT v_err_occurred THEN
        RAISE EXCEPTION 'فشل أمني: الزائر anon تمكن من تنفيذ admin_approve_profile_draft!';
    ELSE
        RAISE NOTICE '✓ نجح اختبار 1.1: تم حظر الزائر من استدعاء الدوال الإدارية (insufficient_privilege).';
    END IF;

    -- 1.2 محاولة الزائر استدعاء رفع إلزام كلمة المرور
    v_err_occurred := FALSE;
    BEGIN
        PERFORM public.admin_complete_tutor_password_change(v_user_alice);
    EXCEPTION WHEN insufficient_privilege THEN
        v_err_occurred := TRUE;
    END;
    IF NOT v_err_occurred THEN
        RAISE EXCEPTION 'فشل أمني: الزائر anon تمكن من تنفيذ admin_complete_tutor_password_change!';
    ELSE
        RAISE NOTICE '✓ نجح اختبار 1.2: تم حظر الزائر من رفع إلزام كلمة المرور إدارياً.';
    END IF;

    -- 1.3 محاولة الزائر قراءة عمود notes المحمي في tutor_available_slots
    v_err_occurred := FALSE;
    BEGIN
        EXECUTE 'SELECT notes FROM public.tutor_available_slots LIMIT 1';
    EXCEPTION WHEN insufficient_privilege THEN
        v_err_occurred := TRUE;
    END;
    IF NOT v_err_occurred THEN
        RAISE EXCEPTION 'فشل أمني: الزائر تمكن من قراءة عمود notes السري!';
    ELSE
        RAISE NOTICE '✓ نجح اختبار 1.3: حجب قراءة عمود notes عن الزائر تماماً بموجب صلاحيات الأعمدة.';
    END IF;

    -- 1.4 محاولة الزائر قراءة جدول tutor_account_links
    v_err_occurred := FALSE;
    BEGIN
        PERFORM * FROM public.tutor_account_links;
    EXCEPTION WHEN insufficient_privilege THEN
        v_err_occurred := TRUE;
    END;
    IF NOT v_err_occurred THEN
        RAISE EXCEPTION 'فشل أمني: الزائر تمكن من استعراض جدول tutor_account_links!';
    ELSE
        RAISE NOTICE '✓ نجح اختبار 1.4: حظر الزائر من قراءة جدول ربط حسابات المعلمين.';
    END IF;

    -- --------------------------------------------------------------------------
    -- الاختبار 2: محاكاة المعلمة أليس (قبل تغيير كلمة المرور: must_change_password=TRUE)
    -- --------------------------------------------------------------------------
    SET LOCAL ROLE authenticated;
    -- محاكاة المعلمة أليس عبر auth.uid()
    PERFORM set_config('request.jwt.claim.sub', v_user_alice::text, true);

    -- 2.1 محاولة المعلمة أليس تجاوز كلمة المرور المؤقتة واستدعاء دالة الإلزام الإدارية
    v_err_occurred := FALSE;
    BEGIN
        PERFORM public.admin_complete_tutor_password_change(v_user_alice);
    EXCEPTION WHEN insufficient_privilege THEN
        v_err_occurred := TRUE;
    END;
    IF NOT v_err_occurred THEN
        RAISE EXCEPTION 'فشل أمني: المعلم تمكن من استدعاء دالة رفع إلزام كلمة المرور مباشرة من المتصفح!';
    ELSE
        RAISE NOTICE '✓ نجح اختبار 2.1: منع المعلم من استدعاء admin_complete_tutor_password_change ذاتياً.';
    END IF;

    -- 2.2 محاولة إضافة موعد تجريبي قبل تغيير كلمة المرور
    v_err_occurred := FALSE;
    BEGIN
        PERFORM public.tutor_add_slot(CURRENT_DATE + 2, '10:00:00'::time, '11:00:00'::time, 'Africa/Cairo');
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE '%يجب تغيير كلمة المرور المؤقتة أولاً%' THEN
            v_err_occurred := TRUE;
        END IF;
    END;
    IF NOT v_err_occurred THEN
        RAISE EXCEPTION 'فشل أمني: تمكن المعلم من إضافة موعد قبل تغيير كلمة المرور المؤقتة!';
    ELSE
        RAISE NOTICE '✓ نجح اختبار 2.2: إلزام المعلم بتغيير كلمة المرور قبل إضافة مواعيد تجريبية.';
    END IF;

    -- 2.3 محاولة حفظ مسودة أو تعديل بيانات قبل تغيير كلمة المرور
    v_err_occurred := FALSE;
    BEGIN
        PERFORM public.tutor_save_profile_draft('عنوان تجريبي للملف الشخصي', NULL, NULL, NULL, FALSE);
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE '%يجب تغيير كلمة المرور المؤقتة أولاً%' THEN
            v_err_occurred := TRUE;
        END IF;
    END;
    IF NOT v_err_occurred THEN
        RAISE EXCEPTION 'فشل أمني: تمكن المعلم من حفظ مسودة قبل تغيير كلمة المرور المؤقتة!';
    ELSE
        RAISE NOTICE '✓ نجح اختبار 2.3: إلزام المعلم بتغيير كلمة المرور قبل حفظ أو تعديل مسودة الملف.';
    END IF;

    -- --------------------------------------------------------------------------
    -- الاختبار 3: قيام الخادم الموثوق (service_role) بتحديث كلمة المرور ورفع الإلزام
    -- --------------------------------------------------------------------------
    RESET ROLE; -- العودة إلى سياق المشرف/service_role

    PERFORM public.admin_complete_tutor_password_change(v_user_alice);

    SELECT must_change_password INTO v_err_occurred
    FROM public.tutor_account_links WHERE user_id = v_user_alice;

    IF v_err_occurred = TRUE THEN
        RAISE EXCEPTION 'فشل إداري: لم يتم رفع إلزام كلمة المرور بعد استدعاء admin_complete_tutor_password_change!';
    ELSE
        RAISE NOTICE '✓ نجح اختبار 3: تم رفع إلزام كلمة المرور إدارياً بنجاح بعد التأكيد الموثوق.';
    END IF;

    -- --------------------------------------------------------------------------
    -- الاختبار 4: إضافة المواعيد وتدقيق التوقيت ومنع التداخل
    -- --------------------------------------------------------------------------
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claim.sub', v_user_alice::text, true);

    -- 4.1 إضافة موعد مستقبلي صحيح من المعلمة أليس
    v_slot_alice_id := public.tutor_add_slot(
        CURRENT_DATE + 3,
        '10:00:00'::time,
        '11:00:00'::time,
        'Africa/Cairo'
    );

    IF v_slot_alice_id IS NULL THEN
        RAISE EXCEPTION 'فشل إضافة الموعد الصحيح للمعلمة أليس!';
    ELSE
        RAISE NOTICE '✓ نجح اختبار 4.1: تمت إضافة موعد مستقبلي بنجاح بتوقيت Africa/Cairo.';
    END IF;

    -- 4.2 محاولة إضافة موعد متداخل جزئياً (10:30 إلى 11:30) في نفس اليوم
    v_err_occurred := FALSE;
    BEGIN
        PERFORM public.tutor_add_slot(
            CURRENT_DATE + 3,
            '10:30:00'::time,
            '11:30:00'::time,
            'Africa/Cairo'
        );
    EXCEPTION WHEN OTHERS THEN
        v_err_occurred := TRUE;
    END;
    IF NOT v_err_occurred THEN
        RAISE EXCEPTION 'فشل أمني: تم قبول موعد متداخل مع موعد متاح قائم!';
    ELSE
        RAISE NOTICE '✓ نجح اختبار 4.2: تم رفض الموعد المتداخل بنجاح (فحص التداخل وقيد GiST).';
    END IF;

    -- 4.3 محاولة إضافة موعد في توقيت منقضٍ في الماضي
    v_err_occurred := FALSE;
    BEGIN
        PERFORM public.tutor_add_slot(
            CURRENT_DATE - 1,
            '10:00:00'::time,
            '11:00:00'::time,
            'Africa/Cairo'
        );
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE '%في توقيت سابق أو انقضى بالفعل%' THEN
            v_err_occurred := TRUE;
        END IF;
    END;
    IF NOT v_err_occurred THEN
        RAISE EXCEPTION 'فشل أمني: تم قبول موعد في تاريخ سابق بالماضي!';
    ELSE
        RAISE NOTICE '✓ نجح اختبار 4.3: تم رفض الموعد المنقضي بمقارنة now() المباشرة.';
    END IF;

    -- --------------------------------------------------------------------------
    -- الاختبار 5: عزل المواعيد بين المعلمين وحماية الحجز المؤكد
    -- --------------------------------------------------------------------------
    -- تبديل الجلسة للمعلم بوب
    PERFORM set_config('request.jwt.claim.sub', v_user_bob::text, true);

    -- 5.1 محاولة المعلم بوب إغلاق موعد يخص المعلمة أليس
    v_err_occurred := FALSE;
    BEGIN
        PERFORM public.tutor_close_slot(v_slot_alice_id);
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE '%لا يخص حسابك%' OR SQLERRM LIKE '%غير موجود%' THEN
            v_err_occurred := TRUE;
        END IF;
    END;
    IF NOT v_err_occurred THEN
        RAISE EXCEPTION 'فشل أمني: المعلم بوب تمكن من إغلاق موعد المعلمة أليس!';
    ELSE
        RAISE NOTICE '✓ نجح اختبار 5.1: منع المعلم من التعديل على مواعيد معلم آخر.';
    END IF;

    -- 5.2 الإدارة تؤكد حجز موعد أليس ذرياً (service_role)
    RESET ROLE;
    PERFORM public.admin_confirm_slot_booking(v_slot_alice_id, 'حجز تجريبي لولي أمر الطالب عمر');

    SELECT is_booked, is_available INTO v_err_occurred, v_count
    FROM public.tutor_available_slots WHERE id = v_slot_alice_id;

    IF v_err_occurred != TRUE OR v_count != 0 THEN
        RAISE EXCEPTION 'فشل تأكيد الحجز ذرياً: المتوقع is_booked=TRUE و is_available=FALSE!';
    ELSE
        RAISE NOTICE '✓ نجح اختبار 5.2: تم تأكيد حجز الموعد ذرياً مع تحديث is_booked و is_available معاً.';
    END IF;

    -- 5.3 محاولة المعلمة أليس إغلاق الموعد بعد تأكيد حجزه من الإدارة
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claim.sub', v_user_alice::text, true);

    v_err_occurred := FALSE;
    BEGIN
        PERFORM public.tutor_close_slot(v_slot_alice_id);
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE '%لا يمكن إغلاق أو تعديل موعد تم تأكيد حجزه%' THEN
            v_err_occurred := TRUE;
        END IF;
    END;
    IF NOT v_err_occurred THEN
        RAISE EXCEPTION 'فشل أمني: تمكن المعلم من إغلاق موعد محجوز ومؤكد إدارياً!';
    ELSE
        RAISE NOTICE '✓ نجح اختبار 5.3: حماية الموعد المؤكد من الإلغاء أو التعديل من جهة المعلم.';
    END IF;

    -- --------------------------------------------------------------------------
    -- الاختبار 6: المسودات، أمان روابط الصور، وحظر التعدد المفتوح
    -- --------------------------------------------------------------------------
    -- 6.1 محاولة أليس استخدام رابط صورة يشير إلى مجلد بوب (Spoofing)
    v_err_occurred := FALSE;
    BEGIN
        PERFORM public.tutor_save_profile_draft(
            'عنوان تعريفي جديد ومميز للأستاذة أليس',
            'https://supabase.co/storage/v1/object/public/tutor-avatars-pending/' || v_tutor_bob || '/photo.jpg',
            'اقتباس مميز حول تعليم الأطفال',
            'نبذة مطولة كافية لشرح الأسلوب التعليمي والمنهج المتبع في الحصص التأسيسية',
            FALSE
        );
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE '%لا يخص مجلد هذا المعلم%' THEN
            v_err_occurred := TRUE;
        END IF;
    END;
    IF NOT v_err_occurred THEN
        RAISE EXCEPTION 'فشل أمني: تم قبول رابط صورة لمجلد معلم آخر في المسودة!';
    ELSE
        RAISE NOTICE '✓ نجح اختبار 6.1: التحقق الصارم من انتماء رابط الصورة لمجلد المعلم نفسه.';
    END IF;

    -- 6.2 أليس تحفظ مسودة صالحة وتقدمها للمراجعة
    v_draft_alice_id := public.tutor_save_profile_draft(
        'معلمة تأسيس لغة عربية وقرآن كريم للأطفال',
        'https://supabase.co/storage/v1/object/public/tutor-avatars-pending/' || v_tutor_alice || '/avatar_123.jpg',
        'التعليم بالحب والصبر يصنع المعجزات',
        'نبذة تفصيلية تشرح تبسيط مخارج الحروف وقواعد القراءة خطوة بخطوة بالتشجيع والتحفيز المستمر للأطفال الصغار',
        TRUE -- submit for review
    );

    IF v_draft_alice_id IS NULL THEN
        RAISE EXCEPTION 'فشل حفظ وتقديم المسودة الصالحة!';
    ELSE
        RAISE NOTICE '✓ نجح اختبار 6.2: تم تقديم المسودة الصالحة للمراجعة (pending_review) بنجاح.';
    END IF;

    -- 6.3 محاولة إدراج مسودة ثانية مفتوحة لنفس المعلم في قاعدة البيانات مباشرة (انتهاك الفهرس الجزئي الفريد)
    v_err_occurred := FALSE;
    BEGIN
        INSERT INTO public.tutor_profile_drafts (
            tutor_id, headline, status
        ) VALUES (
            v_tutor_alice, 'عنوان متضارب مع المسودة السابقة', 'draft'
        );
    EXCEPTION WHEN unique_violation THEN
        v_err_occurred := TRUE;
    END;
    IF NOT v_err_occurred THEN
        RAISE EXCEPTION 'فشل قيد قاعدة البيانات: تم السماح بمسودتين مفتوحتين لنفس المعلم في آن واحد!';
    ELSE
        RAISE NOTICE '✓ نجح اختبار 6.3: منع تعدد المسودات المفتوحة بنجاح عبر الفهرس uq_tutor_open_draft.';
    END IF;

    -- 6.4 اعتماد المسودة إدارياً ونقل البيانات إلى الملف المنشور (service_role)
    RESET ROLE;
    PERFORM public.admin_approve_profile_draft(v_draft_alice_id, 'تمت المراجعة والاعتماد');

    SELECT headline, avatar_url INTO v_val, v_err_occurred
    FROM public.tutors WHERE id = v_tutor_alice;

    IF v_val != 'معلمة تأسيس لغة عربية وقرآن كريم للأطفال' THEN
        RAISE EXCEPTION 'فشل تطبيق المسودة على الملف المنشور!';
    ELSE
        RAISE NOTICE '✓ نجح اختبار 6.4: تم اعتماد المسودة وتحديث بيانات الملف المنشور بنجاح.';
    END IF;

    RAISE NOTICE '==================================================================';
    RAISE NOTICE '✓ اكتملت جميع الاختبارات الأمنية بنجاح بنسبة ١٠٠٪ دون أي ثغرة.';
    RAISE NOTICE '==================================================================';
END;
$$;

-- التراجع عن التغييرات للحفاظ على قاعدة البيانات نقية تماماً
ROLLBACK;
