import React from 'react';
import { ShieldCheck, FileText, ArrowRight, MessageCircle } from 'lucide-react';
import { SHATIR_CONFIG } from '../config/shatirConfig';
import { trackWhatsAppClicked } from '../services/analytics';

interface LegalPagesViewProps {
  page: 'privacy' | 'terms';
  onNavigateHome: () => void;
  onSwitchPage: (page: 'privacy' | 'terms') => void;
}

export const LegalPagesView: React.FC<LegalPagesViewProps> = ({
  page,
  onNavigateHome,
  onSwitchPage,
}) => {
  const cleanNumber = SHATIR_CONFIG.adminWhatsAppNumber.replace(/[^0-9]/g, '');
  const whatsappUrl = `https://wa.me/${cleanNumber}?text=${encodeURIComponent(
    'السلام عليكم ورحمة الله، أود الاستفسار بخصوص سياسة الخصوصية أو الشروط والأحكام في منصة شاطر كلاسيز.'
  )}`;

  return (
    <div className="w-full py-8 sm:py-12 px-4 sm:px-6 lg:px-8 animate-fade-in">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Top Navigation Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-[#E2E8F0] shadow-xs">
          <button
            type="button"
            onClick={onNavigateHome}
            className="min-h-[44px] px-3 rounded-xl text-[#0D4E8B] hover:text-[#003767] hover:bg-[#F0F6FD] font-['Cairo'] font-bold text-xs sm:text-sm inline-flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <ArrowRight className="w-4 h-4" />
            <span>العودة إلى الصفحة الرئيسية</span>
          </button>

          <div className="flex items-center gap-2">
            <a
              href="#privacy"
              onClick={(e) => {
                e.preventDefault();
                onSwitchPage('privacy');
              }}
              className={`px-3.5 py-2 rounded-xl font-['Cairo'] font-bold text-xs transition-colors ${
                page === 'privacy'
                  ? 'bg-[#0D4E8B] text-white'
                  : 'bg-[#F8F9FC] text-[#1F2A44] hover:bg-[#EBF3FC]'
              }`}
            >
              سياسة الخصوصية
            </a>
            <a
              href="#terms"
              onClick={(e) => {
                e.preventDefault();
                onSwitchPage('terms');
              }}
              className={`px-3.5 py-2 rounded-xl font-['Cairo'] font-bold text-xs transition-colors ${
                page === 'terms'
                  ? 'bg-[#0D4E8B] text-white'
                  : 'bg-[#F8F9FC] text-[#1F2A44] hover:bg-[#EBF3FC]'
              }`}
            >
              الشروط والأحكام
            </a>
          </div>
        </div>

        {/* Main Content Card */}
        <div className="bg-white rounded-3xl border border-[#E2E8F0] shadow-xs p-6 sm:p-8 md:p-10 space-y-6">
          {page === 'privacy' ? (
            <>
              <div className="border-b border-[#E2E8F0] pb-5 space-y-2">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#F0F6FD] text-[#0D4E8B] text-xs font-bold">
                  <ShieldCheck className="w-4 h-4" />
                  <span>حماية البيانات والخصوصية</span>
                </div>
                <h1 className="font-['Cairo'] text-2xl sm:text-3xl font-extrabold text-[#1F2A44]">
                  سياسة الخصوصية — منصة شاطر كلاسيز
                </h1>
                <p className="text-xs sm:text-sm text-[#64748B]">
                  تاريخ آخر تحديث: [يُستكمل: تاريخ اعتماد النسخة القانونية النهائية] • الجهة المشغلة: [يُستكمل: الاسم القانوني للكيان أو الشركة وعنوانها الرسمي]
                </p>
              </div>

              <div className="space-y-5 text-xs sm:text-sm text-[#1F2A44] leading-relaxed">
                <section className="space-y-2">
                  <h2 className="font-['Cairo'] text-base sm:text-lg font-bold text-[#0D4E8B]">
                    ١. مقدمة عامة
                  </h2>
                  <p className="text-[#535E7B]">
                    تلتزم منصة «شاطر كلاسيز» (Shatir Classes) بحماية خصوصية أولياء الأمور والطلاب والمعلمين المتقدمين أو المعتمدين على المنصة. توضح هذه السياسة طبيعة البيانات التي يتم جمعها وكيفية استخدامها وحمايتها.
                  </p>
                </section>

                <section className="space-y-2">
                  <h2 className="font-['Cairo'] text-base sm:text-lg font-bold text-[#0D4E8B]">
                    ٢. البيانات التي نجمعها
                  </h2>
                  <ul className="list-disc pr-5 space-y-1.5 text-[#535E7B]">
                    <li>
                      <strong className="text-[#1F2A44]">بيانات أولياء الأمور:</strong> عند تصفح المنصة واختيار المرحلة أو المادة أو البرنامج، لا نطلب من ولي الأمر إنشاء حساب أو إدخال بيانات بطاقة بنكية. وعند الرغبة في حجز حصة تجريبية أو خاصة أو مجموعة، ينتقل ولي الأمر طوعًا إلى محادثة واتساب مع إدارة شاطر حيث يشارك رقم هاتفه وتفاصيل الطلب لتنسيق الموعد.
                    </li>
                    <li>
                      <strong className="text-[#1F2A44]">بيانات المعلمين:</strong> عند إنشاء حساب معلم أو تقديم طلب انضمام، نجمع البيانات اللازمة للمراجعة الأكاديمية والتشغيلية (الاسم، البريد الإلكتروني، رقم واتساب، المؤهلات، الخبرة، التخصصات، والمواعيد المتاحة).
                    </li>
                    <li>
                      <strong className="text-[#1F2A44]">بيانات الاستخدام التقنية:</strong> في حال موافقة الزائر على ملفات تعريف الارتباط التحليلية، يتم جمع إحصاءات عامة غير شخصية حول تصفح الصفحات واختيارات البحث لتحسين تجربة الاستخدام، دون إرسال أي أرقام هواتف أو أسماء أو نصوص رسائل إلى أدوات التحليل.
                    </li>
                  </ul>
                </section>

                <section className="space-y-2">
                  <h2 className="font-['Cairo'] text-base sm:text-lg font-bold text-[#0D4E8B]">
                    ٣. الخدمات والأطراف الثالثة المستخدمة
                  </h2>
                  <ul className="list-disc pr-5 space-y-1.5 text-[#535E7B]">
                    <li>
                      <strong className="text-[#1F2A44]">Supabase:</strong> تُستخدم خدمة Supabase لاستضافة قاعدة البيانات وإدارة مصادقة حسابات المعلمين والإدارة وتخزين ملفات المعلمين والمواعيد المعتمدة وفق ضوابط صلاحيات الوصول (RLS).
                    </li>
                    <li>
                      <strong className="text-[#1F2A44]">Google Analytics (تحليلات جوجل):</strong> نستخدم خدمة Google Analytics 4 لقياس أداء المنصة بصورة إجمالية خالية من البيانات الشخصية، وتكون الخدمة معطلة افتراضيًا لحين اختيار الزائر «موافق» في شريط الموافقة (Google Consent Mode).
                    </li>
                    <li>
                      <strong className="text-[#1F2A44]">WhatsApp (واتساب):</strong> يتم تنسيق طلبات الحجز والاستفسارات عبر خدمة واتساب المباشرة مع فريق إدارة شاطر، وتخضع المحادثات عبر تطبيق واتساب لسياسة الخصوصية الخاصة بشركة Meta.
                    </li>
                  </ul>
                </section>

                <section className="space-y-2">
                  <h2 className="font-['Cairo'] text-base sm:text-lg font-bold text-[#0D4E8B]">
                    ٤. خصوصية بيانات الأطفال والقصّر
                  </h2>
                  <p className="text-[#535E7B]">
                    خدمات «شاطر كلاسيز» موجهة للتعاقد والتنسيق المباشر مع <strong className="text-[#1F2A44]">ولي الأمر البالغ</strong> فقط. لا نجمع بيانات شخصية مباشرة من الأطفال عبر الموقع، وتقتصر المعلومات التعليمية المتداولة أثناء التنسيق مع ولي الأمر على المرحلة الدراسية أو الفئة العمرية والمستوى التعليمي اللازمين لاختيار المعلم المناسب وتقديم الحصة تحت إشراف ولي الأمر.
                  </p>
                </section>

                <section className="space-y-2">
                  <h2 className="font-['Cairo'] text-base sm:text-lg font-bold text-[#0D4E8B]">
                    ٥. طلبات أولياء الأمور
                  </h2>
                  <ul className="list-disc pr-5 space-y-1.5 text-[#535E7B]">
                    <li>
                      نجمع اسم ولي الأمر ورقم الموبايل وسن الطفل الاختياري وتفاصيل الطلب ومصدر الزيارة.
                    </li>
                    <li>
                      نستخدمها للتواصل بخصوص الطلب وقياس الخدمة والحملات.
                    </li>
                    <li>
                      يقتصر الوصول إليها على إدارة المنصة.
                    </li>
                    <li>
                      يمكن طلب حذفها عبر وسيلة التواصل الموجودة في الصفحة.
                    </li>
                    <li>
                      مدة الاحتفاظ: [يُستكمل: مدة الاحتفاظ بطلبات أولياء الأمور].
                    </li>
                  </ul>
                </section>

                <section className="space-y-2">
                  <h2 className="font-['Cairo'] text-base sm:text-lg font-bold text-[#0D4E8B]">
                    ٦. كيفية طلب تعديل أو حذف البيانات
                  </h2>
                  <p className="text-[#535E7B]">
                    يحق لولي الأمر أو المعلم في أي وقت طلب الاطلاع على بياناته المسجلة لدى المنصة أو تعديلها أو طلب حذفها نهائيًا من سجلاتنا النشطة، وذلك عبر التواصل المباشر مع إدارة شاطر عبر واتساب أو عبر البريد الإلكتروني الرسمي: [يُستكمل: البريد الإلكتروني الرسمي لطلبات الخصوصية وحذف البيانات]، وسيتم تنفيذ الطلب خلال مدة لا تتجاوز [يُستكمل: عدد أيام العمل المحددة لمعالجة طلب الحذف].
                  </p>
                </section>
              </div>
            </>
          ) : (
            <>
              <div className="border-b border-[#E2E8F0] pb-5 space-y-2">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#F0F6FD] text-[#0D4E8B] text-xs font-bold">
                  <FileText className="w-4 h-4" />
                  <span>الضوابط التنظيمية للخدمة</span>
                </div>
                <h1 className="font-['Cairo'] text-2xl sm:text-3xl font-extrabold text-[#1F2A44]">
                  الشروط والأحكام — منصة شاطر كلاسيز
                </h1>
                <p className="text-xs sm:text-sm text-[#64748B]">
                  تاريخ آخر تحديث: [يُستكمل: تاريخ اعتماد النسخة القانونية النهائية] • الجهة المشغلة: [يُستكمل: الاسم القانوني للكيان أو الشركة ورقم السجل]
                </p>
              </div>

              <div className="space-y-5 text-xs sm:text-sm text-[#1F2A44] leading-relaxed">
                <section className="space-y-2">
                  <h2 className="font-['Cairo'] text-base sm:text-lg font-bold text-[#0D4E8B]">
                    ١. طبيعة خدمة شاطر كلاسيز
                  </h2>
                  <p className="text-[#535E7B]">
                    تعمل منصة «شاطر كلاسيز» كمنصة تعليمية تتيح لأولياء الأمور استعراض ملفات المعلمين المعتمدين في مسار المناهج الدراسية ومسار القرآن الكريم والتأسيس، واختيار المواعيد المناسبة، وتنسيق الحصص التجريبية والخاصة والمجموعات عبر فريق الإدارة.
                  </p>
                </section>

                <section className="space-y-2">
                  <h2 className="font-['Cairo'] text-base sm:text-lg font-bold text-[#0D4E8B]">
                    ٢. الحصة التجريبية المجانية وتأكيد الحجز
                  </h2>
                  <ul className="list-disc pr-5 space-y-1.5 text-[#535E7B]">
                    <li>
                      مدة الحصة التجريبية الأولى ٢٠ دقيقة، وتُقدَّم مجانًا دون التزام مالي مسبق لتقييم مستوى الطفل والتعرف على أسلوب المعلم.
                    </li>
                    <li>
                      إرسال رسالة الطلب عبر واتساب يُعد طلب تنسيق مبدئي، ولا يُعد الموعد مؤكدًا بشكل نهائي إلا بعد مراجعة إدارة شاطر وتأكيد الموعد مع ولي الأمر والمعلم.
                    </li>
                  </ul>
                </section>

                <section className="space-y-2">
                  <h2 className="font-['Cairo'] text-base sm:text-lg font-bold text-[#0D4E8B]">
                    ٣. الحصص المدفوعة وسياسة الإلغاء والاسترداد
                  </h2>
                  <ul className="list-disc pr-5 space-y-1.5 text-[#535E7B]">
                    <li>
                      تُوضح أسعار الحصص الخاصة (١:١) وأسعار باقات المجموعات ومدتها في ملف كل معلم بوضوح قبل طلب الحجز.
                    </li>
                    <li>
                      تتم إجراءات السداد وتأكيد الجداول عبر القنوات الرسمية المعتمدة لدى إدارة شاطر: [يُستكمل: وسائل الدفع المعتمدة وسياسة الاسترداد وتأجيل الحصص بالتفصيل].
                    </li>
                  </ul>
                </section>

                <section className="space-y-2">
                  <h2 className="font-['Cairo'] text-base sm:text-lg font-bold text-[#0D4E8B]">
                    ٤. التزامات الاستخدام السليم وحماية الأطفال
                  </h2>
                  <p className="text-[#535E7B]">
                    يلتزم ولي الأمر والمعلم بالحفاظ على بيئة تعليمية آمنة ومحترمة خلال الحصص المباشرة، ويُشترط إشراف ولي الأمر على حضور الطفل للحصص التجريبية والدراسية، مع الالتزام بالتنسيق عبر القنوات الرسمية للمنصة لضمان حفظ حقوق جميع الأطراف.
                  </p>
                </section>

                <section className="space-y-2">
                  <h2 className="font-['Cairo'] text-base sm:text-lg font-bold text-[#0D4E8B]">
                    ٥. القانون الواجب التطبيق والتواصل
                  </h2>
                  <p className="text-[#535E7B]">
                    تخضع هذه الشروط والأحكام للقوانين المعمول بها في [يُستكمل: الدولة والاختصاص القضائي المعتمد]، ولأي استفسار أو شكوى يمكنكم التواصل مباشرة مع فريق إدارة شاطر.
                  </p>
                </section>
              </div>
            </>
          )}

          {/* Contact Box */}
          <div className="pt-4 border-t border-[#E2E8F0] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <p className="text-xs text-[#64748B]">
              هل لديك استفسار حول الخصوصية أو طلب حذف بيانات؟ تواصل معنا مباشرة:
            </p>
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => trackWhatsAppClicked('legal_page')}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-[#0D4E8B] hover:bg-[#003767] text-white font-['Cairo'] font-bold text-xs inline-flex items-center gap-2 transition-colors"
            >
              <MessageCircle className="w-4 h-4 text-[#FFC629]" />
              <span>تواصل مع إدارة شاطر</span>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};
