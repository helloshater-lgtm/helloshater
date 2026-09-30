import React, { useState } from 'react';
import {
  TrackType,
  StageId,
  CurriculumType,
  TutorApplicationFormData,
  TutorApplicationRecord,
} from '../types';
import { DataService } from '../services/dataService';
import { buildTutorFollowUpWhatsAppUrl } from '../config/shatirConfig';
import {
  FileText,
  AlertTriangle,
  Loader2,
  CheckCircle2,
  XCircle,
  ShieldCheck,
  Info,
  RotateCcw,
  BookOpen,
  Sparkles,
  Clock,
  ArrowLeft,
  MessageCircle,
  CreditCard,
  Users,
} from 'lucide-react';

type ScreenSimulationState = 'initial' | 'validation' | 'submitting' | 'success' | 'failed';

const INITIAL_FORM: TutorApplicationFormData = {
  fullName: 'د. هاني ممدوح عبد الرحمن',
  countryCode: '+966',
  phone: '50 839 2190',
  track: 'school',
  subjects: ['math', 'physics'],
  stages: ['secondary', 'preparatory'],
  curricula: ['national_arabic', 'languages_experimental'],
  quranAgeGroups: ['age_4_7', 'age_8_12'],
  quranLevels: ['noor_bayan', 'hifz_tilawa'],
  experienceYears: '5_8',
  academicDegree: 'بكالوريوس علوم وتربية - قسم الرياضيات البحتة والفيزياء',
  portfolioUrl: 'https://youtube.com/watch?v=sample-lesson-preview',
  termsAccepted: true,
};

const ALL_SUBJECT_OPTIONS = [
  { id: 'math', label: 'الرياضيات (Math)' },
  { id: 'physics', label: 'الفيزياء (Physics)' },
  { id: 'science', label: 'العلوم (Science)' },
  { id: 'chemistry', label: 'الكيمياء' },
  { id: 'english', label: 'اللغة الإنجليزية' },
  { id: 'arabic', label: 'اللغة العربية' },
  { id: 'biology', label: 'الأحياء (Biology)' },
  { id: 'social', label: 'الدراسات الاجتماعية' },
];

const DRAFT_KEY = 'shatir_tutor_app_draft_v1';

export const TutorRegistrationView: React.FC = () => {
  const [activeState, setActiveState] = useState<ScreenSimulationState>('initial');
  const [formData, setFormData] = useState<TutorApplicationFormData>(INITIAL_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submittedRecord, setSubmittedRecord] = useState<TutorApplicationRecord | null>(null);

  // Restore saved input draft if available
  React.useEffect(() => {
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

    if (!formData.fullName.trim() || formData.fullName.trim().split(' ').length < 3) {
      newErrors.fullName = 'يرجى إدخال الاسم كاملاً (ثلاثي أو رباعي) كما في الهوية';
    }

    const cleanPhone = formData.phone.replace(/[^0-9]/g, '');
    if (!cleanPhone || cleanPhone.length < 8) {
      newErrors.phone = 'يرجى إدخال رقم واتساب صحيح مكوّن من أرقام فقط للتواصل';
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

  const setScreenState = (state: ScreenSimulationState) => {
    setActiveState(state);
    if (state === 'validation') {
      setErrors({
        fullName: 'يرجى إدخال الاسم كاملاً (ثلاثي أو رباعي)',
        phone: 'يرجى إدخال رقم واتساب صحيح',
        terms: 'يرجى الموافقة على شروط التواصل وتدقيق المؤهلات للاستمرار',
      });
    } else if (state === 'initial') {
      setErrors({});
    } else if (state === 'success' && !submittedRecord) {
      setSubmittedRecord({
        ...formData,
        id: 'demo_record_8492',
        referenceCode: '#SHTR-2025-8492',
        createdAt: new Date().toISOString(),
        status: 'pending_review',
      });
    }
  };

  const handleSubmitAction = async () => {
    if (activeState === 'submitting') return; // Prevent double submission

    const isValid = validateForm();
    if (!isValid) {
      setActiveState('validation');
      return;
    }

    setActiveState('submitting');
    try {
      const record = await DataService.submitTutorApplication(formData, false);
      setSubmittedRecord(record);
      setActiveState('success');
    } catch (err: any) {
      setActiveState('failed');
    }
  };

  const followUpWhatsAppUrl = buildTutorFollowUpWhatsAppUrl(
    submittedRecord?.referenceCode || '#SHTR-2025-8492',
    formData.fullName.trim() || 'د. هاني ممدوح'
  );

  return (
    <div className="w-full max-w-4xl mx-auto py-6 sm:py-8 px-4 sm:px-6 animate-fade-in">
      {/* 1. State Simulation Navigator Bar */}
      <div className="mb-6 p-3 bg-[#EDEBF1]/80 rounded-2xl border border-[#E2E8F0] shadow-sm flex flex-col md:flex-row items-center justify-between gap-3">
        <span className="text-xs font-bold text-[#1F2A44]">
          استعراض حالات النظام الفورية:
        </span>
        <div className="flex flex-wrap items-center gap-1.5 justify-center">
          <button
            type="button"
            onClick={() => setScreenState('initial')}
            className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-1 cursor-pointer ${
              activeState === 'initial'
                ? 'bg-[#0D4E8B] text-white shadow-sm'
                : 'bg-white text-[#1F2A44] hover:bg-[#E2E8F0]'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>1. نموذج أولي</span>
          </button>
          <button
            type="button"
            onClick={() => setScreenState('validation')}
            className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-1 cursor-pointer ${
              activeState === 'validation'
                ? 'bg-[#0D4E8B] text-white shadow-sm'
                : 'bg-white text-[#1F2A44] hover:bg-[#E2E8F0]'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
            <span>2. أخطاء التحقق</span>
          </button>
          <button
            type="button"
            onClick={() => setScreenState('submitting')}
            className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-1 cursor-pointer ${
              activeState === 'submitting'
                ? 'bg-[#0D4E8B] text-white shadow-sm'
                : 'bg-white text-[#1F2A44] hover:bg-[#E2E8F0]'
            }`}
          >
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span>3. جاري الإرسال</span>
          </button>
          <button
            type="button"
            onClick={() => setScreenState('success')}
            className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-1 cursor-pointer ${
              activeState === 'success'
                ? 'bg-[#0D4E8B] text-white shadow-sm'
                : 'bg-white text-[#1F2A44] hover:bg-[#E2E8F0]'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
            <span>4. نجاح الحفظ</span>
          </button>
          <button
            type="button"
            onClick={() => setScreenState('failed')}
            className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-1 cursor-pointer ${
              activeState === 'failed'
                ? 'bg-[#0D4E8B] text-white shadow-sm'
                : 'bg-white text-[#1F2A44] hover:bg-[#E2E8F0]'
            }`}
          >
            <XCircle className="w-3.5 h-3.5 text-red-500" />
            <span>5. تعذر الإرسال</span>
          </button>
        </div>
      </div>

      {/* Screen Title & Intro Header */}
      <div className="mb-6 text-right space-y-2">
        <h1 className="font-['Cairo'] text-2xl sm:text-3xl font-extrabold text-[#0D4E8B]">
          انضم إلى معلمي شاطر
        </h1>
        <p className="text-xs sm:text-sm text-[#535E7B] leading-relaxed max-w-2xl">
          عرّفنا بخبرتك وتخصصك. يراجع فريق شاطر طلبك بعناية، ثم يتواصل معك عبر واتساب لاستكمال الخطوات وإجراء المقابلة التعريفية.
        </p>

        {/* Transparency Notice */}
        <div className="mt-3 p-3.5 rounded-2xl bg-[#F2F3F6] border border-[#E2E8F0] flex items-start gap-2.5">
          <Info className="w-4 h-4 text-[#0D4E8B] shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <h4 className="font-['Cairo'] text-xs font-bold text-[#0D4E8B]">
              إشعار الشفافية والقبول الأكاديمي
            </h4>
            <p className="text-xs text-[#535E7B] leading-relaxed">
              ملاحظة هامة: إرسال طلب الانضمام هو خطوة أولى لمراجعة المؤهلات والخبرات، ولا يعني القبول التلقائي أو الإدراج الفوري في المنصة. تتم مقابلة واختبار جميع المعلمين قبل الاعتماد.
            </p>
          </div>
        </div>
      </div>

      {/* Error Banner for Failed State */}
      {activeState === 'failed' && (
        <div className="mb-5 p-4 rounded-2xl bg-red-50 border border-red-200 text-red-900 shadow-sm flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <div className="flex-1 space-y-1.5">
            <h4 className="font-['Cairo'] text-sm font-bold text-red-800">
              تعذر إرسال الطلب مؤقتاً
            </h4>
            <p className="text-xs text-red-700 leading-relaxed">
              حدث انقطاع مؤقت في الاتصال بالخادم. بياناتك محفوظة بأمان في النموذج أدناه.
            </p>
            <button
              type="button"
              onClick={handleSubmitAction}
              className="px-3.5 py-1.5 rounded-xl bg-red-600 text-white font-bold text-xs flex items-center gap-1.5 hover:bg-red-700 transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>إعادة المحاولة الآن</span>
            </button>
          </div>
        </div>
      )}

      {/* Form Container */}
      {activeState !== 'success' && (
        <div className="bg-white rounded-3xl shadow-md border border-[#E2E8F0] p-6 sm:p-8 transition-all">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSubmitAction();
            }}
            className="space-y-8"
          >
            {/* 1. Personal & Contact Details */}
            <div>
              <div className="flex items-center gap-2.5 mb-5 pb-2 border-b border-[#F2F3F6]">
                <span className="w-7 h-7 rounded-full bg-[#D1DCFE] text-[#0D4E8B] flex items-center justify-center font-['Cairo'] font-bold text-xs">
                  ١
                </span>
                <div>
                  <h2 className="font-['Cairo'] text-base sm:text-lg font-bold text-[#0D4E8B]">
                    البيانات الشخصية ووسائل التواصل
                  </h2>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-[#1F2A44] flex items-center justify-between">
                    <span>الاسم الكامل <span className="text-red-500">*</span></span>
                  </label>
                  <input
                    type="text"
                    value={formData.fullName}
                    onChange={(e) => handleInputChange('fullName', e.target.value)}
                    placeholder="الاسم الثلاثي أو الرباعي كما في الهوية"
                    className={`w-full h-11 px-3.5 rounded-xl border text-xs sm:text-sm font-medium text-[#1F2A44] focus:outline-none focus:ring-2 focus:ring-[#0D4E8B] transition-all ${
                      errors.fullName ? 'border-red-400 bg-red-50/30' : 'border-[#CBD5E1] bg-[#F8F9FC]'
                    }`}
                  />
                  {errors.fullName && (
                    <p className="text-[11px] text-red-600 mt-0.5">{errors.fullName}</p>
                  )}
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-[#1F2A44] flex items-center justify-between">
                    <span>رقم واتساب المعتمد <span className="text-red-500">*</span></span>
                  </label>
                  <div className="flex items-center gap-2" dir="ltr">
                    <div className="relative w-32 shrink-0">
                      <select
                        value={formData.countryCode}
                        onChange={(e) => handleInputChange('countryCode', e.target.value)}
                        className="w-full h-11 px-2.5 rounded-xl bg-[#F2F3F6] border border-[#CBD5E1] text-[#1F2A44] font-medium text-xs focus:outline-none appearance-none cursor-pointer"
                      >
                        <option value="+20">🇪🇬 مصر (+20)</option>
                        <option value="+966">🇸🇦 السعودية (+966)</option>
                        <option value="+971">🇦🇪 الإمارات (+971)</option>
                        <option value="+965">🇰🇼 الكويت (+965)</option>
                        <option value="+974">🇶🇦 قطر (+974)</option>
                        <option value="+968">🇴🇲 عُمان (+968)</option>
                        <option value="+962">🇯🇴 الأردن (+962)</option>
                      </select>
                    </div>

                    <input
                      type="tel"
                      dir="ltr"
                      value={formData.phone}
                      onChange={(e) => handleInputChange('phone', e.target.value)}
                      placeholder="50 123 4567"
                      className={`flex-1 h-11 px-3.5 rounded-xl border text-xs sm:text-sm font-medium text-[#1F2A44] focus:outline-none focus:ring-2 focus:ring-[#0D4E8B] transition-all text-left ${
                        errors.phone ? 'border-red-400 bg-red-50/30' : 'border-[#CBD5E1] bg-[#F8F9FC]'
                      }`}
                    />
                  </div>
                  {errors.phone && (
                    <p className="text-[11px] text-red-600 mt-0.5">{errors.phone}</p>
                  )}
                </div>
              </div>
            </div>

            {/* 2. Teaching Track & Specialization */}
            <div>
              <div className="flex items-center gap-2.5 mb-5 pb-2 border-b border-[#F2F3F6]">
                <span className="w-7 h-7 rounded-full bg-[#D1DCFE] text-[#0D4E8B] flex items-center justify-center font-['Cairo'] font-bold text-xs">
                  ٢
                </span>
                <div>
                  <h2 className="font-['Cairo'] text-base sm:text-lg font-bold text-[#0D4E8B]">
                    المسار والتخصص التعليمي
                  </h2>
                </div>
              </div>

              {/* Track Selection Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 mb-5">
                <button
                  type="button"
                  onClick={() => handleInputChange('track', 'school')}
                  className={`p-3.5 rounded-2xl border text-right transition-all flex items-center gap-3 cursor-pointer ${
                    formData.track === 'school'
                      ? 'bg-[#0D4E8B] text-white border-[#0D4E8B] shadow-sm'
                      : 'bg-[#F8F9FC] text-[#1F2A44] border-[#E2E8F0] hover:bg-[#F2F3F6]'
                  }`}
                >
                  <BookOpen className="w-5 h-5 shrink-0" />
                  <div>
                    <h4 className="font-['Cairo'] text-xs sm:text-sm font-bold">
                      المناهج والمقررات المدرسية
                    </h4>
                    <p className={`text-[11px] mt-0.5 ${formData.track === 'school' ? 'text-white/80' : 'text-[#64748B]'}`}>
                      رياضيات، علوم، لغات، فيزياء وكيمياء
                    </p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => handleInputChange('track', 'quran')}
                  className={`p-3.5 rounded-2xl border text-right transition-all flex items-center gap-3 cursor-pointer ${
                    formData.track === 'quran'
                      ? 'bg-[#0D4E8B] text-white border-[#0D4E8B] shadow-sm'
                      : 'bg-[#F8F9FC] text-[#1F2A44] border-[#E2E8F0] hover:bg-[#F2F3F6]'
                  }`}
                >
                  <Sparkles className="w-5 h-5 shrink-0" />
                  <div>
                    <h4 className="font-['Cairo'] text-xs sm:text-sm font-bold">
                      مسار القرآن الكريم والتأسيس
                    </h4>
                    <p className={`text-[11px] mt-0.5 ${formData.track === 'quran' ? 'text-white/80' : 'text-[#64748B]'}`}>
                      نور البيان، حفظ وتجويد، وتحسين الخط
                    </p>
                  </div>
                </button>
              </div>

              {/* School Fields */}
              {formData.track === 'school' ? (
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-[#1F2A44] block">
                      المواد التي تتقن تدريسها (اختر مادة أو أكثر) <span className="text-red-500">*</span>
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {ALL_SUBJECT_OPTIONS.map((subj) => {
                        const isSelected = formData.subjects.includes(subj.id);
                        return (
                          <button
                            key={subj.id}
                            type="button"
                            onClick={() => toggleSubject(subj.id)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1 cursor-pointer ${
                              isSelected
                                ? 'bg-[#0D4E8B] text-white shadow-sm'
                                : 'bg-[#F8F9FC] text-[#1F2A44] border border-[#CBD5E1] hover:bg-[#F2F3F6]'
                            }`}
                          >
                            <span>{subj.label}</span>
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
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <label className="flex items-center gap-2.5 p-3 rounded-xl bg-[#F8F9FC] border border-[#E2E8F0] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formData.stages.includes('secondary')}
                          onChange={() => toggleStage('secondary')}
                          className="w-4 h-4 text-[#0D4E8B] accent-[#0D4E8B]"
                        />
                        <span className="text-xs font-bold text-[#1F2A44]">المرحلة الثانوية</span>
                      </label>

                      <label className="flex items-center gap-2.5 p-3 rounded-xl bg-[#F8F9FC] border border-[#E2E8F0] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formData.stages.includes('preparatory')}
                          onChange={() => toggleStage('preparatory')}
                          className="w-4 h-4 text-[#0D4E8B] accent-[#0D4E8B]"
                        />
                        <span className="text-xs font-bold text-[#1F2A44]">المرحلة الإعدادية</span>
                      </label>

                      <label className="flex items-center gap-2.5 p-3 rounded-xl bg-[#F8F9FC] border border-[#E2E8F0] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formData.stages.includes('elementary')}
                          onChange={() => toggleStage('elementary')}
                          className="w-4 h-4 text-[#0D4E8B] accent-[#0D4E8B]"
                        />
                        <span className="text-xs font-bold text-[#1F2A44]">المرحلة الابتدائية</span>
                      </label>
                    </div>
                    {errors.stages && (
                      <p className="text-[11px] text-red-600 font-bold mt-1">{errors.stages}</p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-[#1F2A44] block">
                      أنظمة التعليم
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <label className="flex items-center gap-2.5 p-2.5 rounded-xl bg-[#F8F9FC] border border-[#E2E8F0] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formData.curricula.includes('national_arabic')}
                          onChange={() => toggleCurriculum('national_arabic')}
                          className="w-4 h-4 text-[#0D4E8B] accent-[#0D4E8B]"
                        />
                        <span className="text-xs text-[#1F2A44]">عربي حكومي</span>
                      </label>

                      <label className="flex items-center gap-2.5 p-2.5 rounded-xl bg-[#F8F9FC] border border-[#E2E8F0] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formData.curricula.includes('languages_experimental')}
                          onChange={() => toggleCurriculum('languages_experimental')}
                          className="w-4 h-4 text-[#0D4E8B] accent-[#0D4E8B]"
                        />
                        <span className="text-xs text-[#1F2A44]">لغات / تجريبي</span>
                      </label>

                      <label className="flex items-center gap-2.5 p-2.5 rounded-xl bg-[#F8F9FC] border border-[#E2E8F0] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formData.curricula.includes('international')}
                          onChange={() => toggleCurriculum('international')}
                          className="w-4 h-4 text-[#0D4E8B] accent-[#0D4E8B]"
                        />
                        <span className="text-xs text-[#1F2A44]">مناهج دولية (IG / SAT)</span>
                      </label>
                    </div>
                  </div>
                </div>
              ) : (
                /* Quran Track */
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-[#1F2A44] block">
                      الفئات العمرية المستهدفة
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                      {[
                        { id: 'age_4_7', label: 'أطفال (٤ - ٧ سنوات)' },
                        { id: 'age_8_12', label: 'ناشئة (٨ - ١٢ سنة)' },
                        { id: 'age_13_18', label: 'يافعون وشباب' },
                        { id: 'age_adults', label: 'كبار ومحو أمية' },
                      ].map((ag) => (
                        <label
                          key={ag.id}
                          className="flex items-center gap-2 p-2.5 rounded-xl bg-[#F8F9FC] border border-[#E2E8F0] cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={formData.quranAgeGroups.includes(ag.id)}
                            onChange={() => toggleQuranAge(ag.id)}
                            className="w-4 h-4 text-[#0D4E8B] accent-[#0D4E8B]"
                          />
                          <span className="text-xs text-[#1F2A44]">{ag.label}</span>
                        </label>
                      ))}
                    </div>
                    {errors.quranAgeGroups && (
                      <p className="text-[11px] text-red-600 font-bold mt-1">{errors.quranAgeGroups}</p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-[#1F2A44] block">
                      البرامج والمستويات
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {[
                        { id: 'noor_bayan', label: 'نور البيان وتأسيس القراءة العربية' },
                        { id: 'hifz_tilawa', label: 'حفظ القرآن الكريم ومراجعته' },
                        { id: 'tajweed_rules', label: 'أحكام التجويد والتلاوة برواية حفص' },
                        { id: 'khatt_imlaa', label: 'تحسين الخط العربي وقواعد الإملاء' },
                      ].map((lvl) => (
                        <label
                          key={lvl.id}
                          className="flex items-center gap-2.5 p-3 rounded-xl bg-[#F8F9FC] border border-[#E2E8F0] cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={formData.quranLevels.includes(lvl.id)}
                            onChange={() => toggleQuranLevel(lvl.id)}
                            className="w-4 h-4 text-[#0D4E8B] accent-[#0D4E8B]"
                          />
                          <span className="text-xs text-[#1F2A44]">{lvl.label}</span>
                        </label>
                      ))}
                    </div>
                    {errors.quranLevels && (
                      <p className="text-[11px] text-red-600 font-bold mt-1">{errors.quranLevels}</p>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* 3. Academic Qualifications & Experience */}
            <div>
              <div className="flex items-center gap-2.5 mb-5 pb-2 border-b border-[#F2F3F6]">
                <span className="w-7 h-7 rounded-full bg-[#D1DCFE] text-[#0D4E8B] flex items-center justify-center font-['Cairo'] font-bold text-xs">
                  ٣
                </span>
                <div>
                  <h2 className="font-['Cairo'] text-base sm:text-lg font-bold text-[#0D4E8B]">
                    المؤهلات والخبرة
                  </h2>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-[#1F2A44] block">
                    سنوات الخبرة في التدريس <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={formData.experienceYears}
                    onChange={(e) => handleInputChange('experienceYears', e.target.value)}
                    className="w-full h-11 px-3.5 rounded-xl bg-[#F8F9FC] border border-[#CBD5E1] text-[#1F2A44] font-medium text-xs focus:outline-none focus:ring-2 focus:ring-[#0D4E8B] appearance-none cursor-pointer"
                  >
                    <option value="5_8">من ٥ إلى ٨ سنوات خبرة</option>
                    <option value="2_4">من سنتين إلى ٤ سنوات</option>
                    <option value="more_8">أكثر من ٨ سنوات خبرة</option>
                    <option value="less_2">أقل من سنتين</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-[#1F2A44] block">
                    المؤهل الدراسي والتخصص <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.academicDegree}
                    onChange={(e) => handleInputChange('academicDegree', e.target.value)}
                    placeholder="مثال: بكالوريوس تربية رياضيات - جامعة عين شمس"
                    className={`w-full h-11 px-3.5 rounded-xl border text-xs font-medium text-[#1F2A44] focus:outline-none focus:ring-2 focus:ring-[#0D4E8B] ${
                      errors.academicDegree ? 'border-red-400 bg-red-50/30' : 'border-[#CBD5E1] bg-[#F8F9FC]'
                    }`}
                  />
                  {errors.academicDegree && (
                    <p className="text-[11px] text-red-600 font-bold mt-0.5">{errors.academicDegree}</p>
                  )}
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-[#1F2A44] flex items-center justify-between">
                  <span>رابط سيرة ذاتية أو فيديو تعريفي لشرحك (اختياري)</span>
                </label>
                <input
                  type="url"
                  dir="ltr"
                  value={formData.portfolioUrl}
                  onChange={(e) => handleInputChange('portfolioUrl', e.target.value)}
                  placeholder="رابط Google Drive أو YouTube"
                  className="w-full h-11 px-3.5 rounded-xl border border-[#CBD5E1] bg-[#F8F9FC] text-xs font-medium text-[#1F2A44] text-left focus:outline-none focus:ring-2 focus:ring-[#0D4E8B]"
                />
              </div>
            </div>

            {/* 4. Consent */}
            <div>
              <label className={`flex items-start gap-2.5 p-3.5 rounded-2xl border cursor-pointer transition-all ${
                errors.terms ? 'bg-red-50/40 border-red-300' : 'bg-[#F8F9FC] border-[#E2E8F0]'
              }`}>
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

            {/* 5. Submit Button */}
            <div className="pt-2 flex flex-col items-center gap-3">
              <button
                type="submit"
                disabled={activeState === 'submitting'}
                className={`w-full sm:w-auto px-10 py-3.5 rounded-xl font-['Cairo'] font-bold text-sm shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer ${
                  activeState === 'submitting'
                    ? 'bg-[#64748B] text-white cursor-not-allowed'
                    : 'bg-[#0D4E8B] hover:bg-[#003767] text-white'
                }`}
              >
                {activeState === 'submitting' ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>جاري حفظ الطلب...</span>
                  </>
                ) : (
                  <>
                    <span>إرسال طلب الانضمام</span>
                    <ArrowLeft className="w-4 h-4" />
                  </>
                )}
              </button>

              <span className="text-center text-[#64748B] text-xs">
                لا نطلب أي رسوم تقديم أو بيانات دفع في هذه المرحلة التمهيدية.
              </span>
            </div>
          </form>
        </div>
      )}

      {/* State 4: Success Card */}
      {activeState === 'success' && (
        <div className="bg-white rounded-3xl shadow-lg border border-[#E2E8F0] p-8 text-center transition-all animate-fade-in">
          <div className="w-16 h-16 mx-auto rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center text-3xl mb-4 border border-emerald-200">
            <CheckCircle2 className="w-8 h-8 text-emerald-600" />
          </div>

          <div
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#F2F3F6] text-[#0D4E8B] text-xs font-bold mb-3"
            dir="ltr"
          >
            <span>{submittedRecord?.referenceCode || '#SHTR-2025-8492'}</span>
            <span className="text-[#64748B] font-normal" dir="rtl">:كود المراجعة</span>
          </div>

          <h2 className="font-['Cairo'] text-2xl font-bold text-[#0D4E8B] mb-2">
            تم استلام طلبك بنجاح
          </h2>

          <p className="text-xs sm:text-sm text-[#1F2A44] max-w-md mx-auto mb-6 leading-relaxed">
            شكراً لانضمامك إلى مجتمع معلّمي شاطر يا {formData.fullName.trim() || 'المعلم الكريم'}.
            تم توثيق طلبك في سجلات المنصة بنجاح.
          </p>

          <div className="max-w-sm mx-auto p-4 rounded-2xl bg-[#F8F9FC] border border-[#E2E8F0] text-right mb-6 space-y-2 text-xs text-[#535E7B]">
            <h3 className="font-['Cairo'] font-bold text-[#0D4E8B] text-xs sm:text-sm">
              الخطوات القادمة للمراجعة:
            </h3>
            <ol className="space-y-1.5 list-decimal list-inside leading-relaxed">
              <li>مراجعة المؤهلات والخبرات السابقة (خلال 24-48 ساعة).</li>
              <li>مراسلتك رسمياً عبر واتساب لتحديد موعد المقابلة التعريفية.</li>
              <li>تفعيل ملفك وبدء استقبال طلبات الدروس من أولياء الأمور.</li>
            </ol>
          </div>

          <div className="max-w-sm mx-auto p-3 rounded-xl bg-amber-50/70 border border-amber-200 text-right text-[11px] text-amber-800 mb-6">
            <span>ملاحظة بيئة العرض: تم تسجيل الطلب وحفظه محلياً في الذاكرة المؤقتة للمعاينة، ولم يتم ربطه بعد بقاعدة بيانات سحابية خارجية (مثل Supabase أو Firebase).</span>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-2.5">
            <a
              href={followUpWhatsAppUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full sm:w-auto px-6 py-3 rounded-xl font-['Cairo'] font-bold text-xs sm:text-sm bg-[#FFC629] text-[#1F2A44] hover:bg-[#F0B517] shadow-sm flex items-center justify-center gap-1.5 transition-all cursor-pointer"
            >
              <MessageCircle className="w-4 h-4" />
              <span>تابع طلبك عبر واتساب</span>
            </a>

            <button
              type="button"
              onClick={() => setScreenState('initial')}
              className="w-full sm:w-auto px-5 py-3 rounded-xl text-xs font-bold bg-[#F2F3F6] text-[#1F2A44] hover:bg-[#E2E8F0] transition-colors cursor-pointer"
            >
              تعديل البيانات أو تقديم طلب جديد
            </button>
          </div>
        </div>
      )}

      {/* Trust Pillars Banner */}
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
