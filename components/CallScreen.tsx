// components/CallScreen.tsx
import React, { useEffect, useMemo, useRef } from "react";

type CallMode = "voice" | "video";
type CallPhase = "outgoing" | "incoming" | "connecting" | "active" | "ended";

export type CallScreenProps = {
  open: boolean;
  mode: CallMode;
  phase: CallPhase;
  peerName: string;
  peerAvatar?: string | null;
  localStream?: MediaStream | null;
  remoteStream?: MediaStream | null;
  micOn: boolean;
  camOn: boolean;
  speakerOn: boolean;
  onAccept?: () => void;
  onDecline?: () => void;
  onHangup: () => void;
  onToggleMic: () => void;
  onToggleCam: () => void;
  onToggleSpeaker: () => void;
  onFlipCamera?: () => void;
  topLabel?: string;
  subtitle?: string;
  swapped?: boolean;
  onSwap?: () => void;
};

const AvatarCircle: React.FC<{ src?: string | null; name: string }> = ({ src, name }) => {
  const initials = useMemo(() => {
    const parts = (name || "U").trim().split(/\s+/).slice(0, 2);
    return parts.map((p) => p[0]?.toUpperCase()).join("").slice(0, 2) || "U";
  }, [name]);

  if (src) {
    return (
      <img
        src={src}
        alt={name}
        className="w-[96px] h-[96px] rounded-full object-cover border border-white/25 shadow-2xl"
      />
    );
  }

  return (
    <div className="w-[96px] h-[96px] rounded-full bg-white/15 border border-white/25 flex items-center justify-center text-white text-3xl font-bold shadow-2xl">
      {initials}
    </div>
  );
};

const IconBtn: React.FC<{
  icon: string;
  onClick: () => void;
  danger?: boolean;
  muted?: boolean;
  label?: string;
}> = ({ icon, onClick, danger, muted, label }) => (
  <button
    type="button"
    onClick={onClick}
    className={[
      "w-14 h-14 rounded-full flex items-center justify-center active:scale-[0.96] transition shadow-lg",
      danger ? "bg-[#ff3b30]" : "bg-black/45 backdrop-blur-md",
      muted ? "opacity-70" : "opacity-100",
    ].join(" ")}
    aria-label={label || icon}
  >
    <i className={`${icon} text-white text-[20px]`} />
  </button>
);

export const CallScreen: React.FC<CallScreenProps> = ({
  open,
  mode,
  phase,
  peerName,
  peerAvatar,
  localStream,
  remoteStream,
  micOn,
  camOn,
  speakerOn,
  onAccept,
  onDecline,
  onHangup,
  onToggleMic,
  onToggleCam,
  onToggleSpeaker,
  onFlipCamera,
  topLabel = "End-to-end encrypted",
  subtitle,
  swapped = false,
  onSwap,
}) => {
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const v = localVideoRef.current;
    if (v && localStream) {
      // @ts-ignore
      v.srcObject = localStream;
      v.muted = true;
      v.controls = false;
      v.play?.().catch(() => {});
    }
  }, [open, localStream]);

  useEffect(() => {
    if (!open) return;
    const v = remoteVideoRef.current;
    if (v && remoteStream) {
      // @ts-ignore
      v.srcObject = remoteStream;
      v.muted = false;
      v.controls = false;
      v.volume = speakerOn ? 1 : 0;
      v.play?.().catch(() => {});
    }
  }, [open, remoteStream, speakerOn]);

  useEffect(() => {
    if (!open) return;
    const a = remoteAudioRef.current;
    if (a && remoteStream) {
      // @ts-ignore
      a.srcObject = remoteStream;
      a.muted = false;
      a.volume = speakerOn ? 1 : 0;
      a.play?.().catch(() => {});
    }
  }, [open, remoteStream, speakerOn]);

  if (!open) return null;

  const showVideo = mode === "video";
  const isIncoming = phase === "incoming";
  const isActive = phase === "active";
  const isConnecting = phase === "connecting" || phase === "outgoing";
  const canSwap = showVideo && typeof onSwap === "function";

  const fullStream = swapped ? localStream : remoteStream;
  const smallStream = swapped ? remoteStream : localStream;

  const showFullVideo = showVideo && !!fullStream && (swapped || isActive);
  const showSmallVideo = showVideo && !!smallStream;

  const sub =
    subtitle ||
    (phase === "incoming"
      ? "Incoming call…"
      : phase === "outgoing"
      ? "Calling…"
      : phase === "connecting"
      ? "Connecting…"
      : "");

  return (
    <div className="fixed inset-0 z-[9999] bg-[#0b0f14] overflow-hidden">
      <style>{`
        video::-webkit-media-controls,
        video::-webkit-media-controls-panel,
        video::-webkit-media-controls-play-button,
        video::-webkit-media-controls-start-playback-button {
          display: none !important;
          -webkit-appearance: none !important;
          opacity: 0 !important;
        }
      `}</style>

      <audio ref={remoteAudioRef} autoPlay playsInline />

      {/* clean background */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#111827] via-[#1f2937] to-[#050505]" />

      {peerAvatar && (
        <img
          src={peerAvatar}
          alt=""
          className="absolute inset-0 w-full h-full object-cover blur-3xl scale-125 opacity-25"
        />
      )}

      <div className="absolute inset-0 bg-black/45" />

      {/* full video only when stream exists */}
      {showFullVideo && (
        <video
          ref={swapped ? localVideoRef : remoteVideoRef}
          autoPlay
          playsInline
          muted={swapped}
          controls={false}
          disablePictureInPicture
          className="absolute inset-0 w-full h-full object-cover"
          onClick={() => canSwap && onSwap?.()}
        />
      )}

      {/* top label */}
      <div className="absolute top-9 left-0 right-0 flex items-center justify-center">
        <div className="text-white/85 text-[13px] tracking-wide">{topLabel}</div>
      </div>

      {/* center info */}
      <div className="absolute top-[105px] left-0 right-0 flex flex-col items-center px-5 pointer-events-none">
        <AvatarCircle src={peerAvatar} name={peerName} />

        <div className="mt-5 text-white text-[34px] font-extrabold text-center leading-tight drop-shadow-lg">
          {peerName}
        </div>

        {!!sub && (
          <div className="mt-2 text-white/85 text-[19px] font-medium drop-shadow">
            {sub}
          </div>
        )}

        {showVideo && isActive && canSwap && (
          <div className="mt-2 text-white/60 text-[12px]">Tap video to swap view</div>
        )}
      </div>

      {/* small local/remote preview */}
      {showSmallVideo && (
        <div
          className="absolute top-20 right-4 w-[105px] h-[160px] rounded-2xl overflow-hidden border border-white/15 bg-black/45 shadow-2xl"
          onClick={() => canSwap && onSwap?.()}
        >
          <video
            ref={swapped ? remoteVideoRef : localVideoRef}
            autoPlay
            playsInline
            muted={!swapped}
            controls={false}
            disablePictureInPicture
            className="w-full h-full object-cover"
          />
        </div>
      )}

      {/* bottom controls */}
      <div className="absolute bottom-10 left-0 right-0 px-6">
        {isIncoming ? (
          <div className="flex items-center justify-between max-w-[360px] mx-auto">
            <IconBtn icon="fas fa-phone-slash" onClick={onDecline || onHangup} danger label="Decline" />
            <IconBtn icon="fas fa-phone" onClick={onAccept || (() => {})} label="Accept" />
          </div>
        ) : (
          <div className="flex items-center justify-center gap-5 max-w-[430px] mx-auto">
            {showVideo ? (
              <>
                <IconBtn
                  icon={camOn ? "fas fa-video" : "fas fa-video-slash"}
                  onClick={onToggleCam}
                  muted={!camOn}
                  label="Camera"
                />
                <IconBtn icon="fas fa-sync-alt" onClick={onFlipCamera || (() => {})} label="Flip camera" />
              </>
            ) : (
              <IconBtn
                icon={speakerOn ? "fas fa-volume-up" : "fas fa-volume-mute"}
                onClick={onToggleSpeaker}
                muted={!speakerOn}
                label="Speaker"
              />
            )}

            <IconBtn
              icon={micOn ? "fas fa-microphone" : "fas fa-microphone-slash"}
              onClick={onToggleMic}
              muted={!micOn}
              label="Mic"
            />

            <IconBtn icon="fas fa-phone-slash" onClick={onHangup} danger label="End call" />
          </div>
        )}

        {isConnecting && (
          <div className="mt-6 text-center text-white/70 text-[12px]">
            If it doesn’t connect, it may need TURN later.
          </div>
        )}
      </div>
    </div>
  );
};
