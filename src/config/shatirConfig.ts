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
  
  // Central Unified WhatsApp number for Shatir Administration
  adminWhatsAppNumber: RAW_ADMIN_WHATSAPP || '201107889984',
  isRealWhatsAppConfigured: true,

  // Platform Guarantee & Trust messaging
  trialSession: {
    price: 0,
    priceLabel: 'مجاناً (100%)',
    regularDurationMinutes: 50,
    trialDurationMinutes: 20,
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
  selectedSlot?: {
    date: string;
    dayName: string;
    timeRange: string;
    timezone: string;
  };
}

export interface InterestWhatsAppPayload {
  track: 'school' | 'quran';
  stageName?: string;
  gradeName?: string;
  subjectName?: string;
  curriculumName?: string;
  quranAgeGroupName?: string;
  quranLevelName?: string;
  customNote?: string;
}

/**
 * Builds the official WhatsApp coordination URL for trial booking
 */
export function buildTrialBookingWhatsAppUrl(payload: BookingWhatsAppPayload, customNumber?: string): string {
  const number = (customNumber || SHATIR_CONFIG.adminWhatsAppNumber).replace(/[^0-9]/g, '');

  let detailsText = '';
  const lines: string[] = [
    `• المعلم المطلوب: ${payload.tutorHonorific} ${payload.tutorName}`,
  ];

  if (payload.track === 'school') {
    lines.push(`• المسار: المناهج المدرسية`);
    lines.push(`• المادة: ${payload.subjectName || 'غير محدد'}`);

    if (payload.stageName || payload.gradeName) {
      const stageGrade = [payload.stageName, payload.gradeName].filter(Boolean).join(' - ');
      lines.push(`• المرحلة والصف: ${stageGrade}`);
    } else {
      lines.push(`• المرحلة والصف: (سيتم تحديدها أثناء التنسيق)`);
    }

    if (payload.curriculumName) {
      lines.push(`• نوع المنهج: ${payload.curriculumName}`);
    }
  } else {
    lines.push(`• المسار: مسار القرآن الكريم والتأسيس`);
    lines.push(`• الفئة العمرية للطفل: ${payload.quranAgeGroupName || 'سيتم تحديدها أثناء التنسيق'}`);
    lines.push(`• البرنامج المطلوب: ${payload.quranLevelName || 'تأسيس وحفظ القرآن الكريم'}`);
  }

  // Appointment Slot Information
  if (payload.selectedSlot) {
    lines.push(`• الموعد المختار للحصة التجريبية: ${payload.selectedSlot.dayName} ${payload.selectedSlot.date} (من ${payload.selectedSlot.timeRange} - ${payload.selectedSlot.timezone})`);
    lines.push(`• ملاحظة الموعد: طلب مبدئي (يُؤكَّد الموعد بعد مراجعة طلبكم مع المعلم)`);
  } else {
    lines.push(`• الموعد: (أرجو التنسيق معي لاختيار الموعد الأنسب)`);
  }

  detailsText = lines.join('\n');

  const message = [
    `السلام عليكم ورحمة الله وبركاته، فريق إدارة شاطر كلاسيز 👋`,
    `أود حجز حصة تجريبية مجانية لطفلي عبر منصة شاطر مع التفاصيل التالية:`,
    ``,
    detailsText,
    ``,
    `تنبيه: أعلم أن فتح واتساب لا يعتبر حجزاً تلقائياً، وأنتظر تواصلكم لإتمام التأكيد والتنسيق. شكراً لكم!`,
  ].join('\n');

  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}

/**
 * Builds WhatsApp interest registration URL with current user selections
 * Used when search results are empty or school course options are pending
 */
export function buildInterestRegistrationWhatsAppUrl(payload: InterestWhatsAppPayload, customNumber?: string): string {
  const number = (customNumber || SHATIR_CONFIG.adminWhatsAppNumber).replace(/[^0-9]/g, '');

  let detailsText = '';
  if (payload.track === 'school') {
    const lines: string[] = ['• المسار: المناهج المدرسية'];
    if (payload.stageName || payload.gradeName) {
      lines.push(`• المرحلة والصف: ${[payload.stageName, payload.gradeName].filter(Boolean).join(' - ')}`);
    }
    if (payload.subjectName) {
      lines.push(`• المادة: ${payload.subjectName}`);
    }
    if (payload.curriculumName) {
      lines.push(`• نوع المنهج: ${payload.curriculumName}`);
    }
    detailsText = lines.join('\n');
  } else {
    const lines: string[] = ['• المسار: مسار القرآن والتأسيس'];
    if (payload.quranAgeGroupName) {
      lines.push(`• الفئة العمرية: ${payload.quranAgeGroupName}`);
    }
    if (payload.quranLevelName) {
      lines.push(`• البرنامج / المستوى: ${payload.quranLevelName}`);
    }
    detailsText = lines.join('\n');
  }

  const message = [
    `السلام عليكم ورحمة الله وبركاته، فريق شاطر كلاسيز 👋`,
    `أود تسجيل اهتمامي بالدروس ومعرفة التخصصات والمعلمين المتاحين للاختيارات التالية:`,
    ``,
    detailsText,
    ``,
    `أرجو التنسيق معي وإفادتي عند توفر معلم مناسب. شكراً لكم!`,
  ].join('\n');

  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}

/**
 * Builds the WhatsApp follow-up URL for teacher application review
 */
export function buildTutorFollowUpWhatsAppUrl(referenceCode: string, applicantName: string, customNumber?: string): string {
  const number = (customNumber || SHATIR_CONFIG.adminWhatsAppNumber).replace(/[^0-9]/g, '');
  const message = `مرحباً فريق شاطر كلاسيز، أود تقديم بيانات ومؤهلات التدريس للانضمام كمعلم عبر منصة شاطر. الاسم: ${applicantName}.`;
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}
