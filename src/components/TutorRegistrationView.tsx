import React, { useState, useEffect } from 'react';
import {
  TrackType,
  StageId,
  CurriculumType,
  TutorApplicationFormData,
  Stage,
  Subject,
  CurriculumOption,
  QuranAgeGroup,
  QuranLevel,
} from '../types';
import { DataService } from '../services/dataService';
import { SHATIR_CONFIG } from '../config/shatirConfig';
import {
  Loader2,
  Info,
  BookOpen,
  Sparkles,
  Clock,
  ArrowLeft,
  MessageCircle,
  CreditCard,
  Users,
  ShieldCheck,
} from 'lucide-react';

const INITIAL_FORM: TutorApplicationFormData = {
  fullName: '',
  countryCode: '+20',
  phone: '',
  track: 'school',
  subjects: [],
  stages: [],
  curricula: [],
  quranAgeGroups: [],
  quranLevels: [],
  experienceYears: '',
  academicDegree: '',
  portfolioUrl: '',
  termsAccepted: false,
};

const DRAFT_KEY = 'shatir_tutor_app_draft_v2';

export const TutorRegistrationView: React.FC = () => {
  const [formData, setFormData] = useState<TutorApplicationFormData>(INITIAL_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showNoticeScreen, setShowNoticeScreen] = useState<boolean>(false);

  // Live options loaded from Supabase
  const [stages, setStages] = useState<Stage[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [curricula, setCurricula] = useState<CurriculumOption[]>([]);
  const [quranAgeGroups, setQuranAgeGroups] = useState<QuranAgeGroup[]>([]);
  const [quranLevels, setQuranLevels] = useState<QuranLevel[]>([]);

  useEffect(() => {
    Promise.all([
      DataService.getStages().catch(() => []),
      DataService.getSubjects().catch(() => []),
      DataService.getCurriculumOptions().catch(() => []),
      DataService.getQuranAgeGroups().catch(() => []),
      DataService.getQuranLevels().catch(() => []),
    ]).then(([stgs, subjs, currs, qAges, qLvls]) => {
      setStages(stgs);
      setSubjects(subjs);
      setCurricula(currs);
      setQuranAgeGroups(qAges);
      setQuranLevels(qLvls);
    });
  }, []);

  // Restore saved input draft if available
  useEffect(() => {
    try {
      const saved = localStorage.getItem(DRAFT_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        setFormData((prev) => ({ ...prev, ...parsed }));
      }
    } catch (e) {
      // Local storage unavailable
    }
  }, []);

  const saveDraft = (updated: TutorApplicationFormData) => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(updated));
    } catch (e) {
      // Ignore
    }
  };

  const handleInputChange = (field: keyof TutorApplicationFormData, value: any) => {
    setFormData((prev) => {
      const updated = { ...prev, [field]: value };
      saveDraft(updated);
      return updated;
    });

    if (errors[field]) {
      setErrors((prev) => {
        const copy = { ...prev };
        delete copy[field];
        return copy;
      });
    }
  };

  const toggleSubject = (subjId: string) => {
    const list = formData.subjects.includes(subjId)
      ? formData.subjects.filter((s) => s !== subjId)
      : [...formData.subjects, subjId];
    handleInputChange('subjects', list);
  };

  const toggleStage = (stageId: StageId) => {
    const list = formData.stages.includes(stageId)
      ? formData.stages.filter((s) => s !== stageId)
      : [...formData.stages, stageId];
    handleInputChange('stages', list);
  };

  const toggleCurriculum = (curriculum: CurriculumType) => {
    const list = formData.curricula.includes(curriculum)
      ? formData.curricula.filter((c) => c !== curriculum)
      : [...formData.curricula, curriculum];
    handleInputChange('curricula', list);
  };

  const toggleQuranAge = (ageId: string) => {
    const list = formData.quranAgeGroups.includes(ageId)
      ? formData.quranAgeGroups.filter((a) => a !== ageId)
      : [...formData.quranAgeGroups, ageId];
    handleInputChange('quranAgeGroups', list);
  };

  const toggleQuranLevel = (levelId: string) => {
    const list = formData.quranLevels.includes(levelId)
      ? formData.quranLevels.filter((l) => l !== levelId)
      : [...formData.quranLevels, levelId];
    handleInputChange('quranLevels', list);
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.fullName.trim() || formData.fullName.trim().split(' ').length < 2) {
      newErrors.fullName = 'يرجى إدخال الاسم كاملاً (ثنائي أو ثلاثي)';
    }

    const cleanPhone = formData.phone.replace(/[^0-9]/g, '');
    if (!cleanPhone || cleanPhone.length < 8) {
      newErrors.phone = 'يرجى إدخال رقم واتساب صحيح للتواصل';
    }

    if (formData.track === 'school') {
      if (formData.subjects.length === 0) {
        newErrors.subjects = 'يرجى تحديد مادة واحدة على الأقل تتقن تدريسها';
      }
      if (formData.stages.length === 0) {
        newErrors.stages = 'يرجى اختيار مرحلة دراسية واحدة على الأقل';
      }
    } else {
      if (formData.quranAgeGroups.length === 0) {
        newErrors.quranAgeGroups = 'يرجى اختيار فئة عمرية واحدة على الأقل';
      }
      if (formData.quranLevels.length === 0) {
        newErrors.quranLevels = 'يرجى اختيار برنامج أو مستوى واحد على الأقل';
      }
    }

    if (!formData.academicDegree.trim()) {
      newErrors.academicDegree = 'يرجى تدوين المؤهل الأكاديمي والجامعة المتخرج منها';
    }

    if (!formData.termsAccepted) {
      newErrors.terms = 'يرجى الموافقة على شروط التواصل وتدقيق المؤهلات للمتابعة';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Requirement 11: Do NOT claim the application was saved to the database.
  // Instead, explain that the automated receiving endpoint is being prepared and provide direct WhatsApp coordination.
  const handleSubmitAction = (e: React.FormEvent) => {
    e.preventDefault();
    const isValid = validateForm();
    if (!isValid) return;
    setShowNoticeScreen(true);
  };

  const buildApplicationWhatsAppMessage = (): string => {
    const number = SHATIR_CONFIG.adminWhatsAppNumber.replace(/[^0-9]/g, '');
    const trackText = formData.track === 'school' ? 'المناهج المدرسية' : 'مسار القرآن والتأسيس';
    
    const lines = [
      `السلام عليكم ورحمة الله وبركاته، فريق إدارة شاطر كلاسيز 👋`,
      `أود التقديم للانضمام كمعلم معتمد في منصة شاطر، وإليكم بياناتي الأولية:`,
      ``,
      `• الاسم: ${formData.fullName}`,
      `• هاتف الواتساب: ${formData.countryCode} ${formData.phone}`,
      `• المسار التدريسي: ${trackText}`,
      `• المؤهل الأكاديمي: ${formData.academicDegree}`,
      `• سنوات الخبرة: ${formData.experienceYears || 'غير محدد'}`,
    ];

    if (formData.portfolioUrl) {
      lines.push(`• نموذج تدريس / سيرة: ${formData.portfolioUrl}`);
    }

    lines.push(``);
    lines.push(`أرجو مراجعة بياناتي والتنسيق معي للمقابلة التعريفية. شكراً لكم!`);

    return `https://wa.me/${number}?text=${encodeURIComponent(lines.join('\n'))}`;
  };

  return (
    <div className="w-full max-w-4xl mx-auto py-6 sm:py-8 px-4 sm:px-6 animate-fade-in">
      {/* Header */}
      <div className="text-center space-y-2 mb-8">
        <h1 className="font-['Cairo'] text-2xl sm:text-3xl font-extrabold text-[#0D4E8B]">
          انضم إلى مجتمع معلّمي شاطر
        </h1>
        <p className="text-xs sm:text-sm text-[#535E7B] max-w-lg mx-auto leading-relaxed">
          نصلك بأولياء أمور يبحثون عن الكفاءة والالتزام. خطوات بسيطة تفصلك عن بدء التدريس التفاعلي الفردي.
        </p>
      </div>

      {!showNoticeScreen ? (
        <div className="bg-white rounded-3xl shadow-sm border border-[#E2E8F0] p-6 sm:p-8 space-y-6">
          <form onSubmit={handleSubmitAction} className="space-y-6">
            {/* 1. Personal & Contact Information */}
            <div className="space-y-4">
              <h3 className="font-['Cairo'] text-base font-bold text-[#0D4E8B] pb-2 border-b border-[#E2E8F0] flex items-center gap-2">
                <span>١. البيانات الشخصية وبيانات التواصل</span>
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[#1F2A44] block">
                    الاسم الكامل <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.fullName}
                    onChange={(e) => handleInputChange('fullName', e.target.value)}
                    placeholder="مثال: أحمد عبد الله المنشاوي"
                    className="w-full h-11 px-3.5 rounded-xl bg-[#F8F9FC] border border-[#CBD5E1] text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-[#0D4E8B] focus:bg-white transition-all"
                  />
                  {errors.fullName && (
                    <p className="text-[11px] text-red-600 font-bold mt-1 px-1">{errors.fullName}</p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[#1F2A44] block">
                    رقم الواتساب للتواصل <span className="text-red-500">*</span>
                  </label>
                  <div className="flex gap-2">
                    <select
                      value={formData.countryCode}
                      onChange={(e) => handleInputChange('countryCode', e.target.value)}
                      className="h-11 px-2.5 rounded-xl bg-[#F8F9FC] border border-[#CBD5E1] text-xs font-bold focus:outline-none focus:ring-2 focus:ring-[#0D4E8B]"
                      dir="ltr"
                    >
                      <option value="+20">+20 (مصر)</option>
                      <option value="+966">+966 (السعودية)</option>
                      <option value="+971">+971 (الإمارات)</option>
                      <option value="+965">+965 (الكويت)</option>
                    </select>
                    <input
                      type="tel"
                      value={formData.phone}
                      onChange={(e) => handleInputChange('phone', e.target.value)}
                      placeholder="رقم الواتساب"
                      className="flex-1 h-11 px-3.5 rounded-xl bg-[#F8F9FC] border border-[#CBD5E1] text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-[#0D4E8B] focus:bg-white transition-all"
                      dir="ltr"
                    />
                  </div>
                  {errors.phone && (
                    <p className="text-[11px] text-red-600 font-bold mt-1 px-1">{errors.phone}</p>
                  )}
                </div>
              </div>
            </div>

            {/* 2. Track & Specialization */}
            <div className="space-y-4 pt-2">
              <h3 className="font-['Cairo'] text-base font-bold text-[#0D4E8B] pb-2 border-b border-[#E2E8F0] flex items-center gap-2">
                <span>٢. مسار التدريس والتخصص المطلوب</span>
              </h3>

              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => handleInputChange('track', 'school')}
                  className={`p-3.5 rounded-2xl border text-right transition-all flex items-center gap-2.5 cursor-pointer ${
                    formData.track === 'school'
                      ? 'border-[#0D4E8B] bg-[#F0F6FD] text-[#0D4E8B] font-bold shadow-sm'
                      : 'border-[#CBD5E1] bg-white text-[#1F2A44] hover:bg-[#F8F9FC]'
                  }`}
                >
                  <BookOpen className="w-5 h-5" />
                  <span className="text-xs sm:text-sm">المناهج المدرسية (Math / Science / عربي)</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleInputChange('track', 'quran')}
                  className={`p-3.5 rounded-2xl border text-right transition-all flex items-center gap-2.5 cursor-pointer ${
                    formData.track === 'quran'
                      ? 'border-[#0D4E8B] bg-[#F0F6FD] text-[#0D4E8B] font-bold shadow-sm'
                      : 'border-[#CBD5E1] bg-white text-[#1F2A44] hover:bg-[#F8F9FC]'
                  }`}
                >
                  <Sparkles className="w-5 h-5" />
                  <span className="text-xs sm:text-sm">مسار القرآن الكريم ونور البيان</span>
                </button>
              </div>

              {formData.track === 'school' ? (
                <div className="space-y-4 pt-2">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-[#1F2A44] block">
                      المواد التي تتقن تدريسها <span className="text-red-500">*</span>
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {subjects.map((subj) => {
                        const isSelected = formData.subjects.includes(subj.id);
                        return (
                          <button
                            key={subj.id}
                            type="button"
                            onClick={() => toggleSubject(subj.id)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-all cursor-pointer ${
                              isSelected
                                ? 'bg-[#0D4E8B] text-white border-[#0D4E8B] font-bold'
                                : 'bg-[#F8F9FC] text-[#1F2A44] border-[#CBD5E1] hover:bg-[#E2E8F0]'
                            }`}
                          >
                            {subj.name}
                          </button>
                        );
                      })}
                    </div>
                    {errors.subjects && (
                      <p className="text-[11px] text-red-600 font-bold mt-1">{errors.subjects}</p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-[#1F2A44] block">
                      المراحل الدراسية <span className="text-red-500">*</span>
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {stages.map((stg) => {
                        const isSelected = formData.stages.includes(stg.id);
                        return (
                          <button
                            key={stg.id}
                            type="button"
                            onClick={() => toggleStage(stg.id)}
                            className={`px-3.5 py-1.5 rounded-xl text-xs font-medium border transition-all cursor-pointer ${
                              isSelected
                                ? 'bg-[#0D4E8B] text-white border-[#0D4E8B] font-bold'
                                : 'bg-[#F8F9FC] text-[#1F2A44] border-[#CBD5E1] hover:bg-[#E2E8F0]'
                            }`}
                          >
                            {stg.name}
                          </button>
                        );
                      })}
                    </div>
                    {errors.stages && (
                      <p className="text-[11px] text-red-600 font-bold mt-1">{errors.stages}</p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-4 pt-2">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-[#1F2A44] block">
                      الفئات العمرية التي تتقن تدريسها <span className="text-red-500">*</span>
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {quranAgeGroups.map((ag) => {
                        const isSelected = formData.quranAgeGroups.includes(ag.id);
                        return (
                          <button
                            key={ag.id}
                            type="button"
                            onClick={() => toggleQuranAge(ag.id)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-all cursor-pointer ${
                              isSelected
                                ? 'bg-[#0D4E8B] text-white border-[#0D4E8B] font-bold'
                                : 'bg-[#F8F9FC] text-[#1F2A44] border-[#CBD5E1] hover:bg-[#E2E8F0]'
                            }`}
                          >
                            {ag.name} ({ag.ageRange})
                          </button>
                        );
                      })}
                    </div>
                    {errors.quranAgeGroups && (
                      <p className="text-[11px] text-red-600 font-bold mt-1">{errors.quranAgeGroups}</p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-[#1F2A44] block">
                      البرامج والمستويات <span className="text-red-500">*</span>
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {quranLevels.map((lvl) => {
                        const isSelected = formData.quranLevels.includes(lvl.id);
                        return (
                          <button
                            key={lvl.id}
                            type="button"
                            onClick={() => toggleQuranLevel(lvl.id)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-all cursor-pointer ${
                              isSelected
                                ? 'bg-[#0D4E8B] text-white border-[#0D4E8B] font-bold'
                                : 'bg-[#F8F9FC] text-[#1F2A44] border-[#CBD5E1] hover:bg-[#E2E8F0]'
                            }`}
                          >
                            {lvl.name}
                          </button>
                        );
                      })}
                    </div>
                    {errors.quranLevels && (
                      <p className="text-[11px] text-red-600 font-bold mt-1">{errors.quranLevels}</p>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* 3. Qualifications */}
            <div className="space-y-4 pt-2">
              <h3 className="font-['Cairo'] text-base font-bold text-[#0D4E8B] pb-2 border-b border-[#E2E8F0] flex items-center gap-2">
                <span>٣. المؤهل الأكاديمي وسنوات الخبرة</span>
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[#1F2A44] block">
                    المؤهل الأكاديمي والجامعة <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.academicDegree}
                    onChange={(e) => handleInputChange('academicDegree', e.target.value)}
                    placeholder="مثال: بكالوريوس تربية قسم رياضيات - جامعة عين شمس"
                    className="w-full h-11 px-3.5 rounded-xl bg-[#F8F9FC] border border-[#CBD5E1] text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-[#0D4E8B] focus:bg-white transition-all"
                  />
                  {errors.academicDegree && (
                    <p className="text-[11px] text-red-600 font-bold mt-1">{errors.academicDegree}</p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[#1F2A44] block">
                    سنوات الخبرة الفعلية في التدريس
                  </label>
                  <select
                    value={formData.experienceYears}
                    onChange={(e) => handleInputChange('experienceYears', e.target.value)}
                    className="w-full h-11 px-3.5 rounded-xl bg-[#F8F9FC] border border-[#CBD5E1] text-xs sm:text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#0D4E8B] cursor-pointer"
                  >
                    <option value="">اختر سنوات الخبرة</option>
                    <option value="1_3">من سنة إلى 3 سنوات</option>
                    <option value="4_6">من 4 إلى 6 سنوات</option>
                    <option value="7_10">من 7 إلى 10 سنوات</option>
                    <option value="10_plus">أكثر من 10 سنوات</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[#1F2A44] block">
                  رابط فيديو شرح أو ملف تعريفي (اختياري)
                </label>
                <input
                  type="url"
                  value={formData.portfolioUrl}
                  onChange={(e) => handleInputChange('portfolioUrl', e.target.value)}
                  placeholder="https://youtube.com/... أو رابط Google Drive"
                  className="w-full h-11 px-3.5 rounded-xl bg-[#F8F9FC] border border-[#CBD5E1] text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-[#0D4E8B] focus:bg-white transition-all"
                  dir="ltr"
                />
              </div>
            </div>

            {/* 4. Terms */}
            <div className="pt-2">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.termsAccepted}
                  onChange={(e) => handleInputChange('termsAccepted', e.target.checked)}
                  className="w-4 h-4 rounded text-[#0D4E8B] accent-[#0D4E8B] mt-0.5 shrink-0"
                />
                <div className="text-xs text-[#1F2A44] leading-relaxed">
                  أوافق على قيام فريق شاطر بمراجعة مؤهلاتي والتواصل معي عبر واتساب لتنسيق المقابلة واختبار التدريس.
                </div>
              </label>
              {errors.terms && (
                <p className="text-[11px] text-red-600 font-bold mt-1 px-1">{errors.terms}</p>
              )}
            </div>

            {/* Submit Button */}
            <div className="pt-2 flex flex-col items-center gap-3">
              <button
                type="submit"
                className="w-full sm:w-auto px-10 py-3.5 rounded-xl bg-[#0D4E8B] hover:bg-[#003767] text-white font-['Cairo'] font-bold text-sm shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>متابعة تقديم الطلب</span>
                <ArrowLeft className="w-4 h-4" />
              </button>

              <span className="text-center text-[#64748B] text-xs">
                لا نطلب أي رسوم تقديم أو بيانات دفع في هذه المرحلة التمهيدية.
              </span>
            </div>
          </form>
        </div>
      ) : (
        /* Requirement 11: Transparent screen - point of automated receipt is in progress, direct WhatsApp coordination available */
        <div className="bg-white rounded-3xl shadow-sm border border-[#E2E8F0] p-8 text-center transition-all animate-fade-in space-y-6">
          <div className="w-16 h-16 mx-auto rounded-full bg-[#F0F6FD] border border-[#D1DCFE] text-[#0D4E8B] flex items-center justify-center text-3xl">
            <Info className="w-8 h-8 text-[#0D4E8B]" />
          </div>

          <div className="space-y-2 max-w-lg mx-auto">
            <h2 className="font-['Cairo'] text-2xl font-bold text-[#0D4E8B]">
              نقطة الاستقبال الآلي قيد التجهيز
            </h2>
            <p className="text-xs sm:text-sm text-[#1F2A44] leading-relaxed">
              أهلاً بك يا {formData.fullName.trim() || 'معلمنا الفاضل'}. نعمل حالياً على تدشين نقطة المعالجة الآلية لطلبات المعلمين.
            </p>
            <p className="text-xs text-[#535E7B] leading-relaxed">
              يسعدنا استلام بياناتك ومؤهلاتك مباشرة عبر واتساب الإدارة لبدء التدقيق وتحديد موعد المقابلة التعريفية فوراً دون تأخير.
            </p>
          </div>

          <div className="max-w-md mx-auto p-4 rounded-2xl bg-[#F8F9FC] border border-[#E2E8F0] text-right space-y-2 text-xs text-[#535E7B]">
            <h4 className="font-['Cairo'] font-bold text-[#0D4E8B]">بياناتك الجاهزة للمشاركة مع الإدارة:</h4>
            <ul className="space-y-1 text-slate-700">
              <li>• <strong>المتقدم:</strong> {formData.fullName}</li>
              <li>• <strong>الهاتف:</strong> {formData.countryCode} {formData.phone}</li>
              <li>• <strong>المؤهل:</strong> {formData.academicDegree}</li>
              <li>• <strong>المسار:</strong> {formData.track === 'school' ? 'المناهج المدرسية' : 'القرآن والتأسيس'}</li>
            </ul>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <a
              href={buildApplicationWhatsAppMessage()}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full sm:w-auto px-7 py-3 rounded-xl font-['Cairo'] font-bold text-xs sm:text-sm bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm flex items-center justify-center gap-2 transition-all cursor-pointer"
            >
              <MessageCircle className="w-4 h-4" />
              <span>إرسال البيانات ومتابعة الانضمام عبر واتساب</span>
            </a>

            <button
              type="button"
              onClick={() => setShowNoticeScreen(false)}
              className="w-full sm:w-auto px-5 py-3 rounded-xl text-xs font-bold bg-[#F2F3F6] text-[#1F2A44] hover:bg-[#E2E8F0] transition-colors cursor-pointer"
            >
              تعديل بيانات النموذج
            </button>
          </div>
        </div>
      )}

      {/* Trust Pillars */}
      <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 rounded-2xl bg-white border border-[#E2E8F0] shadow-sm flex items-start gap-3">
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

        <div className="p-4 rounded-2xl bg-white border border-[#E2E8F0] shadow-sm flex items-start gap-3">
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

        <div className="p-4 rounded-2xl bg-white border border-[#E2E8F0] shadow-sm flex items-start gap-3">
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
    </div>
  );
};
