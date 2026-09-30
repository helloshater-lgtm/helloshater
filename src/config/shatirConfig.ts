/**
 * Central Configuration for Shatir Classes (شاطر كلاسيز)
 * All administrative WhatsApp coordination and platform rules reside here.
 */

// If environment variable is provided, use it. Otherwise, default is empty to trigger notice.
const RAW_ADMIN_WHATSAPP = (import.meta?.env?.VITE_SHATIR_WHATSAPP_NUMBER as string | undefined)?.trim();

export const SHATIR_CONFIG = {
  platformName: 'شاطر كلاسيز',
  platformEnglishName: 'Shatir Classes',
  tagline: 'منصة أولياء الأمور لاختيار المعلمين الخصوصيين المعتمدين',
  
  // Central WhatsApp number for Shatir Administration
  adminWhatsAppNumber: RAW_ADMIN_WHATSAPP || '+201023456789', // Configurable test number
  isRealWhatsAppConfigured: Boolean(RAW_ADMIN_WHATSAPP),

  // Platform Guarantee & Trust messaging
  trialSession: {
    price: 0,
    priceLabel: 'مجاناً (100%)',
    regularDurationMinutes: 50,
    trialDurationMinutes: 30,
    satisfactionGuarantee: 'ضمان شاطر لراحة ولي الأمر: لم يناسب طفلك المعلم بعد الحصة التجريبية؟ نساعدك على تجربة معلم آخر مجاناً فوراً دون أي رسوم إضافية.',
    bookingNotice: 'فتح واتساب يبدأ التنسيق المباشر مع مستشار شاطر التعليمي، ولا يعني تأكيد الحجز الفوري. يتم تثبيت الموعد بموافقتك الكاملة بعد مطابقة جدولك وجدول المعلم.',
  },

  supportHoursText: 'فريق الدعم متاح عبر واتساب طوال الأسبوع',
  academicReviewHours: '24-48 ساعة',
};

export interface BookingWhatsAppPayload {
  tutorName: string;
  tutorHonorific: string;
  track: 'school' | 'quran';
  subjectName?: string;
  stageName?: string;
  gradeName?: string;
  curriculumName?: string;
  quranAgeGroupName?: string;
  quranLevelName?: string;
}

/**
 * Builds the official WhatsApp coordination URL for trial booking
 */
export function buildTrialBookingWhatsAppUrl(payload: BookingWhatsAppPayload, customNumber?: string): string {
  const number = (customNumber || SHATIR_CONFIG.adminWhatsAppNumber).replace(/[^0-9]/g, '');

  let detailsText = '';
  if (payload.track === 'school') {
    const lines: string[] = [
      `• المعلم: ${payload.tutorHonorific} ${payload.tutorName}`,
      `• المادة: ${payload.subjectName || 'غير محدد'}`,
    ];

    if (payload.stageName || payload.gradeName) {
      const stageGrade = [payload.stageName, payload.gradeName].filter(Boolean).join(' - ');
      lines.push(`• المرحلة والصف: ${stageGrade}`);
    } else {
      lines.push(`• المرحلة والصف: (سيتم تحديدها معكم أثناء التنسيق)`);
    }

    if (payload.curriculumName) {
      lines.push(`• نوع المنهج: ${payload.curriculumName}`);
    }

    detailsText = lines.join('\n');
  } else {
    const lines: string[] = [
      `• المعلم: ${payload.tutorHonorific} ${payload.tutorName}`,
      `• المسار: مسار القرآن الكريم والتأسيس`,
      `• الفئة العمرية للطفل: ${payload.quranAgeGroupName || 'سيتم تحديدها معكم أثناء التنسيق'}`,
      `• البرنامج المطلوب: ${payload.quranLevelName || 'تأسيس وحفظ القرآن الكريم'}`,
    ];
    detailsText = lines.join('\n');
  }

  const message = [
    `السلام عليكم ورحمة الله وبركاته، فريق إدارة شاطر كلاسيز 👋`,
    `أود حجز حصة تجريبية مجانية لطفلي عبر منصة شاطر مع التفاصيل التالية:`,
    ``,
    detailsText,
    ``,
    `أرجو التنسيق معي لتحديد الموعد المناسب والتواصل مع المعلم. شكراً لكم!`,
  ].join('\n');

  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}

/**
 * Builds the WhatsApp follow-up URL for teacher application review
 */
export function buildTutorFollowUpWhatsAppUrl(referenceCode: string, applicantName: string, customNumber?: string): string {
  const number = (customNumber || SHATIR_CONFIG.adminWhatsAppNumber).replace(/[^0-9]/g, '');
  const message = `مرحباً فريق شاطر كلاسيز، أود متابعة طلب الانضمام رقم ${referenceCode} المسجل باسم ${applicantName} لاستكمال المقابلة التعريفية.`;
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}
