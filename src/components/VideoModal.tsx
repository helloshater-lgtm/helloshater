import React, { useState } from 'react';
import { Tutor } from '../types';
import { Play, Pause, X } from 'lucide-react';

interface VideoModalProps {
  tutor: Tutor;
  isOpen: boolean;
  onClose: () => void;
  onBookTrial: () => void;
}

export const VideoModal: React.FC<VideoModalProps> = ({ tutor, isOpen, onClose, onBookTrial }) => {
  const [isPlaying, setIsPlaying] = useState(true);

  if (!isOpen || !tutor.videoPreview) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-[#1F2A44]/80 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-3xl bg-white rounded-2xl sm:rounded-3xl shadow-2xl overflow-hidden border border-[#E2E8F0] flex flex-col">
        {/* Modal Header */}
        <div className="p-4 bg-[#003767] text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-[#0D4E8B] text-[#FFC629] flex items-center justify-center text-xs">
              <Play className="w-3.5 h-3.5 fill-[#FFC629]" />
            </div>
            <div>
              <h3 className="font-['Cairo'] text-sm sm:text-base font-bold leading-tight">
                {tutor.videoPreview.title}
              </h3>
              <span className="text-xs text-[#95C0FF]">
                {tutor.honorific} {tutor.name} · {tutor.videoPreview.durationText}
              </span>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center text-sm transition-colors cursor-pointer"
            aria-label="إغلاق الفيديو"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Video Player Canvas */}
        <div className="relative aspect-video bg-[#0F172A] flex flex-col items-center justify-center overflow-hidden select-none">
          <div className="absolute inset-0 bg-gradient-to-br from-[#0D4E8B]/40 to-[#0F172A] flex flex-col items-center justify-center p-6 text-white text-center">
            <div className="w-full max-w-xl bg-white/10 backdrop-blur-md rounded-2xl p-6 border border-white/20 shadow-inner flex flex-col items-center gap-4">
              <div className="flex items-center justify-between w-full border-b border-white/20 pb-3">
                <span className="font-['Cairo'] text-sm font-bold text-[#FFC629]">
                  {tutor.headline}
                </span>
                <span className="text-xs bg-emerald-500/30 text-emerald-200 px-2.5 py-0.5 rounded-full border border-emerald-400/40">
                  شرح تجريبي
                </span>
              </div>

              <div className="py-3 text-center space-y-2">
                <div className="text-3xl sm:text-4xl font-black font-['Cairo'] text-white tracking-widest" dir="ltr">
                  8 + 9 = 17
                </div>
                <div className="flex items-center justify-center gap-3 text-xs text-[#D1DCFE] pt-1">
                  <span className="px-2.5 py-1 bg-white/10 rounded-lg">تبسيط المفاهيم</span>
                  <span className="px-2.5 py-1 bg-white/10 rounded-lg">التطبيق التفاعلي</span>
                </div>
              </div>

              <p className="text-xs text-white/80 max-w-md italic">
                "{tutor.helpChildQuote}"
              </p>
            </div>
          </div>

          {/* Central Play/Pause */}
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className="relative z-10 w-14 h-14 rounded-full bg-[#0D4E8B] text-white hover:bg-[#003767] hover:scale-105 active:scale-95 transition-all shadow-xl flex items-center justify-center cursor-pointer"
          >
            {isPlaying ? <Pause className="w-5 h-5 fill-white" /> : <Play className="w-5 h-5 fill-white ml-0.5" />}
          </button>

          {/* Bottom Progress Bar */}
          <div className="absolute bottom-0 inset-x-0 p-3 bg-gradient-to-t from-black/80 to-transparent flex items-center justify-between gap-3 text-white text-xs">
            <span dir="ltr">0:42 / {tutor.videoPreview.durationText}</span>
            <div className="flex-1 h-1.5 bg-white/30 rounded-full overflow-hidden">
              <div className="w-2/3 h-full bg-[#FFC629] rounded-full"></div>
            </div>
            <span className="bg-white/20 px-2 py-0.5 rounded text-[10px]">HD</span>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-[#F8F9FC] border-t border-[#E2E8F0] flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs text-[#535E7B] text-center sm:text-right">
            يمكنك بدء جلسة تجريبية مدتها {tutor.trialDurationMinutes} دقيقة مجاناً مع {tutor.honorific} {tutor.name}.
          </p>

          <div className="flex items-center gap-2.5 w-full sm:w-auto">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-[#64748B] hover:text-[#1F2A44] cursor-pointer"
            >
              إغلاق
            </button>
            <button
              onClick={() => {
                onClose();
                onBookTrial();
              }}
              className="flex-1 sm:flex-initial px-5 py-2.5 rounded-xl bg-[#0D4E8B] hover:bg-[#003767] text-white text-xs sm:text-sm font-bold shadow-sm transition-all cursor-pointer whitespace-nowrap"
            >
              احجز حصة تجريبية مجانية
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
