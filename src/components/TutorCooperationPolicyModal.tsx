import React from 'react';
import { X, ShieldCheck, FileText, CheckCircle2 } from 'lucide-react';

interface TutorCooperationPolicyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAccept?: () => void;
  isAccepted?: boolean;
}

export const TUTOR_COOPERATION_POLICY_VERSION = '1.0';

export const TutorCooperationPolicyModal: React.FC<TutorCooperationPolicyModalProps> = ({
  isOpen,
  onClose,
  onAccept,
  isAccepted = false,
}) => {
  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="tutor-policy-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in"
      dir="rtl"
    >
      <div className="bg-white w-full max-w-2xl rounded-2xl sm:rounded-3xl shadow-2xl border border-[#CBD5E1] flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-[#E2E8F0] flex items-center justify-between bg-[#F8FAFD]">
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-xl bg-[#0D4E8B]/10 text-[#0D4E8B] flex items-center justify-center shrink-0">
              <FileText className="w-4 h-4" />
            </span>
            <div>
              <h2
                id="tutor-policy-title"
                className="font-['Cairo'] text-base sm:text-lg font-bold text-[#0D4E8B]"
              >
                سياسة التعاون مع المعلمين — منصة شاطر
              </h2>
              <p className="text-[11px] sm:text-xs text-[#64748B]">
                الإصدار 1.0 — وثيقة الشروط والضوابط المنظمة لانضمام المعلمين
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white hover:bg-slate-100 border border-[#E2E8F0] text-slate-500 hover:text-slate-700 flex items-center justify-center transition-colors cursor-pointer"
            aria-label="إغلاق السياسة"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Policy Body with full clauses */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4 text-right text-xs sm:text-sm text-[#1F2A44] leading-relaxed">
          {/* Notice Box */}
          <div className="p-3 sm:p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs">
            <p className="font-bold flex items-center gap-1.5 mb-1">
              <ShieldCheck className="w-4 h-4 text-amber-700 shrink-0" />
              <span>تنويه أولي للمتقدمين</span>
            </p>
            <p className="text-amber-800 leading-relaxed">
              تقديم طلب الانضمام عبر المنصة يخضع للتدقيق والمراجعة الأكاديمية والمقابلة الشخصية من قِبل إدارة شاطر، ولا يُعد قبولاً تلقائياً أو اعتماداً فورياً للمعلم.
            </p>
          </div>

          {/* البند ١ */}
          <div className="p-3.5 rounded-xl bg-[#F8FAFD] border border-[#E2E8F0] space-y-1">
            <h3 className="font-['Cairo'] font-bold text-sm text-[#0D4E8B]">
              البند ١: طبيعة المنصة وعلاقة التعاون
            </h3>
            <p className="text-[#535E7B] leading-relaxed">
              منصة شاطر كلاسيز هي منصة تقنية وتعليمية متخصصة تهدف إلى ربط أولياء الأمور بنخبة من المعلمين المستقلين المؤهلين. لا يُشكّل التقديم أو التعاون علاقة عمل وظيفية دائمة، بل يُعد شراكة تعاونية مهنية حرة قائمة على تقديم الدروس الفردية عن بُعد وفق معايير الجودة والشفافية.
            </p>
          </div>

          {/* البند ٢ */}
          <div className="p-3.5 rounded-xl bg-[#F8FAFD] border border-[#E2E8F0] space-y-1">
            <h3 className="font-['Cairo'] font-bold text-sm text-[#0D4E8B]">
              البند ٢: الحصة التجريبية المجانية (٢٠ دقيقة)
            </h3>
            <p className="text-[#535E7B] leading-relaxed">
              يلتزم المعلم بتقديم حصة تجريبية مدتها <strong>٢٠ دقيقة</strong> مجاناً وبدون أي مقابل مالي عند طلب ولي الأمر المستحق، وذلك لتمكين الطالب من التعرف على أسلوب الشرح وقياس مدى التوافق التعليمي، وتحديد الاحتياجات الدراسية قبل الانتقال للحصص المدفوعة.
            </p>
          </div>

          {/* البند ٣ */}
          <div className="p-3.5 rounded-xl bg-[#F8FAFD] border border-[#E2E8F0] space-y-1">
            <h3 className="font-['Cairo'] font-bold text-sm text-[#0D4E8B]">
              البند ٣: الحصص المدفوعة والمستحقات
            </h3>
            <p className="text-[#535E7B] leading-relaxed">
              مدة الحصة المدفوعة الأساسية هي <strong>٥٠ دقيقة</strong>. يحدد المعلم نطاق أجره بالساعة بالاتفاق مع الإدارة، مع التزام المنصة بضمان الشفافية في تحصيل وتوريد المستحقات دون تأخير، وفق آلية السداد المعتمدة المتفق عليها عند اجتياز المقابلة.
            </p>
          </div>

          {/* البند ٤ */}
          <div className="p-3.5 rounded-xl bg-[#F8FAFD] border border-[#E2E8F0] space-y-1">
            <h3 className="font-['Cairo'] font-bold text-sm text-[#0D4E8B]">
              البند ٤: الالتزام بالمواعيد والجاهزية التعليمية
            </h3>
            <p className="text-[#535E7B] leading-relaxed">
              يلتزم المعلم بالدقة التامة في المواعيد المعروضة بجدوله، والتواجد قبل بدء الحصة في الوقت المحدد. في حال حدوث ظرف طارئ، يلتزم المعلم بإخطار إدارة شاطر وولي الأمر مسبقاً بوقت كافٍ (لا يقل عن ساعتين) لتنسيق موعد بديل مناسب دون إرباك الطالب.
            </p>
          </div>

          {/* البند ٥ */}
          <div className="p-3.5 rounded-xl bg-[#F8FAFD] border border-[#E2E8F0] space-y-1">
            <h3 className="font-['Cairo'] font-bold text-sm text-[#0D4E8B]">
              البند ٥: معايير الأمانة التربوية والخصوصية
            </h3>
            <p className="text-[#535E7B] leading-relaxed">
              يلتزم المعلم بالحفاظ التام على خصوصية الطلاب وأولياء الأمور وعدم استخدام أو مشاركة بياناتهم خارج سياق التدريس المعتمد. كما يُحظر طلب أرقام تواصل شخصية للالتفاف على التنسيق الرسمي للمنصة بما يخل بالضمانات وحقوق الطرفين.
            </p>
          </div>

          {/* البند ٦ */}
          <div className="p-3.5 rounded-xl bg-[#F8FAFD] border border-[#E2E8F0] space-y-1">
            <h3 className="font-['Cairo'] font-bold text-sm text-[#0D4E8B]">
              البند ٦: آلية التقديم ومعالجة الطلبات
            </h3>
            <p className="text-[#535E7B] leading-relaxed">
              يتم تقديم بيانات المتقدم ومؤهلاته وتجهيز طلب الانضمام عبر واتساب الإدارة الرسمي. يُقر المتقدم بأن فتح تطبيق واتساب لا يعني تسجيلاً آلياً للموافقة في قاعدة بيانات المنصة أو إتماماً للقبول، بل يلزم إرسال الرسالة واستكمال إجراءات التدقيق والمقابلة.
            </p>
          </div>

          {/* البند ٧ */}
          <div className="p-3.5 rounded-xl bg-[#F8FAFD] border border-[#E2E8F0] space-y-1">
            <h3 className="font-['Cairo'] font-bold text-sm text-[#0D4E8B]">
              البند ٧: التحديثات وسريان الإصدار
            </h3>
            <p className="text-[#535E7B] leading-relaxed">
              تعتبر هذه الوثيقة <strong>(الإصدار 1.0)</strong> سارية المفعول وملزمة من تاريخ الموافقة عليها. وتحتفظ إدارة منصة شاطر بحق إجراء تحديثات تنظيمية دورية بما يخدم مصلحة العملية التعليمية وسلامة بيئة التعلم.
            </p>
          </div>
        </div>

        {/* Footer actions */}
        <div className="p-4 sm:p-5 border-t border-[#E2E8F0] bg-[#F8FAFD] flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-xs text-[#64748B] text-center sm:text-right">
            الموافقة على هذه السياسة متطلب إلزامي لاستكمال طلب الانضمام.
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto">
            {onAccept && !isAccepted && (
              <button
                type="button"
                onClick={() => {
                  onAccept();
                  onClose();
                }}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-[#0D4E8B] hover:bg-[#003767] text-white font-['Cairo'] font-bold text-xs sm:text-sm shadow-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>أوافق على السياسة</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-white hover:bg-slate-100 border border-[#CBD5E1] text-[#1F2A44] font-['Cairo'] font-bold text-xs sm:text-sm transition-colors cursor-pointer"
            >
              إغلاق
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
