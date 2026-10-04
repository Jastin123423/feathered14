import React, { useEffect, useMemo, useRef, useState } from "react";

type CallMode = "audio" | "video";

type Props = {
  open: boolean;
  mode: CallMode;
  callId: string;         // any unique ID (e.g. `${Date.now()}-${me}-${peer}`)
  meId: number;
  peerId: number;
  peerName?: string;
  onClose: () => void;
  // who is initiator?
  initiator: boolean;
};

type SigMsg =
  | { type: "offer"; sdp: any; to?: string; from?: string }
  | { type: "answer"; sdp: any; to?: string; from?: string }
  | { type: "ice"; candidate: any; to?: string; from?: string }
  | { type: "peer-joined"; user_id: string }
  | { type: "peer-left"; user_id: string }
  | { type: "hangup"; to?: string; from?: string };

const rtcConfig: RTCConfiguration = {
  iceServers: [
    { urls: ["stun:stun.l.google.com:19302"] },
    { urls: ["stun:stun1.l.google.com:19302"] },
  ],
};

export const CallOverlay: React.FC<Props> = ({
  open,
  mode,
  callId,
  meId,
  peerId,
  peerName,
  onClose,
  initiator,
}) => {
  const wsRef = useRef<WebSocket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);

  const [status, setStatus] = useState<string>("Connecting…");
  const [muted, setMuted] = useState(false);
  const [camOff, setCamOff] = useState(false);

  const peerIdStr = useMemo(() => String(peerId), [peerId]);
  const meIdStr = useMemo(() => String(meId), [meId]);

  const sendSig = (msg: any) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== 1) return;
    ws.send(JSON.stringify({ ...msg, to: peerIdStr }));
  };

  const stopAll = async () => {
    try {
      sendSig({ type: "hangup" });
    } catch {}

    try {
      wsRef.current?.close();
    } catch {}
    wsRef.current = null;

    try {
      pcRef.current?.close();
    } catch {}
    pcRef.current = null;

    try {
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
    } catch {}
    localStreamRef.current = null;
  };

  useEffect(() => {
    if (!open) return;

    let cancelled = false;

    const start = async () => {
      setStatus("Requesting media…");

      // 1) Local media
      const constraints =
        mode === "video"
          ? { audio: true, video: { width: 1280, height: 720 } }
          : { audio: true, video: false };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      if (cancelled) return;

      localStreamRef.current = stream;

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        localVideoRef.current.muted = true;
        localVideoRef.current.play().catch(() => {});
      }

      // 2) PeerConnection
      setStatus("Connecting…");
      const pc = new RTCPeerConnection(rtcConfig);
      pcRef.current = pc;

      // Add tracks
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));

      // Remote tracks
      pc.ontrack = (ev) => {
        const remoteStream = ev.streams?.[0];
        if (remoteStream && remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = remoteStream;
          remoteVideoRef.current.play().catch(() => {});
        }
      };

      // ICE candidates
      pc.onicecandidate = (ev) => {
        if (ev.candidate) {
          sendSig({ type: "ice", candidate: ev.candidate });
        }
      };

      pc.onconnectionstatechange = () => {
        const st = pc.connectionState;
        if (st === "connected") setStatus("Connected");
        else if (st === "connecting") setStatus("Connecting…");
        else if (st === "disconnected") setStatus("Disconnected");
        else if (st === "failed") setStatus("Failed");
        else if (st === "closed") setStatus("Closed");
      };

      // 3) WebSocket signaling
      const token = `unera:${meIdStr}`;
      const wsUrl = `${location.origin.replace(/^http/, "ws")}/api/calls/ws?call_id=${encodeURIComponent(
        callId
      )}&user_id=${encodeURIComponent(meIdStr)}&token=${encodeURIComponent(token)}`;

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = async () => {
        setStatus(initiator ? "Calling…" : "Ringing…");

        // initiator creates offer
        if (initiator) {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          sendSig({ type: "offer", sdp: offer });
        }
      };

      ws.onmessage = async (evt) => {
        let msg: SigMsg | null = null;
        try {
          msg = JSON.parse(String(evt.data));
        } catch {
          return;
        }
        if (!msg) return;

        // If it’s not from peer, ignore (DO broadcasts join/leave)
        const from = (msg as any).from;
        if (from && String(from) !== peerIdStr) {
          return;
        }

        if (msg.type === "offer") {
          setStatus("Incoming call…");
          await pc.setRemoteDescription(new RTCSessionDescription((msg as any).sdp));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          sendSig({ type: "answer", sdp: answer });
        }

        if (msg.type === "answer") {
          await pc.setRemoteDescription(new RTCSessionDescription((msg as any).sdp));
        }

        if (msg.type === "ice") {
          try {
            await pc.addIceCandidate(new RTCIceCandidate((msg as any).candidate));
          } catch {}
        }

        if (msg.type === "hangup") {
          setStatus("Call ended");
          await stopAll();
          onClose();
        }
      };

      ws.onclose = () => {
        // If WS closes mid-call, show status but don’t crash
      };
    };

    start().catch((e) => {
      setStatus(e?.message || "Call failed");
    });

    return () => {
      cancelled = true;
      stopAll().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, callId, meIdStr, peerIdStr, initiator]);

  if (!open) return null;

  const toggleMute = () => {
    const s = localStreamRef.current;
    if (!s) return;
    const audio = s.getAudioTracks?.()[0];
    if (!audio) return;
    audio.enabled = muted; // flip
    setMuted(!muted);
  };

  const toggleCam = () => {
    const s = localStreamRef.current;
    if (!s) return;
    const vid = s.getVideoTracks?.()[0];
    if (!vid) return;
    vid.enabled = camOff; // flip
    setCamOff(!camOff);
  };

  return (
    <div className="fixed inset-0 z-[999] bg-black flex flex-col">
      <div className="p-4 flex items-center justify-between">
        <div className="text-white">
          <div className="font-semibold">{peerName || "Call"}</div>
          <div className="text-white/70 text-sm">{status}</div>
        </div>

        <button
          className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center"
          onClick={async () => {
            await stopAll();
            onClose();
          }}
          aria-label="Close"
        >
          <i className="fas fa-xmark" />
        </button>
      </div>

      {/* Video area */}
      <div className="flex-1 relative overflow-hidden">
        <video
          ref={remoteVideoRef}
          className="absolute inset-0 w-full h-full object-contain bg-black"
          playsInline
          autoPlay
        />

        <video
          ref={localVideoRef}
          className="absolute bottom-4 right-4 w-[120px] h-[160px] bg-black/60 rounded-xl object-cover border border-white/20"
          playsInline
          autoPlay
          muted
        />

        {mode === "audio" && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-white/90 text-lg">Audio call</div>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="p-4 flex items-center justify-center gap-4">
        <button
          className="w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center"
          onClick={toggleMute}
          aria-label="Mute"
        >
          <i className={`fas ${muted ? "fa-microphone-slash" : "fa-microphone"}`} />
        </button>

        {mode === "video" && (
          <button
            className="w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center"
            onClick={toggleCam}
            aria-label="Camera"
          >
            <i className={`fas ${camOff ? "fa-video-slash" : "fa-video"}`} />
          </button>
        )}

        <button
          className="w-14 h-14 rounded-full bg-red-600 hover:bg-red-700 text-white flex items-center justify-center"
          onClick={async () => {
            await stopAll();
            onClose();
          }}
          aria-label="Hang up"
        >
          <i className="fas fa-phone-slash" />
        </button>
      </div>

      <div style={{ height: "max(env(safe-area-inset-bottom), 8px)" }} />
    </div>
  );
};
