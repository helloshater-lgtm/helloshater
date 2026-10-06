import React, { useState, useEffect, useMemo } from 'react';
import {
  TrackType,
  StageId,
  CurriculumType,
  TutorApplicationFormData,
  SchoolSpecializationItem,
  Stage,
  Subject,
  Grade,
  CurriculumOption,
  QuranAgeGroup,
  QuranLevel,
} from '../types';
import { DataService } from '../services/dataService';
import { SHATIR_CONFIG } from '../config/shatirConfig';
import { TutorApplicationService } from '../services/tutorApplicationService';
import { TutorAuthModal } from './tutor/TutorAuthModal';
import {
  TutorCooperationPolicyModal,
  TUTOR_COOPERATION_POLICY_VERSION,
} from './TutorCooperationPolicyModal';
import { trackTeacherApplicationWhatsAppClicked } from '../services/analytics';
import {
  Info,
  Clock,
  ArrowLeft,
  MessageCircle,
  CreditCard,
  Users,
  ShieldCheck,
  FileText,
  AlertCircle,
  Plus,
  Trash2,
  CheckCircle2,
  Copy,
  Check,
  GraduationCap,
  Calendar,
  DollarSign,
  Laptop,
  CheckSquare,
  Square,
  BookOpen,
  Sparkles,
  LogIn,
  LogOut,
  Save,
  Send,
  Loader2,
} from 'lucide-react';

export const COUNTRY_OPTIONS = [
  { code: '+20', name: 'مصر (+20)', clean: '20' },
  { code: '+966', name: 'المملكة العربية السعودية (+966)', clean: '966' },
  { code: '+971', name: 'الإمارات العربية المتحدة (+971)', clean: '971' },
  { code: '+965', name: 'الكويت (+965)', clean: '965' },
  { code: '+974', name: 'قطر (+974)', clean: '974' },
  { code: '+968', name: 'سلطنة عُمان (+968)', clean: '968' },
  { code: '+973', name: 'مملكة البحرين (+973)', clean: '973' },
  { code: '+962', name: 'الأردن (+962)', clean: '962' },
];

export interface FormSubjectDefinition {
  id: string; // key in form
  subjectId: string; // database subject id
  label: string;
  teachingLanguage: 'arabic' | 'english';
  category: 'core' | 'languages' | 'sciences' | 'social';
  badge?: string;
}

export const FORM_SUBJECT_DEFINITIONS: FormSubjectDefinition[] = [
  {
    id: 'math_ar',
    subjectId: 'math',
    label: 'الرياضيات — تدريس بالعربية',
    teachingLanguage: 'arabic',
    category: 'core',
  },
  {
    id: 'math_en',
    subjectId: 'math',
    label: 'Math — تدريس بالإنجليزية',
    teachingLanguage: 'english',
    category: 'core',
    badge: 'لغات / تجريبي / دولي',
  },
  {
    id: 'science_ar',
    subjectId: 'science',
    label: 'العلوم — تدريس بالعربية',
    teachingLanguage: 'arabic',
    category: 'sciences',
  },
  {
    id: 'science_en',
    subjectId: 'science',
    label: 'Science — تدريس بالإنجليزية',
    teachingLanguage: 'english',
    category: 'sciences',
    badge: 'لغات / تجريبي / دولي',
  },
  {
    id: 'physics_ar',
    subjectId: 'physics',
    label: 'الفيزياء — تدريس بالعربية',
    teachingLanguage: 'arabic',
    category: 'sciences',
  },
  {
    id: 'physics_en',
    subjectId: 'physics',
    label: 'Physics — تدريس بالإنجليزية',
    teachingLanguage: 'english',
    category: 'sciences',
    badge: 'لغات / تجريبي / دولي',
  },
  {
    id: 'chemistry_ar',
    subjectId: 'chemistry',
    label: 'الكيمياء — تدريس بالعربية',
    teachingLanguage: 'arabic',
    category: 'sciences',
  },
  {
    id: 'chemistry_en',
    subjectId: 'chemistry',
    label: 'Chemistry — تدريس بالإنجليزية',
    teachingLanguage: 'english',
    category: 'sciences',
    badge: 'لغات / تجريبي / دولي',
  },
  {
    id: 'biology_ar',
    subjectId: 'biology',
    label: 'الأحياء — تدريس بالعربية',
    teachingLanguage: 'arabic',
    category: 'sciences',
  },
  {
    id: 'biology_en',
    subjectId: 'biology',
    label: 'Biology — تدريس بالإنجليزية',
    teachingLanguage: 'english',
    category: 'sciences',
    badge: 'لغات / تجريبي / دولي',
  },
  {
    id: 'arabic',
    subjectId: 'arabic',
    label: 'اللغة العربية',
    teachingLanguage: 'arabic',
    category: 'languages',
  },
  {
    id: 'english',
    subjectId: 'english',
    label: 'اللغة الإنجليزية',
    teachingLanguage: 'english',
    category: 'languages',
  },
  {
    id: 'social',
    subjectId: 'social',
    label: 'الدراسات الاجتماعية',
    teachingLanguage: 'arabic',
    category: 'social',
  },
];

export const EXPERIENCE_YEARS_OPTIONS = [
  'أقل من سنتين',
  'من سنتين إلى ٣ سنوات',
  'من ٤ إلى ٦ سنوات',
  'من ٧ إلى ١٠ سنوات',
  'أكثر من ١٠ سنوات',
];

export const WEEK_DAYS_OPTIONS = [
  'السبت',
  'الأحد',
  'الإثنين',
  'الثلاثاء',
  'الأربعاء',
  'الخميس',
  'الجمعة',
];

export const PREFERRED_TIMES_OPTIONS = [
  'فترة صباحية (٩ ص - ١ م)',
  'فترة مسائية مبكرة (١ م - ٥ م)',
  'فترة مسائية رئيسية (٥ م - ١٠ م)',
  'عطلات نهاية الأسبوع',
];

export const TIMEZONE_OPTIONS = [
  'توقيت القاهرة (GMT+2)',
  'توقيت مكة المكرمة (GMT+3)',
  'توقيت الإمارات (GMT+4)',
];

// Fallback taxonomy data matching Supabase seeds
const FALLBACK_STAGES: Stage[] = [
  { id: 'elementary', name: 'المرحلة الابتدائية', gradesDesc: 'الصفوف (١ - ٦ ابتدائي)', order: 1 },
  { id: 'preparatory', name: 'المرحلة الإعدادية / المتوسطة', gradesDesc: 'الصفوف (١ - ٣ إعدادي)', order: 2 },
  { id: 'secondary', name: 'المرحلة الثانوية', gradesDesc: 'الصفوف (١ - ٣ ثانوي)', order: 3 },
];

const FALLBACK_GRADES: Grade[] = [
  { id: 'elem_1', stageId: 'elementary', name: 'الصف الأول الابتدائي', order: 1 },
  { id: 'elem_2', stageId: 'elementary', name: 'الصف الثاني الابتدائي', order: 2 },
  { id: 'elem_3', stageId: 'elementary', name: 'الصف الثالث الابتدائي', order: 3 },
  { id: 'elem_4', stageId: 'elementary', name: 'الصف الرابع الابتدائي', order: 4 },
  { id: 'elem_5', stageId: 'elementary', name: 'الصف الخامس الابتدائي', order: 5 },
  { id: 'elem_6', stageId: 'elementary', name: 'الصف السادس الابتدائي', order: 6 },
  { id: 'prep_1', stageId: 'preparatory', name: 'الصف الأول الإعدادي', order: 1 },
  { id: 'prep_2', stageId: 'preparatory', name: 'الصف الثاني الإعدادي', order: 2 },
  { id: 'prep_3', stageId: 'preparatory', name: 'الصف الثالث الإعدادي', order: 3 },
  { id: 'sec_1', stageId: 'secondary', name: 'الصف الأول الثانوي', order: 1 },
  { id: 'sec_2', stageId: 'secondary', name: 'الصف الثاني الثانوي', order: 2 },
  { id: 'sec_3', stageId: 'secondary', name: 'الصف الثالث الثانوي', order: 3 },
];

const FALLBACK_CURRICULA: CurriculumOption[] = [
  { id: 'national_arabic', name: 'عربي (حكومي / أهلي)', description: 'المنهج الوزاري العام والمدارس الحكومية والأهلية باللغة العربية' },
  { id: 'languages_experimental', name: 'لغات / تجريبي (Languages)', description: 'مدارس اللغات والمدارس التجريبية الرسمية والمتميزة' },
  { id: 'international', name: 'مناهج دولية (IGCSE / SAT)', description: 'النظام البريطاني والأمريكي والبرامج الدولية' },
];

const FALLBACK_QURAN_AGES: QuranAgeGroup[] = [
  { id: 'age_4_7', name: 'أطفال وبراعم', ageRange: '٤ - ٧ سنوات' },
  { id: 'age_8_12', name: 'ناشئة وطلاب', ageRange: '٨ - ١٢ سنة' },
  { id: 'age_13_18', name: 'يافعون وشباب', ageRange: '١٣ - ١٨ سنة' },
];

const FALLBACK_QURAN_LEVELS: QuranLevel[] = [
  { id: 'noor_bayan', name: 'تأسيس نور البيان والقراءة العربية', description: 'تعليم مخارج الحروف والتهجي السليم من الصفر وتحسين نطق الكلمات' },
  { id: 'hifz_tilawa', name: 'حفظ وتلقين القرآن الكريم ومراجعته', description: 'تحفيظ منتظم مع المتابعة المستمرة وتثبيت السور للأطفال والناشئة' },
  { id: 'tajweed_rules', name: 'أحكام التجويد والإتقان برواية حفص', description: 'دراسة وتطبيق أحكام النون والميم والمدود ومخارج وصفات الحروف' },
  { id: 'khatt_imlaa', name: 'تحسين الخط العربي وقواعد الإملاء', description: 'ضبط قواعد الكتابة الصحيحة وتفادي الأخطاء الإملائية الشائعة' },
];

export function normalizePhone(rawPhone: string, countryCode: string): string {
  if (!rawPhone) return '';
  const arabicIndicDigits = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
  let normalized = rawPhone;
  for (let i = 0; i < 10; i++) {
    normalized = normalized.replaceAll(arabicIndicDigits[i], String(i));
  }
  let digitsOnly = normalized.replace(/[^0-9]/g, '');
  const cleanCountry = countryCode.replace(/[^0-9]/g, '');

  // Avoid duplicate country code if user typed or pasted it
  if (digitsOnly.startsWith(cleanCountry)) {
    digitsOnly = digitsOnly.slice(cleanCountry.length);
  }

  // For Egypt (+20): remove initial local leading zero (e.g. 010... -> 10...)
  if (cleanCountry === '20') {
    digitsOnly = digitsOnly.replace(/^0+/, '');
  } else if (digitsOnly.startsWith('0') && digitsOnly.length > 9) {
    digitsOnly = digitsOnly.replace(/^0+/, '');
  }

  return digitsOnly;
}

const createDefaultSpecialization = (idSuffix: string = '1'): SchoolSpecializationItem => ({
  id: `spec_${Date.now()}_${idSuffix}`,
  subjectId: 'math_ar',
  teachingLanguage: 'arabic',
  curriculumType: 'national_arabic',
  stageId: 'elementary',
  gradeIds: ['elem_1', 'elem_2', 'elem_3'],
});

const INITIAL_FORM: TutorApplicationFormData = {
  fullName: '',
  countryCode: '+20',
  phone: '',
  track: 'school',
  schoolSpecializations: [createDefaultSpecialization('init')],
  quranAgeGroups: ['age_4_7', 'age_8_12'],
  quranLevels: ['noor_bayan', 'hifz_tilawa'],
  quranNotes: '',
  subjects: ['math'],
  stages: ['elementary'],
  curricula: ['national_arabic'],
  academicDegree: '',
  experienceYears: 'من ٤ إلى ٦ سنوات',
  hasOnlineExperience: 'yes',
  onlineExperienceDetails: '',
  bioAndMethodology: '',
  portfolioUrl: '',
  suggestedHourlyRate: '150',
  currency: 'ج.م',
  sessionDurationMinutes: 50,
  availableDays: ['السبت', 'الإثنين', 'الأربعاء'],
  preferredTimes: ['فترة مسائية رئيسية (٥ م - ١٠ م)'],
  timezone: 'توقيت القاهرة (GMT+2)',
  interviewAvailability: '',
  termsAccepted: false,
  termsPolicyVersion: TUTOR_COOPERATION_POLICY_VERSION,
};

const DRAFT_KEY = 'shatir_tutor_app_draft_v3';

export const TutorRegistrationView: React.FC = () => {
  const [formData, setFormData] = useState<TutorApplicationFormData>(INITIAL_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showNoticeScreen, setShowNoticeScreen] = useState<boolean>(false);
  const [isPolicyModalOpen, setIsPolicyModalOpen] = useState<boolean>(false);
  const [copiedMessage, setCopiedMessage] = useState<boolean>(false);

  // Teacher Supabase Auth & Application Database State
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(false);
  const [authModalMode, setAuthModalMode] = useState<'signin' | 'signup'>('signup');
  const [dbApplication, setDbApplication] = useState<any>(null);
  const [isSavingDb, setIsSavingDb] = useState<boolean>(false);
  const [saveStatusMessage, setSaveStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Live options loaded from Supabase Data Layer with fallbacks
  const [stages, setStages] = useState<Stage[]>(FALLBACK_STAGES);
  const [allGrades, setAllGrades] = useState<Grade[]>(FALLBACK_GRADES);
  const [curricula, setCurricula] = useState<CurriculumOption[]>(FALLBACK_CURRICULA);
  const [quranAgeGroups, setQuranAgeGroups] = useState<QuranAgeGroup[]>(FALLBACK_QURAN_AGES);
  const [quranLevels, setQuranLevels] = useState<QuranLevel[]>(FALLBACK_QURAN_LEVELS);

  // Initialize Auth & listen to changes
  useEffect(() => {
    TutorApplicationService.getCurrentUser().then((user) => {
      setCurrentUser(user);
      if (user) {
        loadMyApplication();
      }
    });

    const unsubscribe = TutorApplicationService.onAuthStateChange((user) => {
      setCurrentUser(user);
      if (user) {
        loadMyApplication();
      } else {
        setDbApplication(null);
      }
    });

    return () => unsubscribe();
  }, []);

  const loadMyApplication = async () => {
    try {
      const app = await TutorApplicationService.getMyApplication();
      if (app) {
        setDbApplication(app);
        // Fill form data from DB record
        setFormData((prev) => ({
          ...prev,
          fullName: app.fullName || prev.fullName,
          countryCode: app.countryCode || prev.countryCode,
          phone: app.phone || prev.phone,
          track: app.track || prev.track,
          schoolSpecializations: app.schoolSpecializations?.length ? app.schoolSpecializations : prev.schoolSpecializations,
          quranAgeGroups: app.quranAgeGroups?.length ? app.quranAgeGroups : prev.quranAgeGroups,
          quranLevels: app.quranLevels?.length ? app.quranLevels : prev.quranLevels,
          quranNotes: app.quranNotes || '',
          academicDegree: app.academicDegree || prev.academicDegree,
          experienceYears: app.experienceYears || prev.experienceYears,
          hasOnlineExperience: app.hasOnlineExperience || prev.hasOnlineExperience,
          onlineExperienceDetails: app.onlineExperienceDetails || prev.onlineExperienceDetails,
          bioAndMethodology: app.bioAndMethodology || prev.bioAndMethodology,
          portfolioUrl: app.portfolioUrl || prev.portfolioUrl,
          suggestedHourlyRate: String(app.suggestedHourlyRate || prev.suggestedHourlyRate),
          currency: app.currency || prev.currency,
          sessionDurationMinutes: app.sessionDurationMinutes || prev.sessionDurationMinutes,
          availableDays: app.availableDays?.length ? app.availableDays : prev.availableDays,
          preferredTimes: app.preferredTimes?.length ? app.preferredTimes : prev.preferredTimes,
          timezone: app.timezone || prev.timezone,
          termsAccepted: Boolean(app.termsAccepted),
          termsPolicyVersion: app.policyVersion || TUTOR_COOPERATION_POLICY_VERSION,
        }));
      }
    } catch (err) {
      console.error('Error loading my tutor application:', err);
    }
  };

  const handleTeacherSignOut = async () => {
    await TutorApplicationService.signOut();
    setCurrentUser(null);
    setDbApplication(null);
  };

  // Save draft to Supabase DB
  const handleSaveDraftToDb = async () => {
    if (!currentUser) {
      setAuthModalMode('signin');
      setIsAuthModalOpen(true);
      return;
    }

    setIsSavingDb(true);
    setSaveStatusMessage(null);
    try {
      const saved = await TutorApplicationService.saveApplication(formData, false, dbApplication?.id);
      setDbApplication(saved);
      setSaveStatusMessage({ type: 'success', text: 'تم حفظ مسودة طلبك بنجاح في حسابك!' });
      setTimeout(() => setSaveStatusMessage(null), 4000);
    } catch (err: any) {
      setSaveStatusMessage({ type: 'error', text: err?.message || 'تعذر حفظ المسودة.' });
    } finally {
      setIsSavingDb(false);
    }
  };

  // Submit final application to DB
  const handleSubmitFinalToDb = async () => {
    if (!validateForm()) return;

    if (!currentUser) {
      setAuthModalMode('signup');
      setIsAuthModalOpen(true);
      return;
    }

    setIsSavingDb(true);
    setSaveStatusMessage(null);
    try {
      const submitted = await TutorApplicationService.saveApplication(formData, true, dbApplication?.id);
      setDbApplication(submitted);
      setShowNoticeScreen(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err: any) {
      setSaveStatusMessage({ type: 'error', text: err?.message || 'تعذر إرسال الطلب.' });
    } finally {
      setIsSavingDb(false);
    }
  };

  useEffect(() => {
    Promise.all([
      DataService.getStages().catch(() => FALLBACK_STAGES),
      DataService.getAllGrades().catch(() => FALLBACK_GRADES),
      DataService.getCurriculumOptions().catch(() => FALLBACK_CURRICULA),
      DataService.getQuranAgeGroups().catch(() => FALLBACK_QURAN_AGES),
      DataService.getQuranLevels().catch(() => FALLBACK_QURAN_LEVELS),
    ]).then(([stgs, grds, currs, qAges, qLvls]) => {
      if (stgs && stgs.length > 0) setStages(stgs);
      if (grds && grds.length > 0) setAllGrades(grds);
      if (currs && currs.length > 0) setCurricula(currs);
      if (qAges && qAges.length > 0) setQuranAgeGroups(qAges);
      if (qLvls && qLvls.length > 0) setQuranLevels(qLvls);
    });
  }, []);

  // Restore saved input draft if available
  useEffect(() => {
    try {
      const saved = localStorage.getItem(DRAFT_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        // Requirement 5: Retain consent within form data during navigation, and re-request if policy version changed
        if (parsed.termsPolicyVersion !== TUTOR_COOPERATION_POLICY_VERSION) {
          parsed.termsAccepted = false;
          parsed.termsPolicyVersion = TUTOR_COOPERATION_POLICY_VERSION;
        }
        // Ensure schoolSpecializations exists if restored from older draft
        if (!parsed.schoolSpecializations || parsed.schoolSpecializations.length === 0) {
          parsed.schoolSpecializations = [createDefaultSpecialization('migrated')];
        }
        setFormData((prev) => ({ ...prev, ...parsed }));
      }
    } catch {
      // Local storage unavailable
    }
  }, []);

  const saveDraft = (updated: TutorApplicationFormData) => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(updated));
    } catch {
      // Ignore
    }
  };

  const handleInputChange = (field: keyof TutorApplicationFormData, value: any) => {
    setFormData((prev) => {
      const updated = {
        ...prev,
        [field]: value,
        ...(field === 'termsAccepted'
          ? { termsPolicyVersion: value ? TUTOR_COOPERATION_POLICY_VERSION : '' }
          : {}),
      };
      saveDraft(updated);
      return updated;
    });

    if (errors[field] || (field === 'termsAccepted' && errors.terms)) {
      setErrors((prev) => {
        const copy = { ...prev };
        delete copy[field];
        if (field === 'termsAccepted') delete copy.terms;
        return copy;
      });
    }
  };

  // Specialization helpers for school track
  const addSpecialization = () => {
    const newItem = createDefaultSpecialization(String(formData.schoolSpecializations.length + 1));
    const updated = [...formData.schoolSpecializations, newItem];
    handleInputChange('schoolSpecializations', updated);
  };

  const removeSpecialization = (id: string) => {
    if (formData.schoolSpecializations.length <= 1) return;
    const updated = formData.schoolSpecializations.filter((s) => s.id !== id);
    handleInputChange('schoolSpecializations', updated);
  };

  const updateSpecialization = (id: string, updates: Partial<SchoolSpecializationItem>) => {
    const updated = formData.schoolSpecializations.map((spec) => {
      if (spec.id !== id) return spec;
      const merged = { ...spec, ...updates };

      // If subject changed, auto-update teachingLanguage
      if (updates.subjectId) {
        const def = FORM_SUBJECT_DEFINITIONS.find((d) => d.id === updates.subjectId);
        if (def) {
          merged.teachingLanguage = def.teachingLanguage;
        }
      }

      // If stage changed, default to grades of new stage
      if (updates.stageId && updates.stageId !== spec.stageId) {
        const stageGrades = allGrades.filter((g) => g.stageId === updates.stageId).map((g) => g.id);
        merged.gradeIds = stageGrades.slice(0, 3);
      }

      return merged;
    });
    handleInputChange('schoolSpecializations', updated);
  };

  const toggleGradeInSpecialization = (specId: string, gradeId: string) => {
    const spec = formData.schoolSpecializations.find((s) => s.id === specId);
    if (!spec) return;
    const exists = spec.gradeIds.includes(gradeId);
    const newGrades = exists
      ? spec.gradeIds.filter((g) => g !== gradeId)
      : [...spec.gradeIds, gradeId];

    updateSpecialization(specId, { gradeIds: newGrades });
  };

  const selectAllGradesInSpecialization = (specId: string, stageId: StageId) => {
    const stageGrades = allGrades.filter((g) => g.stageId === stageId).map((g) => g.id);
    updateSpecialization(specId, { gradeIds: stageGrades });
  };

  // Quran helpers
  const toggleQuranLevel = (id: string) => {
    const exists = formData.quranLevels.includes(id);
    const updated = exists
      ? formData.quranLevels.filter((l) => l !== id)
      : [...formData.quranLevels, id];
    handleInputChange('quranLevels', updated);
  };

  const toggleQuranAgeGroup = (id: string) => {
    const exists = formData.quranAgeGroups.includes(id);
    const updated = exists
      ? formData.quranAgeGroups.filter((a) => a !== id)
      : [...formData.quranAgeGroups, id];
    handleInputChange('quranAgeGroups', updated);
  };

  // Days & times helpers
  const toggleDay = (day: string) => {
    const exists = formData.availableDays.includes(day);
    const updated = exists
      ? formData.availableDays.filter((d) => d !== day)
      : [...formData.availableDays, day];
    handleInputChange('availableDays', updated);
  };

  const toggleTime = (time: string) => {
    const exists = formData.preferredTimes.includes(time);
    const updated = exists
      ? formData.preferredTimes.filter((t) => t !== time)
      : [...formData.preferredTimes, time];
    handleInputChange('preferredTimes', updated);
  };

  // Validation
  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    // 1. Full name
    if (!formData.fullName.trim() || formData.fullName.trim().split(' ').length < 2) {
      newErrors.fullName = 'يرجى إدخال الاسم كاملاً (ثنائي أو ثلاثي على الأقل)';
    }

    // 2. Phone
    const cleanPhone = normalizePhone(formData.phone, formData.countryCode);
    const isEgypt = formData.countryCode === '+20';
    if (!cleanPhone) {
      newErrors.phone = 'يرجى إدخال رقم واتساب للتواصل';
    } else if (isEgypt) {
      if (cleanPhone.length !== 10 || !['10', '11', '12', '15'].some((prefix) => cleanPhone.startsWith(prefix))) {
        newErrors.phone = 'يرجى إدخال رقم محمول مصري صحيح (مثال: 1012345678)';
      }
    } else if (cleanPhone.length < 7 || cleanPhone.length > 13) {
      newErrors.phone = 'يرجى التأكد من صحة رقم الهاتف وعدد أرقامه';
    }

    // 3. Track Specializations
    if (formData.track === 'school') {
      if (!formData.schoolSpecializations || formData.schoolSpecializations.length === 0) {
        newErrors.schoolSpecializations = 'يرجى إضافة تخصص تدريسي واحد على الأقل للمتابعة';
      } else {
        const hasEmptyGrades = formData.schoolSpecializations.some((s) => s.gradeIds.length === 0);
        if (hasEmptyGrades) {
          newErrors.schoolSpecializations = 'يرجى اختيار صف دراسي واحد على الأقل لكل تخصص مضاف';
        }
      }
    } else {
      if (formData.quranLevels.length === 0) {
        newErrors.quranLevels = 'يرجى اختيار برنامج قرآني أو تأسيسي واحد على الأقل';
      }
      if (formData.quranAgeGroups.length === 0) {
        newErrors.quranAgeGroups = 'يرجى اختيار فئة عمرية واحدة على الأقل تتقن تدريسها';
      }
    }

    // 4. Academic & Experience
    if (!formData.academicDegree.trim() || formData.academicDegree.trim().length < 4) {
      newErrors.academicDegree = 'يرجى توضيح المؤهل الأكاديمي والتخصص والجامعة بدقة';
    }

    if (!formData.experienceYears) {
      newErrors.experienceYears = 'يرجى اختيار سنوات الخبرة التدريسية';
    }

    if (!formData.hasOnlineExperience) {
      newErrors.hasOnlineExperience = 'يرجى تحديد ما إذا كانت لديك خبرة سابقة في التدريس أونلاين';
    } else if (formData.hasOnlineExperience === 'yes' && !formData.onlineExperienceDetails.trim()) {
      newErrors.onlineExperienceDetails = 'يرجى توضيح نبذة مختصرة عن الأدوات والمنصات المستخدمة (مثل Zoom، Google Meet، لوح رقمي)';
    }

    if (!formData.bioAndMethodology.trim() || formData.bioAndMethodology.trim().length < 15) {
      newErrors.bioAndMethodology = 'يرجى كتابة نبذة واضحة (١٥ حرفاً على الأقل) تصف طريقتك في الشرح وتبسيط المعلومة للطلاب';
    }

    if (formData.portfolioUrl.trim()) {
      try {
        const url = new URL(formData.portfolioUrl.trim());
        if (!['http:', 'https:'].includes(url.protocol)) {
          newErrors.portfolioUrl = 'يرجى إدخال رابط إلكتروني صحيح يبدأ بـ https://';
        }
      } catch {
        newErrors.portfolioUrl = 'صيغة الرابط غير صحيحة، يرجى التأكد من كتابة الرابط كاملاً';
      }
    }

    // 5. Pricing & Availability
    const rateNum = Number(formData.suggestedHourlyRate);
    if (!formData.suggestedHourlyRate || isNaN(rateNum) || rateNum <= 0) {
      newErrors.suggestedHourlyRate = 'يرجى إدخال أجر مقترح منطقي للحصة';
    }

    if (formData.availableDays.length === 0) {
      newErrors.availableDays = 'يرجى تحديد يوم واحد على الأقل من أيام التفرغ الممكنة';
    }

    if (formData.preferredTimes.length === 0) {
      newErrors.preferredTimes = 'يرجى تحديد فترة واحدة على الأقل من الفترات المفضلة لديك';
    }

    // 6. Policy acceptance
    if (!formData.termsAccepted) {
      newErrors.terms = 'يجب قراءة سياسة التعاون مع شاطر والموافقة عليها لمتابعة تقديم الطلب';
    }

    setErrors(newErrors);

    if (Object.keys(newErrors).length > 0) {
      // Scroll to the first error element
      const firstErrorKey = Object.keys(newErrors)[0];
      const el = document.getElementById(`form-field-${firstErrorKey}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      return false;
    }

    return true;
  };

  const handleSubmitAction = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;
    setShowNoticeScreen(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // WhatsApp Message Generator
  const buildApplicationWhatsAppMessageText = (): string => {
    const trackTitle = formData.track === 'school' ? 'المناهج المدرسية' : 'مسار القرآن والتأسيس';
    const countryObj = COUNTRY_OPTIONS.find((c) => c.code === formData.countryCode);
    const cleanPhone = normalizePhone(formData.phone, formData.countryCode);

    const lines: string[] = [
      `السلام عليكم ورحمة الله وبركاته، فريق إدارة شاطر كلاسيز 👋`,
      `أود التقديم للانضمام كمعلم في منصة شاطر، وإليكم بيانات طلبي الكاملة للمراجعة:`,
      ``,
      `📋 *١. البيانات الأساسية:*`,
      `• الاسم الكامل: ${formData.fullName.trim()}`,
      `• الدولة ورقم الواتساب: ${countryObj ? countryObj.name : formData.countryCode} (${formData.countryCode} ${cleanPhone})`,
      ``,
      `📚 *٢. المسار التدريسي والتخصصات:*`,
      `• المسار: ${trackTitle}`,
    ];

    if (formData.track === 'school') {
      lines.push(`• التخصصات المدرسية المحددة (${formData.schoolSpecializations.length}):`);
      formData.schoolSpecializations.forEach((spec, idx) => {
        const subjDef = FORM_SUBJECT_DEFINITIONS.find((d) => d.id === spec.subjectId);
        const subjLabel = subjDef ? subjDef.label : spec.subjectId;
        const currObj = curricula.find((c) => c.id === spec.curriculumType);
        const currLabel = currObj ? currObj.name : spec.curriculumType;
        const stageObj = stages.find((s) => s.id === spec.stageId);
        const stageLabel = stageObj ? stageObj.name : spec.stageId;
        const gradeNames = spec.gradeIds
          .map((gid) => allGrades.find((g) => g.id === gid)?.name)
          .filter(Boolean)
          .join('، ');

        lines.push(`  ${idx + 1}) ${subjLabel}`);
        lines.push(`     - نوع المنهج: ${currLabel}`);
        lines.push(`     - المرحلة: ${stageLabel}`);
        lines.push(`     - الصفوف: ${gradeNames || 'جميع صفوف المرحلة'}`);
      });
    } else {
      const quranLevelsNames = formData.quranLevels
        .map((lid) => quranLevels.find((l) => l.id === lid)?.name)
        .filter(Boolean)
        .join('، ');
      const quranAgeNames = formData.quranAgeGroups
        .map((aid) => quranAgeGroups.find((a) => a.id === aid)?.name)
        .filter(Boolean)
        .join('، ');

      lines.push(`• البرامج المتقنة: ${quranLevelsNames || 'غير محدد'}`);
      lines.push(`• الفئات العمرية المستهدفة: ${quranAgeNames || 'غير محدد'}`);
      if (formData.quranNotes?.trim()) {
        lines.push(`• ملاحظات التأسيس والقراءات: ${formData.quranNotes.trim()}`);
      }
    }

    lines.push(``);
    lines.push(`🎓 *٣. المؤهلات والخبرة:*`);
    lines.push(`• المؤهل الأكاديمي والجامعة: ${formData.academicDegree.trim()}`);
    lines.push(`• سنوات الخبرة: ${formData.experienceYears}`);
    lines.push(
      `• خبرة التدريس أونلاين: ${
        formData.hasOnlineExperience === 'yes'
          ? `نعم (${formData.onlineExperienceDetails.trim()})`
          : 'لا (جديد في التدريس عن بُعد)'
      }`
    );
    lines.push(`• نبذة عن أسلوب التدريس: ${formData.bioAndMethodology.trim()}`);
    if (formData.portfolioUrl?.trim()) {
      lines.push(`• رابط نموذج شرح / سيرة: ${formData.portfolioUrl.trim()}`);
    }

    lines.push(``);
    lines.push(`💰 *٤. التسعير والتفرغ:*`);
    lines.push(`• سعر الحصة المقترح: ${formData.suggestedHourlyRate} ${formData.currency} / مدة الحصة: ${formData.sessionDurationMinutes} دقيقة`);
    lines.push(`  (سعر مقترح خاضع للمراجعة والتوافق — الحصة التجريبية مجانية مدتها ٢٠ دقيقة)`);
    lines.push(`• أيام التفرغ: ${formData.availableDays.join('، ') || 'مرن'}`);
    lines.push(`• الفترات المفضلة: ${formData.preferredTimes.join('، ') || 'مرن'}`);

    lines.push(``);
    lines.push(`⚖️ *٥. الإقرار والسياسة:*`);
    lines.push(`• أقرّ بقراءة سياسة التعاون مع شاطر والموافقة عليها — الإصدار 1.0`);
    lines.push(``);
    lines.push(`أرجو مراجعة طلبي والتنسيق معي لتحديد موعد المقابلة التعريفية. شكراً لكم!`);

    return lines.join('\n');
  };

  const getApplicationWhatsAppUrl = (): string => {
    const rawNumber = SHATIR_CONFIG.adminWhatsAppNumber || '201107889984';
    const number = rawNumber.replace(/[^0-9]/g, '');
    const message = buildApplicationWhatsAppMessageText();
    return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
  };

  const handleCopyApplicationData = () => {
    const text = buildApplicationWhatsAppMessageText();
    navigator.clipboard?.writeText(text);
    setCopiedMessage(true);
    setTimeout(() => setCopiedMessage(false), 2500);
  };

  return (
    <div className="w-full max-w-4xl mx-auto py-6 sm:py-10 px-4 sm:px-6 animate-fade-in" dir="rtl">
      {/* Teacher Account Header & Status Card */}
      <div className="mb-6 bg-white rounded-2xl border border-[#E2E8F0] p-4 sm:p-5 shadow-xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#EBF3FC] text-[#0D4E8B] flex items-center justify-center shrink-0">
            <GraduationCap className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-['Cairo'] text-sm sm:text-base font-bold text-[#1F2A44]">
                {currentUser ? (currentUser.user_metadata?.full_name || currentUser.email) : 'بوابة المعلمين والتقديم'}
              </h3>
              {currentUser && (
                <span className="text-[11px] text-[#0D4E8B] bg-[#EBF3FC] px-2 py-0.5 rounded font-bold">
                  حساب معلم
                </span>
              )}
            </div>
            <p className="text-xs text-[#64748B]">
              {currentUser
                ? `مسجل بالبريد: ${currentUser.email}`
                : 'أنشئ حسابك كمعلم لحفظ مسودة طلبك ومتابعة المراجعة والتعديل.'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto">
          {currentUser ? (
            <button
              type="button"
              onClick={handleTeacherSignOut}
              className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-rose-50 text-slate-700 hover:text-rose-700 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>تسجيل الخروج</span>
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setAuthModalMode('signin');
                  setIsAuthModalOpen(true);
                }}
                className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-[#1F2A44] text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>تسجيل الدخول</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setAuthModalMode('signup');
                  setIsAuthModalOpen(true);
                }}
                className="px-3.5 py-2 rounded-xl bg-[#0D4E8B] hover:bg-[#003767] text-white text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <Users className="w-3.5 h-3.5" />
                <span>إنشاء حساب كمعلم</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Save Notification / Status Messages */}
      {saveStatusMessage && (
        <div
          className={`mb-6 p-4 rounded-xl border text-xs sm:text-sm flex items-start gap-2.5 ${
            saveStatusMessage.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          {saveStatusMessage.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          )}
          <span className="font-bold">{saveStatusMessage.text}</span>
        </div>
      )}

      {/* Database Application Status Card (if exists) */}
      {dbApplication && (
        <div className="mb-6 p-4 sm:p-5 rounded-2xl bg-white border border-[#CBD5E1] shadow-xs space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-[#F1F5F9]">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-[#0D4E8B]" />
              <span className="font-bold text-xs sm:text-sm text-[#1F2A44]">
                حالة طلب الانضمام:
              </span>
              {dbApplication.status === 'draft' && (
                <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 text-xs font-bold">
                  مسودة (غير مرسل بعد)
                </span>
              )}
              {(dbApplication.status === 'submitted' || dbApplication.status === 'pending_review') && (
                <span className="px-2.5 py-1 rounded-lg bg-blue-50 text-[#0D4E8B] border border-blue-200 text-xs font-bold flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  قيد المراجعة لدى الإدارة
                </span>
              )}
              {dbApplication.status === 'needs_info' && (
                <span className="px-2.5 py-1 rounded-lg bg-amber-50 text-amber-800 border border-amber-200 text-xs font-bold flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  مطلوب استكمال بيانات
                </span>
              )}
              {dbApplication.status === 'approved' && (
                <span className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-bold flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  تم قبول طلبك واعتمادك
                </span>
              )}
              {dbApplication.status === 'rejected' && (
                <span className="px-2.5 py-1 rounded-lg bg-rose-50 text-rose-800 border border-rose-200 text-xs font-bold">
                  مرفوض
                </span>
              )}
            </div>

            <span className="text-xs font-mono text-[#64748B]">
              كود المرجع: <strong>{dbApplication.referenceCode}</strong>
            </span>
          </div>

          {/* Admin Feedback Box if needs_info or decision notes */}
          {dbApplication.adminNotes && (
            <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 space-y-1">
              <div className="font-bold flex items-center gap-1.5 text-amber-800">
                <AlertCircle className="w-3.5 h-3.5" />
                <span>ملاحظات وتوجيهات فريق الإدارة:</span>
              </div>
              <p className="leading-relaxed whitespace-pre-wrap">{dbApplication.adminNotes}</p>
            </div>
          )}

          {dbApplication.status === 'submitted' && (
            <p className="text-xs text-[#64748B] leading-relaxed">
              طلبك مسجل ومُرسل للإدارة للمراجعة وتدقيق المؤهلات. لا يمكنك تعديل البيانات حالياً إلا إذا طلبت الإدارة استكمال بيانات.
            </p>
          )}

          {dbApplication.status === 'approved' && (
            <p className="text-xs text-emerald-800 leading-relaxed font-bold">
              تهانينا! تم اعتماد ملفك التدريسي في منصة شاطر. يمكنك التواصل مع الإدارة لضبط جدول حصصك.
            </p>
          )}
        </div>
      )}

      {/* Page Header */}
      <div className="text-center space-y-2.5 mb-8">
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#EBF3FC] text-[#0D4E8B] text-xs font-bold border border-[#D1DCFE]">
          <GraduationCap className="w-3.5 h-3.5" />
          <span>استقطاب الكفاءات التعليمية المتميزة</span>
        </span>
        <h1 className="font-['Cairo'] text-2xl sm:text-3xl font-extrabold text-[#0D4E8B]">
          انضم إلى مجتمع معلّمي شاطر
        </h1>
        <p className="text-xs sm:text-sm text-[#535E7B] max-w-xl mx-auto leading-relaxed">
          نصلك بأولياء أمور يبحثون عن الكفاءة والالتزام في تدريس أبنائهم فردياً أونلاين. يرجى ملء بياناتك بعناية لمراجعتها قبل المقابلة التعريفية.
        </p>
      </div>

      {!showNoticeScreen ? (
        <form onSubmit={handleSubmitAction} className="space-y-6">
          {/* ========================================================================= */}
          {/* القسم ١: البيانات الأساسية والتواصل */}
          {/* ========================================================================= */}
          <div
            id="form-field-fullName"
            className="bg-white rounded-2xl sm:rounded-3xl shadow-xs border border-[#E2E8F0] p-5 sm:p-7 space-y-4"
          >
            <div className="flex items-center justify-between pb-3 border-b border-[#F1F5F9]">
              <h3 className="font-['Cairo'] text-sm sm:text-base font-bold text-[#0D4E8B] flex items-center gap-2">
                <span className="w-6 h-6 rounded-lg bg-[#0D4E8B] text-white text-xs flex items-center justify-center font-bold">
                  ١
                </span>
                <span>البيانات الأساسية وبيانات التواصل</span>
              </h3>
              <span className="text-[11px] text-red-500 font-bold">* حقول مطلوبة</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Full Name */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[#1F2A44] block">
                  الاسم الكامل <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.fullName}
                  onChange={(e) => handleInputChange('fullName', e.target.value)}
                  placeholder="مثال: أحمد عبد الله المنشاوي"
                  className={`w-full h-11 px-3.5 rounded-xl bg-[#F8F9FC] border text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-[#0D4E8B] focus:bg-white transition-all ${
                    errors.fullName ? 'border-red-400 bg-red-50/30' : 'border-[#CBD5E1]'
                  }`}
                />
                {errors.fullName && (
                  <p className="text-[11px] text-red-600 font-bold flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{errors.fullName}</span>
                  </p>
                )}
              </div>

              {/* Country Code & Phone */}
              <div id="form-field-phone" className="space-y-1.5">
                <label className="text-xs font-bold text-[#1F2A44] block">
                  الدولة ورقم الواتساب <span className="text-red-500">*</span>
                </label>
                <div className="flex gap-2">
                  <select
                    value={formData.countryCode}
                    onChange={(e) => handleInputChange('countryCode', e.target.value)}
                    className="h-11 px-2 sm:px-3 rounded-xl bg-[#F8F9FC] border border-[#CBD5E1] text-xs font-bold text-[#1F2A44] focus:outline-none focus:ring-2 focus:ring-[#0D4E8B]"
                  >
                    {COUNTRY_OPTIONS.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.name}
                      </option>
                    ))}
                  </select>

                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => handleInputChange('phone', e.target.value)}
                    placeholder={formData.countryCode === '+20' ? '1012345678' : 'رقم الواتساب'}
                    className={`flex-1 h-11 px-3.5 rounded-xl bg-[#F8F9FC] border text-xs sm:text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#0D4E8B] focus:bg-white transition-all text-left ${
                      errors.phone ? 'border-red-400 bg-red-50/30' : 'border-[#CBD5E1]'
                    }`}
                    dir="ltr"
                  />
                </div>
                <p className="text-[10px] text-[#64748B]">
                  {formData.countryCode === '+20'
                    ? 'يتم قبول الأرقام العربية والإنجليزية؛ احذف الصفر الأول تلقائياً عند كتابة +20'
                    : 'أدخل رقمك للتواصل المباشر عبر واتساب'}
                </p>
                {errors.phone && (
                  <p className="text-[11px] text-red-600 font-bold flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{errors.phone}</span>
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* ========================================================================= */}
          {/* القسم ٢: المسار والتخصصات التدريسية */}
          {/* ========================================================================= */}
          <div
            id="form-field-schoolSpecializations"
            className="bg-white rounded-2xl sm:rounded-3xl shadow-xs border border-[#E2E8F0] p-5 sm:p-7 space-y-5"
          >
            <div className="pb-3 border-b border-[#F1F5F9] space-y-1">
              <div className="flex items-center justify-between">
                <h3 className="font-['Cairo'] text-sm sm:text-base font-bold text-[#0D4E8B] flex items-center gap-2">
                  <span className="w-6 h-6 rounded-lg bg-[#0D4E8B] text-white text-xs flex items-center justify-center font-bold">
                    ٢
                  </span>
                  <span>المواد التي تتقنها</span>
                </h3>
              </div>
              <p className="text-xs text-[#535E7B] leading-relaxed">
                اختر المواد والصفوف التي تستطيع تدريسها بكفاءة؛ سنراجع تخصصاتك خلال المقابلة.
              </p>
            </div>

            {/* Track Switcher */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-[#1F2A44] block">المسار التدريسي الأساسي:</label>
              <div className="grid grid-cols-2 gap-3 max-w-md">
                <button
                  type="button"
                  onClick={() => handleInputChange('track', 'school')}
                  className={`py-3 px-4 rounded-xl font-['Cairo'] font-bold text-xs sm:text-sm border transition-all flex items-center justify-center gap-2 cursor-pointer ${
                    formData.track === 'school'
                      ? 'bg-[#0D4E8B] text-white border-[#0D4E8B] shadow-xs'
                      : 'bg-[#F8FAFD] text-[#535E7B] border-[#E2E8F0] hover:bg-[#F0F6FD]'
                  }`}
                >
                  <BookOpen className="w-4 h-4" />
                  <span>المناهج المدرسية</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleInputChange('track', 'quran')}
                  className={`py-3 px-4 rounded-xl font-['Cairo'] font-bold text-xs sm:text-sm border transition-all flex items-center justify-center gap-2 cursor-pointer ${
                    formData.track === 'quran'
                      ? 'bg-[#0D4E8B] text-white border-[#0D4E8B] shadow-xs'
                      : 'bg-[#F8FAFD] text-[#535E7B] border-[#E2E8F0] hover:bg-[#F0F6FD]'
                  }`}
                >
                  <Sparkles className="w-4 h-4" />
                  <span>القرآن والتأسيس</span>
                </button>
              </div>
            </div>

            {/* School Track: Structured Multi-Specializations */}
            {formData.track === 'school' ? (
              <div className="space-y-4 pt-1">
                {errors.schoolSpecializations && (
                  <p className="text-xs text-red-600 font-bold p-3 rounded-xl bg-red-50 border border-red-200 flex items-center gap-1.5">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{errors.schoolSpecializations}</span>
                  </p>
                )}

                <div className="space-y-4">
                  {formData.schoolSpecializations.map((spec, index) => {
                    const stageGrades = allGrades.filter((g) => g.stageId === spec.stageId);
                    return (
                      <div
                        key={spec.id}
                        className="p-4 sm:p-5 rounded-2xl bg-[#F8FAFD] border border-[#CBD5E1] space-y-4 relative transition-all"
                      >
                        {/* Header of Specialization Card */}
                        <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-[#E2E8F0]">
                          <div className="flex items-center gap-2">
                            <span className="w-6 h-6 rounded-md bg-[#0D4E8B]/10 text-[#0D4E8B] text-xs font-bold flex items-center justify-center">
                              {index + 1}
                            </span>
                            <span className="font-['Cairo'] font-bold text-xs sm:text-sm text-[#1F2A44]">
                              التخصص الدراسي رقم ({index + 1})
                            </span>
                          </div>

                          {formData.schoolSpecializations.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeSpecialization(spec.id)}
                              className="text-xs text-red-600 hover:text-red-700 font-bold flex items-center gap-1 px-2.5 py-1 rounded-lg hover:bg-red-50 transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>حذف هذا التخصص</span>
                            </button>
                          )}
                        </div>

                        {/* Subject Selection (Clearly separating Arabic & English teaching) */}
                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-[#1F2A44] flex items-center justify-between">
                            <span>المادة ولغة التدريس المعتمدة:</span>
                            <span className="text-[11px] font-normal text-[#64748B]">
                              سنراجع إتقانك للغة التدريس في المقابلة
                            </span>
                          </label>
                          <select
                            value={spec.subjectId}
                            onChange={(e) => updateSpecialization(spec.id, { subjectId: e.target.value })}
                            className="w-full h-11 px-3 rounded-xl bg-white border border-[#CBD5E1] text-xs sm:text-sm font-bold text-[#1F2A44] focus:outline-none focus:ring-2 focus:ring-[#0D4E8B]"
                          >
                            <optgroup label="الرياضيات واللغات">
                              {FORM_SUBJECT_DEFINITIONS.filter((s) => s.category === 'core').map((s) => (
                                <option key={s.id} value={s.id}>
                                  {s.label}
                                </option>
                              ))}
                            </optgroup>
                            <optgroup label="العلوم والتخصصات العلمية">
                              {FORM_SUBJECT_DEFINITIONS.filter((s) => s.category === 'sciences').map((s) => (
                                <option key={s.id} value={s.id}>
                                  {s.label}
                                </option>
                              ))}
                            </optgroup>
                            <optgroup label="اللغات والمواد الأدبية والاجتماعية">
                              {FORM_SUBJECT_DEFINITIONS.filter((s) => ['languages', 'social'].includes(s.category)).map((s) => (
                                <option key={s.id} value={s.id}>
                                  {s.label}
                                </option>
                              ))}
                            </optgroup>
                          </select>
                        </div>

                        {/* Curriculum & Stage Grids */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                          {/* Curriculum */}
                          <div className="space-y-1.5">
                            <label className="text-xs font-bold text-[#1F2A44] block">نوع المنهج:</label>
                            <select
                              value={spec.curriculumType}
                              onChange={(e) =>
                                updateSpecialization(spec.id, {
                                  curriculumType: e.target.value as CurriculumType,
                                })
                              }
                              className="w-full h-10 px-3 rounded-xl bg-white border border-[#CBD5E1] text-xs text-[#1F2A44] font-medium focus:outline-none focus:ring-2 focus:ring-[#0D4E8B]"
                            >
                              {curricula.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.name}
                                </option>
                              ))}
                            </select>
                          </div>

                          {/* Stage */}
                          <div className="space-y-1.5">
                            <label className="text-xs font-bold text-[#1F2A44] block">المرحلة الدراسية:</label>
                            <select
                              value={spec.stageId}
                              onChange={(e) =>
                                updateSpecialization(spec.id, {
                                  stageId: e.target.value as StageId,
                                })
                              }
                              className="w-full h-10 px-3 rounded-xl bg-white border border-[#CBD5E1] text-xs text-[#1F2A44] font-medium focus:outline-none focus:ring-2 focus:ring-[#0D4E8B]"
                            >
                              {stages.map((stg) => (
                                <option key={stg.id} value={stg.id}>
                                  {stg.name}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>

                        {/* Grades Checklist */}
                        <div className="space-y-2 pt-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-bold text-[#1F2A44]">الصفوف المحددة لهذا التخصص:</span>
                            <button
                              type="button"
                              onClick={() => selectAllGradesInSpecialization(spec.id, spec.stageId)}
                              className="text-[11px] text-[#0D4E8B] hover:underline font-bold cursor-pointer"
                            >
                              تحديد جميع صفوف المرحلة
                            </button>
                          </div>

                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {stageGrades.map((g) => {
                              const isChecked = spec.gradeIds.includes(g.id);
                              return (
                                <button
                                  key={g.id}
                                  type="button"
                                  onClick={() => toggleGradeInSpecialization(spec.id, g.id)}
                                  className={`p-2.5 rounded-xl border text-xs text-right transition-all flex items-center justify-between cursor-pointer ${
                                    isChecked
                                      ? 'bg-white border-[#0D4E8B] text-[#0D4E8B] font-bold shadow-xs'
                                      : 'bg-white/80 border-[#E2E8F0] text-[#64748B] hover:border-[#CBD5E1]'
                                  }`}
                                >
                                  <span className="truncate">{g.name}</span>
                                  {isChecked ? (
                                    <CheckSquare className="w-4 h-4 text-[#0D4E8B] shrink-0" />
                                  ) : (
                                    <Square className="w-4 h-4 text-slate-300 shrink-0" />
                                  )}
                                </button>
                              );
                            })}
                          </div>

                          {spec.gradeIds.length === 0 && (
                            <p className="text-[11px] text-red-500 font-bold">
                              * يرجى اختيار صف دراسي واحد على الأقل لهذا التخصص
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Add another specialization button */}
                <button
                  type="button"
                  onClick={addSpecialization}
                  className="w-full py-3 rounded-xl border-2 border-dashed border-[#0D4E8B]/40 hover:border-[#0D4E8B] bg-[#F0F6FD]/60 hover:bg-[#F0F6FD] text-[#0D4E8B] font-['Cairo'] font-bold text-xs sm:text-sm transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>إضافة تخصص دراسي آخر (مادة أو مرحلة أخرى)</span>
                </button>
              </div>
            ) : (
              /* Quran & Foundation Track Section */
              <div className="space-y-4 pt-1">
                {/* Quran Levels */}
                <div id="form-field-quranLevels" className="space-y-2">
                  <label className="text-xs font-bold text-[#1F2A44] block">
                    البرامج ومستويات التأسيس التي تتقنها: <span className="text-red-500">*</span>
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {quranLevels.map((lvl) => {
                      const isSelected = formData.quranLevels.includes(lvl.id);
                      return (
                        <button
                          key={lvl.id}
                          type="button"
                          onClick={() => toggleQuranLevel(lvl.id)}
                          className={`p-3.5 rounded-xl border text-right transition-all cursor-pointer flex flex-col justify-between gap-1.5 ${
                            isSelected
                              ? 'bg-white border-[#0D4E8B] shadow-xs'
                              : 'bg-[#F8FAFD] border-[#E2E8F0] hover:bg-white'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span
                              className={`text-xs font-bold ${
                                isSelected ? 'text-[#0D4E8B]' : 'text-[#1F2A44]'
                              }`}
                            >
                              {lvl.name}
                            </span>
                            {isSelected && <CheckCircle2 className="w-4 h-4 text-[#0D4E8B] shrink-0" />}
                          </div>
                          <span className="text-[11px] text-[#64748B] leading-relaxed">
                            {lvl.description}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  {errors.quranLevels && (
                    <p className="text-[11px] text-red-600 font-bold flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>{errors.quranLevels}</span>
                    </p>
                  )}
                </div>

                {/* Quran Age Groups */}
                <div id="form-field-quranAgeGroups" className="space-y-2 pt-2">
                  <label className="text-xs font-bold text-[#1F2A44] block">
                    الفئات العمرية التي تستطيع تدريسها بفاعلية: <span className="text-red-500">*</span>
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    {quranAgeGroups.map((age) => {
                      const isSelected = formData.quranAgeGroups.includes(age.id);
                      return (
                        <button
                          key={age.id}
                          type="button"
                          onClick={() => toggleQuranAgeGroup(age.id)}
                          className={`p-3 rounded-xl border text-right transition-all cursor-pointer flex items-center justify-between ${
                            isSelected
                              ? 'bg-white border-[#0D4E8B] text-[#0D4E8B] font-bold shadow-xs'
                              : 'bg-[#F8FAFD] border-[#E2E8F0] text-[#535E7B] hover:bg-white'
                          }`}
                        >
                          <div>
                            <div className="text-xs">{age.name}</div>
                            <div className="text-[10px] text-[#64748B] font-normal">{age.ageRange}</div>
                          </div>
                          {isSelected && <CheckCircle2 className="w-4 h-4 text-[#0D4E8B] shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                  {errors.quranAgeGroups && (
                    <p className="text-[11px] text-red-600 font-bold flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>{errors.quranAgeGroups}</span>
                    </p>
                  )}
                </div>

                {/* Quran extra notes */}
                <div className="space-y-1.5 pt-1">
                  <label className="text-xs font-bold text-[#1F2A44] block">
                    ملاحظات إضافية حول القراءات أو الإجازات (اختياري):
                  </label>
                  <input
                    type="text"
                    value={formData.quranNotes || ''}
                    onChange={(e) => handleInputChange('quranNotes', e.target.value)}
                    placeholder="مثال: مجاز برواية حفص عن عاصم، خبرة ٤ سنوات في تحفيظ البراعم"
                    className="w-full h-11 px-3.5 rounded-xl bg-[#F8F9FC] border border-[#CBD5E1] text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-[#0D4E8B] focus:bg-white transition-all"
                  />
                </div>
              </div>
            )}
          </div>

          {/* ========================================================================= */}
          {/* القسم ٣: المؤهلات الأكاديمية والخبرة */}
          {/* ========================================================================= */}
          <div
            id="form-field-academicDegree"
            className="bg-white rounded-2xl sm:rounded-3xl shadow-xs border border-[#E2E8F0] p-5 sm:p-7 space-y-4"
          >
            <div className="pb-3 border-b border-[#F1F5F9]">
              <h3 className="font-['Cairo'] text-sm sm:text-base font-bold text-[#0D4E8B] flex items-center gap-2">
                <span className="w-6 h-6 rounded-lg bg-[#0D4E8B] text-white text-xs flex items-center justify-center font-bold">
                  ٣
                </span>
                <span>المؤهلات الأكاديمية والخبرة</span>
              </h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Academic Degree */}
              <div className="space-y-1.5 sm:col-span-2">
                <label className="text-xs font-bold text-[#1F2A44] block">
                  المؤهل الأكاديمي والتخصص والجامعة <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.academicDegree}
                  onChange={(e) => handleInputChange('academicDegree', e.target.value)}
                  placeholder="مثال: بكالوريوس تربية — قسم لغة إنجليزية — جامعة عين شمس (تقدير جيد جداً)"
                  className={`w-full h-11 px-3.5 rounded-xl bg-[#F8F9FC] border text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-[#0D4E8B] focus:bg-white transition-all ${
                    errors.academicDegree ? 'border-red-400 bg-red-50/30' : 'border-[#CBD5E1]'
                  }`}
                />
                {errors.academicDegree && (
                  <p className="text-[11px] text-red-600 font-bold flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{errors.academicDegree}</span>
                  </p>
                )}
              </div>

              {/* Years of Experience */}
              <div id="form-field-experienceYears" className="space-y-1.5">
                <label className="text-xs font-bold text-[#1F2A44] block">
                  سنوات الخبرة الإجمالية في التدريس <span className="text-red-500">*</span>
                </label>
                <select
                  value={formData.experienceYears}
                  onChange={(e) => handleInputChange('experienceYears', e.target.value)}
                  className={`w-full h-11 px-3 rounded-xl bg-[#F8F9FC] border text-xs sm:text-sm font-bold text-[#1F2A44] focus:outline-none focus:ring-2 focus:ring-[#0D4E8B] ${
                    errors.experienceYears ? 'border-red-400 bg-red-50/30' : 'border-[#CBD5E1]'
                  }`}
                >
                  <option value="">اختر سنوات الخبرة</option>
                  {EXPERIENCE_YEARS_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
                {errors.experienceYears && (
                  <p className="text-[11px] text-red-600 font-bold flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{errors.experienceYears}</span>
                  </p>
                )}
              </div>

              {/* Online Teaching Experience (Yes/No) */}
              <div id="form-field-hasOnlineExperience" className="space-y-1.5">
                <label className="text-xs font-bold text-[#1F2A44] block">
                  هل لديك خبرة سابقة في التدريس أونلاين؟ <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-2 gap-2 h-11">
                  <button
                    type="button"
                    onClick={() => handleInputChange('hasOnlineExperience', 'yes')}
                    className={`rounded-xl border text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                      formData.hasOnlineExperience === 'yes'
                        ? 'bg-[#0D4E8B] text-white border-[#0D4E8B]'
                        : 'bg-[#F8FAFD] border-[#CBD5E1] text-[#535E7B]'
                    }`}
                  >
                    <Laptop className="w-3.5 h-3.5" />
                    <span>نعم، لدي خبرة</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleInputChange('hasOnlineExperience', 'no')}
                    className={`rounded-xl border text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                      formData.hasOnlineExperience === 'no'
                        ? 'bg-[#0D4E8B] text-white border-[#0D4E8B]'
                        : 'bg-[#F8FAFD] border-[#CBD5E1] text-[#535E7B]'
                    }`}
                  >
                    <span>جديد في الأونلاين</span>
                  </button>
                </div>
                {errors.hasOnlineExperience && (
                  <p className="text-[11px] text-red-600 font-bold flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{errors.hasOnlineExperience}</span>
                  </p>
                )}
              </div>
            </div>

            {/* Online Details (Shown if Yes) */}
            {formData.hasOnlineExperience === 'yes' && (
              <div id="form-field-onlineExperienceDetails" className="space-y-1.5 pt-1 animate-fade-in">
                <label className="text-xs font-bold text-[#1F2A44] block">
                  المنصات والأدوات المستخدمة في التدريس عن بُعد: <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.onlineExperienceDetails}
                  onChange={(e) => handleInputChange('onlineExperienceDetails', e.target.value)}
                  placeholder="مثال: Zoom، Google Meet، لوح رسم رقمي Wacom، منصات تفاعلية"
                  className={`w-full h-11 px-3.5 rounded-xl bg-[#F8F9FC] border text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-[#0D4E8B] focus:bg-white transition-all ${
                    errors.onlineExperienceDetails ? 'border-red-400 bg-red-50/30' : 'border-[#CBD5E1]'
                  }`}
                />
                {errors.onlineExperienceDetails && (
                  <p className="text-[11px] text-red-600 font-bold flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{errors.onlineExperienceDetails}</span>
                  </p>
                )}
              </div>
            )}

            {/* Bio and Teaching Methodology */}
            <div id="form-field-bioAndMethodology" className="space-y-1.5 pt-1">
              <label className="text-xs font-bold text-[#1F2A44] block">
                نبذة قصيرة عن خبرتك وأسلوبك في الشرح وتبسيط المعلومة: <span className="text-red-500">*</span>
              </label>
              <textarea
                rows={3}
                value={formData.bioAndMethodology}
                onChange={(e) => handleInputChange('bioAndMethodology', e.target.value)}
                placeholder="صف أسلوبك في التعامل مع الطلاب، وكيفية معالجة نقاط الضعف الدراسية وتحفيز الطفل على الفهم المستمر..."
                className={`w-full p-3.5 rounded-xl bg-[#F8F9FC] border text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-[#0D4E8B] focus:bg-white transition-all leading-relaxed ${
                  errors.bioAndMethodology ? 'border-red-400 bg-red-50/30' : 'border-[#CBD5E1]'
                }`}
              />
              {errors.bioAndMethodology && (
                <p className="text-[11px] text-red-600 font-bold flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{errors.bioAndMethodology}</span>
                </p>
              )}
            </div>

            {/* Video or Portfolio URL */}
            <div id="form-field-portfolioUrl" className="space-y-1.5 pt-1">
              <label className="text-xs font-bold text-[#1F2A44] flex items-center justify-between">
                <span>رابط فيديو شرح أو ملف تعريفي (اختياري):</span>
                <span className="text-[11px] text-[#64748B] font-normal">يزيد من سرعة اعتماد الملف</span>
              </label>
              <input
                type="url"
                value={formData.portfolioUrl}
                onChange={(e) => handleInputChange('portfolioUrl', e.target.value)}
                placeholder="https://youtube.com/... أو رابط Google Drive"
                className={`w-full h-11 px-3.5 rounded-xl bg-[#F8F9FC] border text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-[#0D4E8B] focus:bg-white transition-all text-left ${
                  errors.portfolioUrl ? 'border-red-400 bg-red-50/30' : 'border-[#CBD5E1]'
                }`}
                dir="ltr"
              />
              {errors.portfolioUrl && (
                <p className="text-[11px] text-red-600 font-bold flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{errors.portfolioUrl}</span>
                </p>
              )}
            </div>
          </div>

          {/* ========================================================================= */}
          {/* القسم ٤: التسعير ومواعيد التفرغ */}
          {/* ========================================================================= */}
          <div
            id="form-field-suggestedHourlyRate"
            className="bg-white rounded-2xl sm:rounded-3xl shadow-xs border border-[#E2E8F0] p-5 sm:p-7 space-y-4"
          >
            <div className="pb-3 border-b border-[#F1F5F9]">
              <h3 className="font-['Cairo'] text-sm sm:text-base font-bold text-[#0D4E8B] flex items-center gap-2">
                <span className="w-6 h-6 rounded-lg bg-[#0D4E8B] text-white text-xs flex items-center justify-center font-bold">
                  ٤
                </span>
                <span>السعر المقترح ومواعيد التفرغ</span>
              </h3>
            </div>

            {/* Pricing Info Banner */}
            <div className="p-3.5 rounded-xl bg-[#EBF3FC] border border-[#CBD5E1] text-[#0D4E8B] text-xs leading-relaxed flex items-start gap-2.5">
              <Info className="w-4 h-4 shrink-0 text-[#0D4E8B] mt-0.5" />
              <div>
                <strong>تنويه التسعير والحصص:</strong> السعر المقترح يُراجع مع إدارة شاطر أثناء المقابلة قبل نشر الملف بما يضمن التوافق العادل. ونؤكد أن <strong>الحصة التجريبية الأولى مجانية تماماً ومدتها ٢٠ دقيقة</strong> دون أي التزام مالي على ولي الأمر.
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Suggested Rate */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[#1F2A44] block">
                  سعر الحصة المقترح <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min="50"
                    step="10"
                    value={formData.suggestedHourlyRate}
                    onChange={(e) => handleInputChange('suggestedHourlyRate', e.target.value)}
                    placeholder="مثال: 150"
                    className={`w-full h-11 px-3 rounded-xl bg-[#F8F9FC] border text-xs sm:text-sm font-bold text-[#1F2A44] focus:outline-none focus:ring-2 focus:ring-[#0D4E8B] ${
                      errors.suggestedHourlyRate ? 'border-red-400 bg-red-50/30' : 'border-[#CBD5E1]'
                    }`}
                  />
                </div>
                {errors.suggestedHourlyRate && (
                  <p className="text-[11px] text-red-600 font-bold flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{errors.suggestedHourlyRate}</span>
                  </p>
                )}
              </div>

              {/* Currency */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[#1F2A44] block">العملة:</label>
                <select
                  value={formData.currency}
                  onChange={(e) => handleInputChange('currency', e.target.value)}
                  className="w-full h-11 px-3 rounded-xl bg-[#F8F9FC] border border-[#CBD5E1] text-xs font-bold text-[#1F2A44] focus:outline-none focus:ring-2 focus:ring-[#0D4E8B]"
                >
                  <option value="ج.م">جنيه مصري (ج.م)</option>
                  <option value="ر.س">ريال سعودي (ر.س)</option>
                  <option value="د.إ">درهم إماراتي (د.إ)</option>
                  <option value="د.ك">دينار كويتي (د.ك)</option>
                  <option value="$">دولار أمريكي ($)</option>
                </select>
              </div>

              {/* Duration of paid session */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[#1F2A44] block">مدة الحصة المدفوعة:</label>
                <select
                  value={formData.sessionDurationMinutes}
                  onChange={(e) => handleInputChange('sessionDurationMinutes', Number(e.target.value))}
                  className="w-full h-11 px-3 rounded-xl bg-[#F8F9FC] border border-[#CBD5E1] text-xs font-bold text-[#1F2A44] focus:outline-none focus:ring-2 focus:ring-[#0D4E8B]"
                >
                  <option value={50}>٥٠ دقيقة (الأساسي)</option>
                  <option value={60}>٦٠ دقيقة (ساعة كاملة)</option>
                </select>
              </div>
            </div>

            {/* General Availability Days */}
            <div id="form-field-availableDays" className="space-y-2 pt-2">
              <label className="text-xs font-bold text-[#1F2A44] block">
                أيام التفرغ الممكنة للدروس: <span className="text-red-500">*</span>
              </label>
              <div className="flex flex-wrap gap-2">
                {WEEK_DAYS_OPTIONS.map((day) => {
                  const isSelected = formData.availableDays.includes(day);
                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() => toggleDay(day)}
                      className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-[#0D4E8B] text-white border-[#0D4E8B] shadow-xs'
                          : 'bg-[#F8FAFD] text-[#535E7B] border-[#CBD5E1] hover:bg-white'
                      }`}
                    >
                      {day}
                    </button>
                  );
                })}
              </div>
              {errors.availableDays && (
                <p className="text-[11px] text-red-600 font-bold flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{errors.availableDays}</span>
                </p>
              )}
            </div>

            {/* Preferred Times of day */}
            <div id="form-field-preferredTimes" className="space-y-2 pt-2">
              <label className="text-xs font-bold text-[#1F2A44] block">
                الفترات المفضلة لتقديم الحصص: <span className="text-red-500">*</span>
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {PREFERRED_TIMES_OPTIONS.map((time) => {
                  const isSelected = formData.preferredTimes.includes(time);
                  return (
                    <button
                      key={time}
                      type="button"
                      onClick={() => toggleTime(time)}
                      className={`p-3 rounded-xl border text-right text-xs transition-all cursor-pointer flex items-center justify-between ${
                        isSelected
                          ? 'bg-white border-[#0D4E8B] text-[#0D4E8B] font-bold shadow-xs'
                          : 'bg-[#F8FAFD] border-[#CBD5E1] text-[#535E7B] hover:bg-white'
                      }`}
                    >
                      <span>{time}</span>
                      {isSelected && <CheckCircle2 className="w-4 h-4 text-[#0D4E8B] shrink-0" />}
                    </button>
                  );
                })}
              </div>
              {errors.preferredTimes && (
                <p className="text-[11px] text-red-600 font-bold flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{errors.preferredTimes}</span>
                </p>
              )}
            </div>

            <p className="text-[11px] text-[#64748B] leading-relaxed pt-1">
              * هذه بيانات تفرغ أولية للتقييم والتنسيق، وليست مواعيد منشورة أو حجوزات نهائية في الجدول.
            </p>
          </div>

          {/* ========================================================================= */}
          {/* القسم ٥: المراجعة وسياسة التعاون */}
          {/* ========================================================================= */}
          <div
            id="form-field-terms"
            className="bg-white rounded-2xl sm:rounded-3xl shadow-xs border border-[#E2E8F0] p-5 sm:p-7 space-y-4"
          >
            <div className="pb-3 border-b border-[#F1F5F9]">
              <h3 className="font-['Cairo'] text-sm sm:text-base font-bold text-[#0D4E8B] flex items-center gap-2">
                <span className="w-6 h-6 rounded-lg bg-[#0D4E8B] text-white text-xs flex items-center justify-center font-bold">
                  ٥
                </span>
                <span>المراجعة والموافقة على سياسة التعاون</span>
              </h3>
            </div>

            {/* Notice Banner */}
            <div className="p-3.5 sm:p-4 rounded-2xl bg-amber-50/90 border border-amber-200/90 text-right space-y-1">
              <div className="flex items-center gap-1.5 text-xs sm:text-sm font-bold text-amber-900">
                <AlertCircle className="w-4 h-4 text-amber-700 shrink-0" />
                <span>تنويه قبل إرسال طلب الانضمام</span>
              </div>
              <p className="text-xs text-amber-800 leading-relaxed">
                تقديم هذا الطلب يخضع للمراجعة وتدقيق المؤهلات الأكاديمية والمقابلة التعريفية من قِبل إدارة شاطر قبل اعتماد المعلم ونشر ملفه، ولا يعني القبول التلقائي.
              </p>
            </div>

            {/* Mandatory Checkbox and Policy Link */}
            <div className="p-4 rounded-2xl bg-[#F8FAFD] border border-[#CBD5E1] space-y-2">
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  id="tutor-policy-checkbox"
                  checked={formData.termsAccepted}
                  onChange={(e) => handleInputChange('termsAccepted', e.target.checked)}
                  className="w-4 h-4 rounded text-[#0D4E8B] accent-[#0D4E8B] mt-0.5 shrink-0 cursor-pointer"
                />
                <div className="text-xs sm:text-sm text-[#1F2A44] leading-relaxed">
                  <label htmlFor="tutor-policy-checkbox" className="font-bold cursor-pointer">
                    قرأت سياسة التعاون مع شاطر وأوافق عليها
                  </label>
                  <div className="mt-1">
                    <button
                      type="button"
                      onClick={() => setIsPolicyModalOpen(true)}
                      className="inline-flex items-center gap-1.5 text-xs font-bold text-[#0D4E8B] hover:text-[#003767] underline underline-offset-4 decoration-[#0D4E8B]/40 hover:decoration-[#0D4E8B] transition-colors cursor-pointer"
                    >
                      <FileText className="w-3.5 h-3.5 text-[#0D4E8B] shrink-0" />
                      <span>اضغط هنا لقراءة وثيقة «سياسة التعاون مع المعلمين — منصة شاطر» (الإصدار 1.0)</span>
                    </button>
                  </div>
                </div>
              </div>

              {errors.terms && (
                <p className="text-xs text-red-600 font-bold pr-7 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{errors.terms}</span>
                </p>
              )}
            </div>

            {/* Action Buttons */}
            <div className="pt-2 flex flex-col items-center gap-3">
              <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
                {/* Save Draft Button */}
                <button
                  type="button"
                  onClick={handleSaveDraftToDb}
                  disabled={isSavingDb}
                  className="w-full sm:w-auto px-6 py-3.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-[#1F2A44] font-['Cairo'] font-bold text-xs sm:text-sm transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isSavingDb ? (
                    <Loader2 className="w-4 h-4 animate-spin text-[#0D4E8B]" />
                  ) : (
                    <Save className="w-4 h-4 text-[#0D4E8B]" />
                  )}
                  <span>حفظ كمسودة في حسابي</span>
                </button>

                {/* Submit Final Button */}
                <button
                  type="button"
                  onClick={handleSubmitFinalToDb}
                  disabled={isSavingDb}
                  className="w-full sm:w-auto px-8 py-3.5 rounded-xl bg-[#0D4E8B] hover:bg-[#003767] text-white font-['Cairo'] font-bold text-xs sm:text-sm shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98] disabled:opacity-50"
                >
                  {isSavingDb ? (
                    <Loader2 className="w-4 h-4 animate-spin text-white" />
                  ) : (
                    <Send className="w-4 h-4 text-white" />
                  )}
                  <span>إرسال الطلب للمراجعة والاعتماد</span>
                  <ArrowLeft className="w-4 h-4" />
                </button>
              </div>

              <span className="text-center text-[#64748B] text-xs">
                لا نطلب أي رسوم تقديم أو بيانات دفع في هذه المرحلة التمهيدية.
              </span>
            </div>
          </div>
        </form>
      ) : (
        /* ========================================================================= */
        /* شاشة مراجعة البيانات قبل فتح واتساب مع إمكانية التعديل */
        /* ========================================================================= */
        <div className="bg-white rounded-3xl shadow-sm border border-[#E2E8F0] p-6 sm:p-8 space-y-6 animate-fade-in text-right">
          <div className="text-center space-y-2 pb-4 border-b border-[#E2E8F0]">
            <div className="w-14 h-14 mx-auto rounded-full bg-[#EBF3FC] text-[#0D4E8B] flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8 text-[#0D4E8B]" />
            </div>
            <h2 className="font-['Cairo'] text-xl sm:text-2xl font-bold text-[#0D4E8B]">
              ملخص طلب الانضمام الجاهز للإرسال
            </h2>
            <p className="text-xs sm:text-sm text-[#535E7B] max-w-lg mx-auto leading-relaxed">
              راجع بياناتك بعناية قبل التوجيه إلى واتساب إدارة شاطر. يمكنك تعديل أي بيان في أي وقت.
            </p>
          </div>

          {/* Review Details Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            {/* Card 1: Personal & Contact */}
            <div className="p-4 rounded-2xl bg-[#F8FAFD] border border-[#E2E8F0] space-y-2">
              <h4 className="font-['Cairo'] font-bold text-[#0D4E8B] pb-1 border-b border-[#E2E8F0] flex items-center gap-1.5">
                <Users className="w-4 h-4" />
                <span>البيانات الأساسية</span>
              </h4>
              <ul className="space-y-1.5 text-slate-700">
                <li>• <strong>الاسم:</strong> {formData.fullName}</li>
                <li>• <strong>الهاتف:</strong> {formData.countryCode} {normalizePhone(formData.phone, formData.countryCode)}</li>
                <li>• <strong>المسار:</strong> {formData.track === 'school' ? 'المناهج المدرسية' : 'القرآن والتأسيس'}</li>
              </ul>
            </div>

            {/* Card 2: Pricing & Availability */}
            <div className="p-4 rounded-2xl bg-[#F8FAFD] border border-[#E2E8F0] space-y-2">
              <h4 className="font-['Cairo'] font-bold text-[#0D4E8B] pb-1 border-b border-[#E2E8F0] flex items-center gap-1.5">
                <DollarSign className="w-4 h-4" />
                <span>السعر والتفرغ</span>
              </h4>
              <ul className="space-y-1.5 text-slate-700">
                <li>• <strong>السعر المقترح:</strong> {formData.suggestedHourlyRate} {formData.currency} / {formData.sessionDurationMinutes} دقيقة</li>
                <li>• <strong>الحصة التجريبية:</strong> مجانية تماماً (٢٠ دقيقة)</li>
                <li>• <strong>أيام التفرغ:</strong> {formData.availableDays.join('، ')}</li>
              </ul>
            </div>

            {/* Card 3: Specializations */}
            <div className="p-4 rounded-2xl bg-[#F8FAFD] border border-[#E2E8F0] space-y-2 md:col-span-2">
              <h4 className="font-['Cairo'] font-bold text-[#0D4E8B] pb-1 border-b border-[#E2E8F0] flex items-center gap-1.5">
                <BookOpen className="w-4 h-4" />
                <span>التخصصات المحددة للتدريس</span>
              </h4>
              {formData.track === 'school' ? (
                <div className="space-y-2">
                  {formData.schoolSpecializations.map((spec, i) => {
                    const subjDef = FORM_SUBJECT_DEFINITIONS.find((d) => d.id === spec.subjectId);
                    const currObj = curricula.find((c) => c.id === spec.curriculumType);
                    const stageObj = stages.find((s) => s.id === spec.stageId);
                    const gradeNames = spec.gradeIds
                      .map((gid) => allGrades.find((g) => g.id === gid)?.name)
                      .filter(Boolean)
                      .join('، ');

                    return (
                      <div key={spec.id} className="p-2.5 rounded-xl bg-white border border-[#CBD5E1] text-xs space-y-1">
                        <div className="font-bold text-[#0D4E8B]">
                          {i + 1}. {subjDef ? subjDef.label : spec.subjectId}
                        </div>
                        <div className="text-slate-600">
                          المنهج: {currObj ? currObj.name : spec.curriculumType} | المرحلة: {stageObj ? stageObj.name : spec.stageId}
                        </div>
                        <div className="text-slate-500 text-[11px]">
                          الصفوف: {gradeNames || 'جميع صفوف المرحلة'}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="space-y-1.5 text-slate-700">
                  <div>• <strong>البرامج المتقنة:</strong> {formData.quranLevels.map((l) => quranLevels.find((ql) => ql.id === l)?.name).filter(Boolean).join('، ')}</div>
                  <div>• <strong>الفئات العمرية:</strong> {formData.quranAgeGroups.map((a) => quranAgeGroups.find((qa) => qa.id === a)?.name).filter(Boolean).join('، ')}</div>
                  {formData.quranNotes && <div>• <strong>ملاحظات:</strong> {formData.quranNotes}</div>}
                </div>
              )}
            </div>

            {/* Card 4: Academic Degree & Experience */}
            <div className="p-4 rounded-2xl bg-[#F8FAFD] border border-[#E2E8F0] space-y-2 md:col-span-2">
              <h4 className="font-['Cairo'] font-bold text-[#0D4E8B] pb-1 border-b border-[#E2E8F0] flex items-center gap-1.5">
                <GraduationCap className="w-4 h-4" />
                <span>المؤهلات والخبرة التدريسية</span>
              </h4>
              <ul className="space-y-1.5 text-slate-700">
                <li>• <strong>المؤهل الأكاديمي والجامعة:</strong> {formData.academicDegree}</li>
                <li>• <strong>سنوات الخبرة:</strong> {formData.experienceYears}</li>
                <li>• <strong>التدريس أونلاين:</strong> {formData.hasOnlineExperience === 'yes' ? `نعم (${formData.onlineExperienceDetails})` : 'لا'}</li>
                <li>• <strong>نبذة عن أسلوب التدريس:</strong> {formData.bioAndMethodology}</li>
                {formData.portfolioUrl && <li>• <strong>رابط الشرح/السيرة:</strong> {formData.portfolioUrl}</li>}
                <li className="text-emerald-700 font-bold pt-1">
                  • <strong>إقرار السياسة:</strong> أقرّ بقراءة سياسة التعاون مع شاطر والموافقة عليها — الإصدار 1.0
                </li>
              </ul>
            </div>
          </div>

          {/* Submission and Action Buttons */}
          <div className="pt-2 space-y-3.5">
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <a
                href={formData.termsAccepted ? getApplicationWhatsAppUrl() : undefined}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => {
                  if (!formData.termsAccepted) {
                    e.preventDefault();
                    return;
                  }
                  trackTeacherApplicationWhatsAppClicked();
                }}
                className={`w-full sm:w-auto px-8 py-3.5 rounded-xl font-['Cairo'] font-bold text-xs sm:text-sm shadow-sm flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  formData.termsAccepted
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white active:scale-95'
                    : 'bg-slate-300 text-slate-500 cursor-not-allowed pointer-events-none'
                }`}
              >
                <MessageCircle className="w-4 h-4" />
                <span>متابعة التقديم عبر واتساب</span>
              </a>

              <button
                type="button"
                onClick={handleCopyApplicationData}
                className="w-full sm:w-auto px-6 py-3.5 rounded-xl text-xs sm:text-sm font-bold bg-[#EBF3FC] text-[#0D4E8B] hover:bg-[#D1DCFE] border border-[#CBD5E1] transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
              >
                {copiedMessage ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                <span>{copiedMessage ? 'تم نسخ بيانات الطلب بنجاح' : 'نسخ بيانات الطلب'}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowNoticeScreen(false);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className="w-full sm:w-auto px-6 py-3.5 rounded-xl text-xs sm:text-sm font-bold bg-[#F2F3F6] text-[#1F2A44] hover:bg-[#E2E8F0] transition-colors cursor-pointer"
              >
                تعديل بيانات النموذج
              </button>
            </div>

            <p className="text-[11px] sm:text-xs text-[#64748B] text-center max-w-lg mx-auto leading-relaxed">
              فتح واتساب يجهّز رسالة طلب الانضمام المسبقة إلى رقم المنصة <strong>201107889984</strong>؛ إرسال الطلب يتم عبر واتساب، ولا يُعد فتح التطبيق إرسالاً تلقائياً أو تسجيلاً للموافقة في قاعدة البيانات ما دامت نقطة الاستقبال الآلي قيد التجهيز.
            </p>
          </div>
        </div>
      )}

      {/* Trust Pillars */}
      <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 rounded-2xl bg-white border border-[#E2E8F0] shadow-xs flex items-start gap-3">
          <div className="w-8 h-8 rounded-xl bg-[#D1DCFE] text-[#0D4E8B] flex items-center justify-center shrink-0">
            <CreditCard className="w-4 h-4" />
          </div>
          <div>
            <h4 className="font-['Cairo'] text-xs sm:text-sm font-bold text-[#0D4E8B]">تسعير عادل ودخل مستقر</h4>
            <p className="text-xs text-[#64748B] mt-0.5 leading-relaxed">
              أنت من يحدد سعر حصتك بالساعة بالاتفاق، مع شفافية تامة في المستحقات.
            </p>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-[#E2E8F0] shadow-xs flex items-start gap-3">
          <div className="w-8 h-8 rounded-xl bg-[#D1DCFE] text-[#0D4E8B] flex items-center justify-center shrink-0">
            <Users className="w-4 h-4" />
          </div>
          <div>
            <h4 className="font-['Cairo'] text-xs sm:text-sm font-bold text-[#0D4E8B]">طلاب جادون وأولياء أمور معتمدون</h4>
            <p className="text-xs text-[#64748B] mt-0.5 leading-relaxed">
              نوفر لك بيئة تدريس راقية تتواصل فيها مباشرة مع أولياء أمور يبحثون عن الكفاءة.
            </p>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-[#E2E8F0] shadow-xs flex items-start gap-3">
          <div className="w-8 h-8 rounded-xl bg-[#D1DCFE] text-[#0D4E8B] flex items-center justify-center shrink-0">
            <Clock className="w-4 h-4" />
          </div>
          <div>
            <h4 className="font-['Cairo'] text-xs sm:text-sm font-bold text-[#0D4E8B]">مرونة تامة في أوقات الحصص</h4>
            <p className="text-xs text-[#64748B] mt-0.5 leading-relaxed">
              جدول مواعيدك الإلكتروني بيدك بالكامل، بما يلائم وقتك وظروفك.
            </p>
          </div>
        </div>
      </div>

      {/* Tutor Cooperation Policy Modal */}
      <TutorCooperationPolicyModal
        isOpen={isPolicyModalOpen}
        onClose={() => setIsPolicyModalOpen(false)}
        onAccept={() => handleInputChange('termsAccepted', true)}
        isAccepted={formData.termsAccepted}
      />

      {/* Tutor Auth Modal (Sign Up / Sign In / Password Reset) */}
      <TutorAuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        initialMode={authModalMode}
        onSuccess={(user) => {
          setCurrentUser(user);
          loadMyApplication();
        }}
      />
    </div>
  );
};
