import { AipanMandala } from '../../ui/aipan.jsx';
import { Icon } from '../../ui/icons.jsx';
import ChatPanel from '../chat/ChatPanel.jsx';


/** "Ask Front Desk" inside the report (Hotel Pro). Same conversation as the floating button. */
export default function ReportChat({ bizId, hotelName }) {
  return (
    <div className="overflow-hidden rounded-[2rem] bg-white shadow-card ring-1 ring-line">
      <div className="relative flex items-center gap-3 overflow-hidden bg-pine px-5 py-4 text-mist">
        <AipanMandala className="pointer-events-none absolute -top-10 -right-10 size-36 opacity-15" bg={null} color="#fffdf7" />
        <span className="grid size-11 place-items-center rounded-2xl bg-amber text-pine"><Icon name="bell" className="size-5" /></span>
        <div>
          <p className="font-serif text-xl text-white">Ask Front Desk</p>
          <p className="text-sm text-mist/80">Answers from {hotelName}&rsquo;s reviews and the hotels near you - never made up.</p>
        </div>
      </div>
      <ChatPanel bizId={bizId} hotelName={hotelName} />
    </div>
  );
}
