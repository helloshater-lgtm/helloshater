/**
 * Independent Data Layer for Shatir Classes (شاطر كلاسيز)
 * Clean separation between business logic, persistence, and UI presentation.
 * Ready for drop-in Supabase integration without UI rewrites.
 */

import {
  Stage,
  Grade,
  Subject,
  CurriculumOption,
  QuranAgeGroup,
  QuranLevel,
  Tutor,
  SearchCriteria,
  TutorApplicationFormData,
  TutorApplicationRecord,
} from '../types';

export const STAGES_DATA: Stage[] = [
  {
    id: 'elementary',
    name: 'المرحلة الابتدائية',
    gradesDesc: 'الصفوف (١ - ٦ ابتدائي)',
    order: 1,
  },
  {
    id: 'preparatory',
    name: 'المرحلة الإعدادية / المتوسطة',
    gradesDesc: 'الصفوف (١ - ٣ إعدادي)',
    order: 2,
  },
  {
    id: 'secondary',
    name: 'المرحلة الثانوية',
    gradesDesc: 'الصفوف (١ - ٣ ثانوي)',
    order: 3,
  },
];

export const GRADES_DATA: Grade[] = [
  // Elementary
  { id: 'elem_1', stageId: 'elementary', name: 'الصف الأول الابتدائي', order: 1 },
  { id: 'elem_2', stageId: 'elementary', name: 'الصف الثاني الابتدائي', order: 2 },
  { id: 'elem_3', stageId: 'elementary', name: 'الصف الثالث الابتدائي', order: 3 },
  { id: 'elem_4', stageId: 'elementary', name: 'الصف الرابع الابتدائي', order: 4 },
  { id: 'elem_5', stageId: 'elementary', name: 'الصف الخامس الابتدائي', order: 5 },
  { id: 'elem_6', stageId: 'elementary', name: 'الصف السادس الابتدائي', order: 6 },
  // Prep
  { id: 'prep_1', stageId: 'preparatory', name: 'الصف الأول الإعدادي', order: 1 },
  { id: 'prep_2', stageId: 'preparatory', name: 'الصف الثاني الإعدادي', order: 2 },
  { id: 'prep_3', stageId: 'preparatory', name: 'الصف الثالث الإعدادي', order: 3 },
  // Secondary
  { id: 'sec_1', stageId: 'secondary', name: 'الصف الأول الثانوي', order: 1 },
  { id: 'sec_2', stageId: 'secondary', name: 'الصف الثاني الثانوي', order: 2 },
  { id: 'sec_3', stageId: 'secondary', name: 'الصف الثالث الثانوي', order: 3 },
];

export const CURRICULUM_OPTIONS: CurriculumOption[] = [
  {
    id: 'national_arabic',
    name: 'عربي (حكومي / أهلي)',
    description: 'المنهج الوزاري العام والمدارس الحكومية والأهلية باللغة العربية',
  },
  {
    id: 'languages_experimental',
    name: 'لغات / تجريبي (Languages)',
    description: 'مدارس اللغات والمدارس التجريبية الرسمية والمتميزة',
  },
  {
    id: 'international',
    name: 'مناهج دولية (IGCSE / SAT)',
    description: 'النظام البريطاني والأمريكي والبرامج الدولية',
  },
];

export const SUBJECTS_DATA: Subject[] = [
  { id: 'math', name: 'الرياضيات (Math)', englishName: 'Mathematics', category: 'core' },
  { id: 'science', name: 'العلوم (Science)', englishName: 'General Science', category: 'sciences' },
  { id: 'physics', name: 'الفيزياء (Physics)', englishName: 'Physics', category: 'sciences' },
  { id: 'chemistry', name: 'الكيمياء (Chemistry)', englishName: 'Chemistry', category: 'sciences' },
  { id: 'biology', name: 'الأحياء (Biology)', englishName: 'Biology', category: 'sciences' },
  { id: 'english', name: 'اللغة الإنجليزية', englishName: 'English Language', category: 'languages' },
  { id: 'arabic', name: 'اللغة العربية', englishName: 'Arabic Language', category: 'languages' },
  { id: 'social', name: 'الدراسات الاجتماعية', englishName: 'Social Studies', category: 'social' },
];

export const QURAN_AGE_GROUPS: QuranAgeGroup[] = [
  { id: 'age_4_7', name: 'أطفال وبراعم', ageRange: '٤ - ٧ سنوات' },
  { id: 'age_8_12', name: 'ناشئة وطلاب', ageRange: '٨ - ١٢ سنة' },
  { id: 'age_13_18', name: 'يافعون وشباب', ageRange: '١٣ - ١٨ سنة' },
  { id: 'age_adults', name: 'كبار ومحو أمية', ageRange: '١٩ سنة فما فوق' },
];

export const QURAN_LEVELS: QuranLevel[] = [
  {
    id: 'noor_bayan',
    name: 'تأسيس نور البيان والقراءة العربية',
    description: 'تعليم مخارج الحروف والتهجي السليم من الصفر وتحسين نطق الكلمات',
  },
  {
    id: 'hifz_tilawa',
    name: 'حفظ وتلقين القرآن الكريم ومراجعته',
    description: 'تحفيظ منتظم مع المتابعة المستمرة وتثبيت السور للأطفال والناشئة',
  },
  {
    id: 'tajweed_rules',
    name: 'أحكام التجويد والإتقان برواية حفص',
    description: 'دراسة وتطبيق أحكام النون والميم والمدود ومخارج وصفات الحروف',
  },
  {
    id: 'khatt_imlaa',
    name: 'تحسين الخط العربي وقواعد الإملاء',
    description: 'ضبط قواعد الكتابة الصحيحة وتفادي الأخطاء الإملائية الشائعة',
  },
];

/**
 * Curated Database of Vetted Teachers (Structured specifically to reflect the Stitch Approved Designs)
 */
export const TUTORS_DATABASE: Tutor[] = [
  // 1. أ. ندى المنشاوي - Strictly matching Image 1 & Image 3
  {
    id: 'nada-elminshawy',
    name: 'ندى المنشاوي',
    honorific: 'أ.',
    headline: 'معلمة رياضيات وباللغة الإنجليزية (Math) للمرحلة الابتدائية',
    avatarUrl: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&q=80&w=400',
    verifiedCredentials: true,
    yearsOfExperience: 7,
    experienceBadgeText: 'خبرة 7 سنوات',
    curriculumTags: ['لغات / تجريبي', 'منهج وزاري'],
    hourlyRateMin: 120,
    hourlyRateMax: 150,
    currency: 'ج.م',
    sessionDurationMinutes: 50,
    trialDurationMinutes: 30,
    rating: 4.9,
    reviewsCount: 48,
    totalStudentsTaught: 114,
    videoPreview: {
      available: true,
      title: 'فيديو تعريفي قصير: كيف أدير الحصة مع طفلك؟',
      durationText: 'دقيقة واحدة (0:58)',
      description: 'دقيقة واحدة تشرح فيها الأستاذة ندى أسلوبها التفاعلي والتطبيقي في كسر حاجز رهبة الأرقام.',
      thumbnailUrl: '',
    },
    helpChildQuote: 'الرياضيات ليست حفظاً للقوانين بل طريقة تفكير ممتعة متى ما زال خوف الطفل منها، ورسالتي هي بناء ثقة التلميذ خطوة بخطوة.',
    helpChildSummary: 'أركز على تبسيط المفاهيم الحسابية وربط الأرقام بأمثلة تفاعلية حية، مع كسر حاجز الخوف من مادة الرياضيات (Math) وتحويل المفاهيم الجافة إلى تجارب ممتعة وسهلة الاستيعاب تجعل التلميذ شريكاً فاعلاً في حل المسألة دون تلقين.',
    methodologyPillars: [
      {
        title: 'إزالة رهبة مادة الرياضيات (Math Anxiety)',
        description: 'استخدام أساليب حسية بصرية تجعل الأرقام منطقية ومألوفة لعقلية الطفل في المرحلة التأسيسية.',
        iconName: 'smile',
      },
      {
        title: 'الدعم اللغوي لمناهج اللغات والتجريبي',
        description: 'تفكيك المسائل اللفظية الإنجليزية (Word Problems) وربطها بالمفاهيم دون إرباك الترجمة الحرفية.',
        iconName: 'globe',
      },
      {
        title: 'المتابعة والتأسيس للامتحانات',
        description: 'تدريب عملي تدريجي على نماذج المهام الأدائية واختبارات الشهور بأسلوب منظم وغير ضاغط.',
        iconName: 'checklist',
      },
    ],
    targetStudentCases: [
      'الطلاب الذين يعانون من تشتت الانتباه أثناء الحل أو التردد في العمليات الحسابية',
      'تأسيس مناهج اللغات والمدارس التجريبية وتقوية استيعاب المصطلحات بالإنجليزية',
      'التحضير للامتحانات الشهرية والنهائية بثقة واطمئنان',
    ],
    subjectsTaughtSummary: [
      {
        title: 'ماث بالإنجليزية (Math)',
        gradesRange: 'الصفوف ١ - ٦ ابتدائي',
        curriculumNote: 'مدارس اللغات والمدارس التجريبية الرسمية والمتميزة',
        icon: 'math',
      },
      {
        title: 'الرياضيات باللغة العربية',
        gradesRange: 'الصفوف ٣ - ٦ ابتدائي',
        curriculumNote: 'المنهج المصري العام والمقررات التأسيسية',
        icon: 'shapes',
      },
      {
        title: 'تأسيس التفكير المنطقي والحساب الذهني',
        gradesRange: 'الصفوف ١ - ٤ ابتدائي',
        curriculumNote: 'برامج مركزة لتقوية سرعة الاستجابة الحسابية ومهارات التفكير الرياضي',
        icon: 'shapes',
      },
    ],
    whatHappensInTrial: [
      {
        stepNumber: 1,
        title: 'تقييم ودي ومريح للمستوى',
        description: 'حوار تفاعلي خفيف وتمارين بسيطة لتحديد مواطن القوة ونقاط الصعوبة في المادة دون أي توتر للطفل وبلا اختبارات رسمية تربك الطفل.',
      },
      {
        stepNumber: 2,
        title: 'تجربة الشرح التفاعلي الحي',
        description: 'شرح جزئية محددة باستخدام اللوح الذكي التفاعلي ليرى الطالب وولي الأمر أسلوب التدريس وطريقة إيصال المعلومة ومشاركة حل مسألة.',
      },
      {
        stepNumber: 3,
        title: 'مشاركة الملاحظات وخطة التحسين',
        description: 'محادثة سريعة مع ولي الأمر لتوضيح خطة العمل المناسبة والجدول الأسبوعي المقترح بكل شفافية وبدون أي إلزام بالاستمرار.',
      },
    ],
    qualifications: [
      {
        title: 'بكالوريوس التربية - قسم الرياضيات (تعليم أساسي باللغة الإنجليزية)',
        institution: 'جامعة عين شمس • تقدير عام جيد جداً مع مرتبة الشرف',
        verified: true,
        notes: 'شهادة موثقة ومطابقة بواسطة فريق شؤون المعلمين في شاطر',
      },
      {
        title: 'معلمة معتمدة لمدارس اللغات الخاصة والتجريبية',
        institution: 'أكثر من 7 سنوات في تدريس مقررات الرياضيات للصفوف الابتدائية العليا',
        verified: true,
        notes: 'خبرة مستمرة في المتابعة الفردية والجماعية للطلاب مع الإلمام التام بأسئلة ومحددات التقييم الجديدة',
      },
      {
        title: 'دورة تدريبية في صعوبات التعلم وبطء الفهم في الحساب',
        institution: 'مركز الإرشاد النفسي والتربوي',
        verified: true,
        notes: 'تدريب متخصص على مهارات استيعاب الفروق الفردية وتحفيز الثقة بالنفس لدى صغار السن',
      },
    ],
    offerings: [
      // Elementary Grades (elem_1 to elem_6) for Math in languages_experimental & national_arabic
      { track: 'school', stageId: 'elementary', gradeId: 'elem_1', subjectId: 'math', curriculumType: 'languages_experimental' },
      { track: 'school', stageId: 'elementary', gradeId: 'elem_2', subjectId: 'math', curriculumType: 'languages_experimental' },
      { track: 'school', stageId: 'elementary', gradeId: 'elem_3', subjectId: 'math', curriculumType: 'languages_experimental' },
      { track: 'school', stageId: 'elementary', gradeId: 'elem_4', subjectId: 'math', curriculumType: 'languages_experimental' },
      { track: 'school', stageId: 'elementary', gradeId: 'elem_5', subjectId: 'math', curriculumType: 'languages_experimental' },
      { track: 'school', stageId: 'elementary', gradeId: 'elem_6', subjectId: 'math', curriculumType: 'languages_experimental' },
      { track: 'school', stageId: 'elementary', gradeId: 'elem_3', subjectId: 'math', curriculumType: 'national_arabic' },
      { track: 'school', stageId: 'elementary', gradeId: 'elem_4', subjectId: 'math', curriculumType: 'national_arabic' },
      { track: 'school', stageId: 'elementary', gradeId: 'elem_5', subjectId: 'math', curriculumType: 'national_arabic' },
      { track: 'school', stageId: 'elementary', gradeId: 'elem_6', subjectId: 'math', curriculumType: 'national_arabic' },
    ],
  },

  // 2. د. هاني ممدوح عبد الرحمن - Matching Image 5
  {
    id: 'dr-hany-mamdouh',
    name: 'هاني ممدوح عبد الرحمن',
    honorific: 'د.',
    headline: 'خبير تدريس الفيزياء والرياضيات المتقدمة للمرحلتين الإعدادية والثانوية',
    avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=400',
    verifiedCredentials: true,
    yearsOfExperience: 8,
    experienceBadgeText: 'خبرة 8 سنوات',
    curriculumTags: ['لغات / تجريبي', 'عربي حكومي', 'مناهج دولية (IG)'],
    hourlyRateMin: 180,
    hourlyRateMax: 240,
    currency: 'ج.م',
    sessionDurationMinutes: 60,
    trialDurationMinutes: 35,
    rating: 4.95,
    reviewsCount: 62,
    totalStudentsTaught: 198,
    videoPreview: {
      available: true,
      title: 'فيديو تطبيقي: تبسيط قوانين نيوتن والكهربية للثانوية',
      durationText: 'دقيقة ونصف',
      description: 'شرح نموذجي لكيفية ربط قوانين الفيزياء بالتطبيقات الواقعية في دقيقة ونصف.',
    },
    helpChildQuote: 'الفيزياء ليست معادلات صماء؛ هي فهم لكيف يعمل الكون من حولنا، وعندما يدرك الطالب المعنى خلف القانون يصبح التفوق نتيجة حتمية.',
    helpChildSummary: 'تخصصت في تحويل المفاهيم الفيزيائية والرياضية المجردة إلى تجارب فكرية ونماذج رسومية حية تناسب عقلية جيل اليوم، مع التركيز على مهارات حل مسائل التفكير العليا ومسائل الامتحانات.',
    methodologyPillars: [
      {
        title: 'الربط الحسي والعملي للقوانين',
        description: 'محاكاة تفاعلية وتجارب بصرية لظواهر الفيزياء والحركة قبل كتابة المعادلات.',
        iconName: 'globe',
      },
      {
        title: 'منهجية تفكيك المسائل المعقدة',
        description: 'تدريب الطالب على استخراج المعطيات وتحديد المسار المنطقي للحل خطوة بخطوة.',
        iconName: 'checklist',
      },
    ],
    subjectsTaughtSummary: [
      {
        title: 'الفيزياء (Physics)',
        gradesRange: 'الصفوف ١ - ٣ ثانوي',
        curriculumNote: 'عربي ولغات وتجريبي والمناهج الدولية',
        icon: 'science',
      },
      {
        title: 'الرياضيات المتقدمة (Math)',
        gradesRange: 'الصفوف ١ - ٣ إعدادي وثانوي',
        curriculumNote: 'الجبر والهندسة وحساب المثلثات والتفاضل',
        icon: 'math',
      },
    ],
    whatHappensInTrial: [
      {
        stepNumber: 1,
        title: 'تشخيص الأساس العلمي',
        description: 'مناقشة سريعة لاختبار استيعاب الطالب للمفاهيم الأساسية التراكمية في المادة.',
      },
      {
        stepNumber: 2,
        title: 'حل مسألة نموذجية معاً',
        description: 'تطبيق أسلوب الشرح التفاعلي على فكرة معقدة وإيضاح كيف تصبح بسيطة ومنطقية.',
      },
      {
        stepNumber: 3,
        title: 'خريطة طريق دراسية',
        description: 'تحديد خطة المذاكرة الأسبوعية وتوزيع أوقات التدريب على بنك الأسئلة.',
      },
    ],
    qualifications: [
      {
        title: 'بكالوريوس علوم وتربية - قسم الرياضيات البحتة والفيزياء',
        institution: 'جامعة القاهرة • امتياز مع مرتبة الشرف',
        verified: true,
        notes: 'شهادة معتمدة ومطابقة في التخصص',
      },
      {
        title: 'دبلوم مهني في إعداد وتدريس مناهج اللغات والـ IGCSE',
        institution: 'الجمعية الدولية لتطوير التعليم',
        verified: true,
      },
    ],
    offerings: [
      // Physics Prep & Sec
      { track: 'school', stageId: 'secondary', gradeId: 'sec_1', subjectId: 'physics', curriculumType: 'languages_experimental' },
      { track: 'school', stageId: 'secondary', gradeId: 'sec_2', subjectId: 'physics', curriculumType: 'languages_experimental' },
      { track: 'school', stageId: 'secondary', gradeId: 'sec_3', subjectId: 'physics', curriculumType: 'languages_experimental' },
      { track: 'school', stageId: 'secondary', gradeId: 'sec_1', subjectId: 'physics', curriculumType: 'national_arabic' },
      { track: 'school', stageId: 'secondary', gradeId: 'sec_2', subjectId: 'physics', curriculumType: 'national_arabic' },
      { track: 'school', stageId: 'secondary', gradeId: 'sec_3', subjectId: 'physics', curriculumType: 'national_arabic' },
      // Math Prep & Sec
      { track: 'school', stageId: 'preparatory', gradeId: 'prep_1', subjectId: 'math', curriculumType: 'languages_experimental' },
      { track: 'school', stageId: 'preparatory', gradeId: 'prep_2', subjectId: 'math', curriculumType: 'languages_experimental' },
      { track: 'school', stageId: 'preparatory', gradeId: 'prep_3', subjectId: 'math', curriculumType: 'languages_experimental' },
      { track: 'school', stageId: 'secondary', gradeId: 'sec_1', subjectId: 'math', curriculumType: 'languages_experimental' },
      { track: 'school', stageId: 'secondary', gradeId: 'sec_2', subjectId: 'math', curriculumType: 'languages_experimental' },
      { track: 'school', stageId: 'secondary', gradeId: 'sec_3', subjectId: 'math', curriculumType: 'languages_experimental' },
      { track: 'school', stageId: 'secondary', gradeId: 'sec_1', subjectId: 'physics', curriculumType: 'international' },
      { track: 'school', stageId: 'secondary', gradeId: 'sec_2', subjectId: 'physics', curriculumType: 'international' },
    ],
  },

  // 3. أ. مروة عبد العزيز - خبيرة العلوم والساينس للمرحلة الابتدائية والإعدادية
  {
    id: 'marwa-abdelaziz',
    name: 'مروة عبد العزيز',
    honorific: 'أ.',
    headline: 'معلمة علوم وساينس (Science) للمرحلتين الابتدائية والإعدادية',
    avatarUrl: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&q=80&w=400',
    verifiedCredentials: true,
    yearsOfExperience: 6,
    experienceBadgeText: 'خبرة 6 سنوات',
    curriculumTags: ['لغات / تجريبي', 'عربي حكومي'],
    hourlyRateMin: 110,
    hourlyRateMax: 140,
    currency: 'ج.م',
    sessionDurationMinutes: 50,
    trialDurationMinutes: 30,
    rating: 4.88,
    reviewsCount: 39,
    totalStudentsTaught: 85,
    videoPreview: {
      available: true,
      title: 'فيديو تجربة عملية: كيف نفسر ظواهر الطبيعة بطريقة مبسطة؟',
      durationText: 'دقيقة واحدة',
      description: 'شرح ممتع لأحد أجهزة جسم الإنسان باستخدام الرسوم التوضيحية ثلاثية الأبعاد.',
    },
    helpChildQuote: 'مادة العلوم هي شغف الاكتشاف الأول للطفل، وبدورنا نحرص أن يرى الطفل التطبيق العملي لكل مفهوم يدرسه ليتحول الفضول إلى تفوق دراسي.',
    helpChildSummary: 'أسلوب ممتع يدمج الفيديوهات العلمية والتجارب البصرية مع التركيز على إتقان المصطلحات العلمية باللغة الإنجليزية في مناهج اللغات والتجريبي وحل بنوك أسئلة الوزارة.',
    methodologyPillars: [
      {
        title: 'الرسوم التفاعلية والخرائط الذهنية',
        description: 'تلخيص الدروس في مخططات سهلة الحفظ والمراجعة قبل المهام الأدائية.',
        iconName: 'shapes',
      },
      {
        title: 'التدريب على المصطلحات الدقيقة',
        description: 'شرح المفردات الصعبة في مقررات الساينس وربطها بالترجمة الدلالية السليمة.',
        iconName: 'globe',
      },
    ],
    subjectsTaughtSummary: [
      {
        title: 'العلوم والساينس (Science)',
        gradesRange: 'الصفوف ٤ - ٦ ابتدائي و ١ - ٣ إعدادي',
        curriculumNote: 'مدارس اللغات والتجريبي والحكومي',
        icon: 'science',
      },
    ],
    whatHappensInTrial: [
      {
        stepNumber: 1,
        title: 'تعارف سريع واستكشاف ميول الطالب',
        description: 'معرفة مدى إقبال الطالب على المادة والأجزاء التي تسبب له صعوبة.',
      },
      {
        stepNumber: 2,
        title: 'شرح تجربة تفاعلية مباشرة',
        description: 'تقديم مفهوم علمي من المنهج بأسلوب مرئي واختبار استيعاب الطالب فوراً.',
      },
      {
        stepNumber: 3,
        title: 'تحديد نمط المتابعة',
        description: 'اقتراح خطة الحصص الملائمة ومشاركة ولي الأمر خطة المتابعة التراكمية.',
      },
    ],
    qualifications: [
      {
        title: 'بكالوريوس تربية علوم بيولوجية وجيولوجية باللغة الإنجليزية',
        institution: 'جامعة حلوان',
        verified: true,
      },
    ],
    offerings: [
      { track: 'school', stageId: 'elementary', gradeId: 'elem_4', subjectId: 'science', curriculumType: 'languages_experimental' },
      { track: 'school', stageId: 'elementary', gradeId: 'elem_5', subjectId: 'science', curriculumType: 'languages_experimental' },
      { track: 'school', stageId: 'elementary', gradeId: 'elem_6', subjectId: 'science', curriculumType: 'languages_experimental' },
      { track: 'school', stageId: 'elementary', gradeId: 'elem_4', subjectId: 'science', curriculumType: 'national_arabic' },
      { track: 'school', stageId: 'elementary', gradeId: 'elem_5', subjectId: 'science', curriculumType: 'national_arabic' },
      { track: 'school', stageId: 'elementary', gradeId: 'elem_6', subjectId: 'science', curriculumType: 'national_arabic' },
      { track: 'school', stageId: 'preparatory', gradeId: 'prep_1', subjectId: 'science', curriculumType: 'languages_experimental' },
      { track: 'school', stageId: 'preparatory', gradeId: 'prep_2', subjectId: 'science', curriculumType: 'languages_experimental' },
      { track: 'school', stageId: 'preparatory', gradeId: 'prep_3', subjectId: 'science', curriculumType: 'languages_experimental' },
    ],
  },

  // 4. الشيخة فاطمة الأزهري - مسار القرآن الكريم وتأسيس القراءة ونور البيان
  {
    id: 'fatima-alazhari',
    name: 'فاطمة الزهراء الأزهري',
    honorific: 'أ.',
    headline: 'معلمة قرآن كريم وقراءات وتأسيس قراءة عربية بطريقة نور البيان',
    avatarUrl: 'https://images.unsplash.com/photo-1567532939604-b6b5b0db2604?auto=format&fit=crop&q=80&w=400',
    verifiedCredentials: true,
    yearsOfExperience: 9,
    experienceBadgeText: 'خبرة 9 سنوات',
    curriculumTags: ['نور البيان', 'إجازة بالسند', 'صغار وكبار'],
    hourlyRateMin: 90,
    hourlyRateMax: 130,
    currency: 'ج.م',
    sessionDurationMinutes: 45,
    trialDurationMinutes: 30,
    rating: 5.0,
    reviewsCount: 74,
    totalStudentsTaught: 140,
    videoPreview: {
      available: true,
      title: 'فيديو توضيحي: تدرج خطوات مخارج الحروف مع الطفل الصغير',
      durationText: 'دقيقة واحدة',
      description: 'جلسة نموذجية تبرز الصبر والتدرج اللطيف مع البراعم في تصحيح التلاوة.',
    },
    helpChildQuote: 'تعليم القرآن للصغار يبدأ بحب الآيات وسماحتها، وبالصبر والتشجيع المستمر ينطلق لسان الطفل فصيحاً ومتقناً لكتاب الله.',
    helpChildSummary: 'متخصصة في التأسيس القرآني من الصفر وتصحيح مخارج الحروف وقواعد التجويد النظرية والعملية، مع سجل حافل في إعانة عشرات الأطفال على ختم أجزاء من القرآن الكريم بإتقان وسعادة.',
    methodologyPillars: [
      {
        title: 'طريقة نور البيان التأسيسية',
        description: 'التدرج من الحروف وحركاتها الثلاث حتى قراءة الكلمات والآيات بانسيابية تامة.',
        iconName: 'book',
      },
      {
        title: 'التلقين الفردي الصبور',
        description: 'مراعاة الفروق الفردية وسرعة استجابة كل طفل في الحفظ والتثبيت.',
        iconName: 'smile',
      },
    ],
    subjectsTaughtSummary: [
      {
        title: 'نور البيان وتأسيس القراءة',
        gradesRange: 'الأطفال من عمر ٤ إلى ١٠ سنوات',
        curriculumNote: 'منهج تأسيسي علمي معتمد ومجرب',
        icon: 'book',
      },
      {
        title: 'حفظ وتجويد القرآن الكريم',
        gradesRange: 'كافة الفئات العمرية',
        curriculumNote: 'برواية حفص عن عاصم مع أحكام الترتيل',
        icon: 'book',
      },
    ],
    whatHappensInTrial: [
      {
        stepNumber: 1,
        title: 'جلسة ود وتآلف مع الطفل',
        description: 'بناء علاقة مريحة وإزالة أي خجل أو رهبة لدى التلميذ.',
      },
      {
        stepNumber: 2,
        title: 'اختبار مخارج الحروف والتهجي',
        description: 'قراءة كلمات قصيرة لمعرفة المستوى الحالي في التهجي أو الحفظ.',
      },
      {
        stepNumber: 3,
        title: 'الاتفاق على وتيرة الحفظ',
        description: 'تحديد معدل التسميع الأسبوعي والمقدار المناسب دون إثقال على الطفل.',
      },
    ],
    qualifications: [
      {
        title: 'ليسانس الدراسات الإسلامية والعربية - جامعة الأزهر الشريف',
        institution: 'جامعة الأزهر بتقدير امتياز',
        verified: true,
      },
      {
        title: 'إجازة مسندة في القرآن الكريم برواية حفص عن عاصم',
        institution: 'مسندة بالسند المتصل إلى رسول الله ﷺ',
        verified: true,
      },
      {
        title: 'شهادة مدربة معتمدة في منهج نور البيان والفتح الرباني',
        institution: 'دار القرآن الكريم للدراسات التأسيسية',
        verified: true,
      },
    ],
    offerings: [
      { track: 'quran', ageGroupId: 'age_4_7', levelId: 'noor_bayan' },
      { track: 'quran', ageGroupId: 'age_8_12', levelId: 'noor_bayan' },
      { track: 'quran', ageGroupId: 'age_4_7', levelId: 'hifz_tilawa' },
      { track: 'quran', ageGroupId: 'age_8_12', levelId: 'hifz_tilawa' },
      { track: 'quran', ageGroupId: 'age_13_18', levelId: 'hifz_tilawa' },
      { track: 'quran', ageGroupId: 'age_8_12', levelId: 'tajweed_rules' },
      { track: 'quran', ageGroupId: 'age_13_18', levelId: 'tajweed_rules' },
      { track: 'quran', ageGroupId: 'age_adults', levelId: 'tajweed_rules' },
      { track: 'quran', ageGroupId: 'age_4_7', levelId: 'khatt_imlaa' },
      { track: 'quran', ageGroupId: 'age_8_12', levelId: 'khatt_imlaa' },
    ],
  },
];

// In-Memory store for simulated tutor application submissions
const submittedApplicationsStore: TutorApplicationRecord[] = [];

/**
 * Service API Methods
 */
export const DataService = {
  // Taxonomy queries
  getStages(): Promise<Stage[]> {
    return Promise.resolve([...STAGES_DATA]);
  },

  getGradesByStage(stageId: string): Promise<Grade[]> {
    return Promise.resolve(GRADES_DATA.filter(g => g.stageId === stageId));
  },

  getCurriculumOptions(): Promise<CurriculumOption[]> {
    return Promise.resolve([...CURRICULUM_OPTIONS]);
  },

  getSubjects(): Promise<Subject[]> {
    return Promise.resolve([...SUBJECTS_DATA]);
  },

  getQuranAgeGroups(): Promise<QuranAgeGroup[]> {
    return Promise.resolve([...QURAN_AGE_GROUPS]);
  },

  getQuranLevels(): Promise<QuranLevel[]> {
    return Promise.resolve([...QURAN_LEVELS]);
  },

  /**
   * Search Tutors matching exact criteria.
   * Requirement 6: "مثّل ارتباط المادة والصف ونظام الدراسة لكل معلم بدقة؛ لا تعتمد على قوائم منفصلة قد تنتج مطابقات غير صحيحة."
   */
  async searchTutors(criteria: SearchCriteria, simulateError = false): Promise<Tutor[]> {
    // Simulate real network delay for UX states
    await new Promise(resolve => setTimeout(resolve, 350));

    if (simulateError) {
      throw new Error('حدث انقطاع مؤقت في الاتصال أثناء جلب المعلمين.');
    }

    if (criteria.track === 'school') {
      const { stageId, gradeId, subjectId, curriculumType } = criteria;
      if (!stageId || !gradeId || !subjectId || !curriculumType) {
        return [];
      }

      return TUTORS_DATABASE.filter(tutor => {
        return tutor.offerings.some(offering => {
          if (offering.track !== 'school') return false;
          return (
            offering.stageId === stageId &&
            offering.gradeId === gradeId &&
            offering.subjectId === subjectId &&
            offering.curriculumType === curriculumType
          );
        });
      });
    } else {
      // Quran track
      const { ageGroupId, levelId } = criteria;
      if (!ageGroupId || !levelId) {
        return [];
      }

      return TUTORS_DATABASE.filter(tutor => {
        return tutor.offerings.some(offering => {
          if (offering.track !== 'quran') return false;
          return (
            offering.ageGroupId === ageGroupId &&
            offering.levelId === levelId
          );
        });
      });
    }
  },

  /**
   * Get single tutor by ID
   */
  async getTutorById(id: string): Promise<Tutor | null> {
    await new Promise(resolve => setTimeout(resolve, 150));
    const tutor = TUTORS_DATABASE.find(t => t.id === id);
    return tutor ? { ...tutor } : null;
  },

  /**
   * Submit Tutor Registration Application
   * Ready for Supabase client insertion:
   * e.g. const { data, error } = await supabase.from('tutor_applications').insert(record);
   */
  async submitTutorApplication(
    formData: TutorApplicationFormData,
    simulateError = false
  ): Promise<TutorApplicationRecord> {
    await new Promise(resolve => setTimeout(resolve, 1200));

    if (simulateError) {
      throw new Error('تعذر إرسال الطلب مؤقتاً بسبب انقطاع الخادم. تم حفظ بياناتك محلياً.');
    }

    const randomNum = Math.floor(1000 + Math.random() * 9000);
    const year = new Date().getFullYear();
    const referenceCode = `#SHTR-${year}-${randomNum}`;

    const record: TutorApplicationRecord = {
      ...formData,
      id: `app_${Date.now()}_${randomNum}`,
      referenceCode,
      createdAt: new Date().toISOString(),
      status: 'pending_review',
    };

    submittedApplicationsStore.push(record);
    return record;
  },

  getSubmittedApplications(): TutorApplicationRecord[] {
    return [...submittedApplicationsStore];
  },
};
