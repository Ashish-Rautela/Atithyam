import { AipanMandala } from '../../ui/aipan.jsx';
import { Icon } from '../../ui/icons.jsx';
import { useAuth } from '../../auth/AuthContext.jsx';
import ChatPanel, { Avatar } from '../chat/ChatPanel.jsx';

/** "Ask Front Desk" inside the report (Hotel Pro). Same conversation as the floating button. */
export default function ReportChat({ bizId, hotelName }) {
  const { user } = useAuth();
  return (
    <div className="overflow-hidden rounded-[2rem] bg-white shadow-card ring-1 ring-line">
      <div className="relative flex flex-wrap items-center gap-3 overflow-hidden bg-gradient-to-br from-pine to-forest px-5 py-4 text-mist sm:px-6">
        <AipanMandala className="pointer-events-none absolute -top-12 -right-10 size-44 opacity-15" bg={null} color="#fffdf7" />
        <span className="relative">
          <Avatar className="size-12" />
          <span className="absolute right-0 bottom-0 size-3.5 rounded-full bg-good ring-2 ring-pine" title="Online" />
        </span>
        <div className="relative min-w-0 flex-1">
          <p className="font-serif text-xl text-white">Ask Front Desk</p>
          <p className="text-sm text-mist/85">Your AI assistant for {hotelName}&rsquo;s reviews and the hotels near you - never made up.</p>
        </div>
        <span className="relative hidden items-center gap-1 rounded-full bg-white/10 px-3 py-1 text-xs sm:inline-flex"><Icon name="language" className="size-3.5" /> English · हिंदी · Hinglish</span>
      </div>
      <ChatPanel bizId={bizId} hotelName={hotelName} userName={user?.name} />
    </div>
  );
}
