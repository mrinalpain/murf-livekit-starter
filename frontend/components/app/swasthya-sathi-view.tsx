'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Track } from 'livekit-client';
import { useSessionContext, useAgent, useSessionMessages, useTrackToggle } from '@livekit/components-react';
import { Button } from '@/components/ui/button';
import type { AppConfig } from '@/app-config';
import { AudioVisualizer } from '@/components/agents-ui/blocks/agent-session-view-01/components/audio-visualizer';

interface SwasthyaSathiViewProps {
  appConfig: AppConfig;
}

export function SwasthyaSathiView({ appConfig }: SwasthyaSathiViewProps) {
  const session = useSessionContext();
  const { isConnected, start, end, connectionState } = session;
  const agent = useAgent();
  const { messages } = useSessionMessages(session);

  // Local UI state management
  const [micBlocked, setMicBlocked] = useState(false);
  const [connectionFailed, setConnectionFailed] = useState(false);
  const [callEndedState, setCallEndedState] = useState(false);
  const [isStartingCall, setIsStartingCall] = useState(false);
  
  const transcriptScrollRef = useRef<HTMLDivElement>(null);
  const micToggle = useTrackToggle({ source: Track.Source.Microphone });

  // Auto-scroll transcript when new messages arrive
  useEffect(() => {
    if (transcriptScrollRef.current) {
      transcriptScrollRef.current.scrollTop = transcriptScrollRef.current.scrollHeight;
    }
  }, [messages, agent.state]);

  // Monitor agent failure reasons
  useEffect(() => {
    if (agent.state === 'failed') {
      setConnectionFailed(true);
    }
  }, [agent.state]);

  // Active state conditions
  const isConnecting = isStartingCall || connectionState === 'connecting' || agent.state === 'connecting' || agent.state === 'initializing';
  const isSpeaking = isConnected && (agent.state === 'speaking' || agent.state === 'thinking');
  const isListening = isConnected && !isSpeaking && (agent.state === 'listening' || agent.canListen);

  // Start call handler
  const handleStartCall = async () => {
    setMicBlocked(false);
    setConnectionFailed(false);
    setCallEndedState(false);
    setIsStartingCall(true);

    try {
      if (typeof window !== 'undefined' && navigator.permissions?.query) {
        try {
          const status = await navigator.permissions.query({ name: 'microphone' as PermissionName });
          if (status.state === 'denied') {
            setMicBlocked(true);
            setIsStartingCall(false);
            return;
          }
        } catch {
          // Ignore fallback
        }
      }

      await start();
    } catch (err: any) {
      console.error('Error starting conversation:', err);
      const errMsg = String(err?.message || err).toLowerCase();
      if (
        errMsg.includes('permission') ||
        errMsg.includes('denied') ||
        errMsg.includes('notallowederror') ||
        errMsg.includes('microphone')
      ) {
        setMicBlocked(true);
      } else {
        setConnectionFailed(true);
      }
    } finally {
      setIsStartingCall(false);
    }
  };

  // End call handler
  const handleEndCall = async () => {
    try {
      await end();
    } catch (err) {
      console.error('Error ending session:', err);
    } finally {
      setCallEndedState(true);
    }
  };

  // Restart call handler
  const handleStartNewConversation = () => {
    setCallEndedState(false);
    setMicBlocked(false);
    setConnectionFailed(false);
    handleStartCall();
  };

  // Mute toggle handler
  const handleToggleMute = async () => {
    try {
      await micToggle.toggle();
    } catch (e) {
      console.error('Mute toggle error:', e);
    }
  };

  return (
    <div className="relative h-screen w-full flex flex-col justify-between items-center bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 font-sans pt-16 pb-3 px-4 sm:px-8 overflow-hidden select-none transition-colors duration-300">
      
      {/* Ambient Background Light Orbs */}
      <div className="pointer-events-none absolute top-1/3 left-1/4 size-[400px] rounded-full bg-teal-400/10 dark:bg-teal-500/15 blur-[120px] z-0 animate-pulse" />
      <div className="pointer-events-none absolute bottom-10 right-1/4 size-[350px] rounded-full bg-emerald-400/10 dark:bg-emerald-500/10 blur-[100px] z-0" />

      {/* Side-by-Side Laptop Grid Container (Strictly Viewport Constrained) */}
      <div className="w-full max-w-6xl my-auto py-2 z-10 grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
        
        {/* LEFT COLUMN: Voice Agent & Interaction HUD */}
        <div className="relative backdrop-blur-2xl bg-white/90 dark:bg-slate-900/75 border border-teal-100 dark:border-teal-500/25 rounded-3xl p-6 sm:p-7 shadow-xl shadow-teal-900/5 dark:shadow-[0_0_40px_rgba(13,148,136,0.15)] flex flex-col justify-between gap-4 transition-colors duration-300">
          
          {/* Decorative Corner HUD Markers */}
          <div className="absolute top-3 left-3 size-2 border-t-2 border-l-2 border-teal-500/50 rounded-tl-xs pointer-events-none" />
          <div className="absolute top-3 right-3 size-2 border-t-2 border-r-2 border-teal-500/50 rounded-tr-xs pointer-events-none" />
          <div className="absolute bottom-3 left-3 size-2 border-b-2 border-l-2 border-teal-500/50 rounded-bl-xs pointer-events-none" />
          <div className="absolute bottom-3 right-3 size-2 border-b-2 border-r-2 border-teal-500/50 rounded-br-xs pointer-events-none" />

          {/* Agent Status Header */}
          <div className="text-center space-y-1">
            <AnimatePresence mode="wait">
              {micBlocked ? (
                <motion.div key="mic-error" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                  <span className="inline-flex items-center gap-1.5 px-3.5 py-0.5 rounded-full bg-red-100 dark:bg-red-950/80 text-red-700 dark:text-red-300 text-[11px] font-extrabold border border-red-200 dark:border-red-500/40">
                    🎙 MICROPHONE BLOCKED
                  </span>
                  <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white mt-1">
                    Microphone access is blocked
                  </h2>
                </motion.div>
              ) : connectionFailed ? (
                <motion.div key="conn-error" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                  <span className="inline-flex items-center gap-1.5 px-3.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 text-[11px] font-extrabold border border-amber-200 dark:border-amber-500/40">
                    ⚠️ CONNECTION ISSUE
                  </span>
                  <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white mt-1">
                    Unable to connect
                  </h2>
                </motion.div>
              ) : callEndedState ? (
                <motion.div key="ended" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                  <span className="inline-flex items-center gap-1.5 px-3.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 text-[11px] font-extrabold border border-emerald-200 dark:border-emerald-500/40">
                    ✓ SESSION COMPLETED
                  </span>
                  <h2 className="text-xl sm:text-2xl font-extrabold text-teal-950 dark:text-white mt-1">
                    Conversation ended
                  </h2>
                  <p className="text-xs sm:text-sm font-semibold text-emerald-600 dark:text-emerald-400">Take care!</p>
                </motion.div>
              ) : isConnecting ? (
                <motion.div key="connecting" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                  <span className="inline-flex items-center gap-1.5 px-3.5 py-0.5 rounded-full bg-teal-100 dark:bg-teal-950/80 text-teal-800 dark:text-teal-300 text-[11px] font-extrabold border border-teal-200 dark:border-teal-500/40">
                    <span className="size-2 rounded-full bg-teal-500 dark:bg-teal-400 animate-ping"></span>
                    CONNECTING...
                  </span>
                  <h2 className="text-xl sm:text-2xl font-extrabold text-teal-950 dark:text-white mt-1">
                    Connecting to Swasthya Sathi...
                  </h2>
                  <p className="text-xs sm:text-sm font-medium text-slate-500 dark:text-slate-400">Please wait</p>
                </motion.div>
              ) : isSpeaking ? (
                <motion.div key="speaking" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                  <span className="inline-flex items-center gap-1.5 px-3.5 py-0.5 rounded-full bg-teal-100 dark:bg-teal-950/90 text-teal-900 dark:text-teal-200 text-[11px] font-extrabold border border-teal-300 dark:border-teal-400/50 shadow-2xs dark:shadow-[0_0_15px_rgba(20,184,166,0.3)]">
                    <span className="size-2 rounded-full bg-teal-600 dark:bg-teal-400 animate-pulse"></span>
                    AGENT ACTIVE
                  </span>
                  <h2 className="text-xl sm:text-2xl font-black text-teal-900 dark:text-teal-200 mt-1">
                    🔊 Swasthya Sathi is speaking...
                  </h2>
                </motion.div>
              ) : isListening ? (
                <motion.div key="listening" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                  <span className="inline-flex items-center gap-1.5 px-3.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/90 text-emerald-900 dark:text-emerald-200 text-[11px] font-extrabold border border-emerald-300 dark:border-emerald-400/50 shadow-2xs dark:shadow-[0_0_15px_rgba(52,211,153,0.3)]">
                    <span className="size-2 rounded-full bg-emerald-600 dark:bg-emerald-400 animate-ping"></span>
                    YOUR TURN TO SPEAK
                  </span>
                  <h2 className="text-xl sm:text-2xl font-black text-emerald-900 dark:text-emerald-300 mt-1">
                    🎙 Listening to you...
                  </h2>
                  <p className="text-xs font-semibold text-emerald-700/80 dark:text-emerald-400/80">
                    Speak clearly in English, Hindi, or Bengali
                  </p>
                </motion.div>
              ) : (
                <motion.div key="ready" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                  <span className="inline-flex items-center gap-1.5 px-3.5 py-0.5 rounded-full bg-teal-50 dark:bg-teal-950/60 text-teal-800 dark:text-teal-300 text-[11px] font-extrabold border border-teal-200/80 dark:border-teal-500/30">
                    <span className="size-2 rounded-full bg-teal-500 dark:bg-teal-400"></span>
                    VOICE ASSISTANT READY
                  </span>
                  <h2 className="text-xl sm:text-2xl font-extrabold text-teal-950 dark:text-white mt-1">
                    Ready to help
                  </h2>
                  <p className="text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-400">
                    Tap below to start your conversation
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Centerpiece Audio Visualizer Area */}
          <div className="relative flex items-center justify-center py-4 my-auto min-h-[220px]">
            {micBlocked ? (
              <div className="flex flex-col items-center gap-3 text-center p-3">
                <div className="size-24 rounded-full bg-red-50 dark:bg-red-950/50 border-2 border-red-200 dark:border-red-500/40 flex items-center justify-center text-red-500 shadow-md">
                  <svg className="size-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                    <line x1="1" y1="1" x2="23" y2="23" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300 max-w-xs font-medium">
                  Please allow microphone access in your browser settings and try again.
                </p>
              </div>
            ) : connectionFailed ? (
              <div className="flex flex-col items-center gap-3 text-center p-3">
                <div className="size-24 rounded-full bg-amber-50 dark:bg-amber-950/50 border-2 border-amber-200 dark:border-amber-500/40 flex items-center justify-center text-amber-600 dark:text-amber-400 shadow-md">
                  <svg className="size-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300 max-w-xs font-medium">
                  We couldn&apos;t connect to Swasthya Sathi right now. Please check your network and try again.
                </p>
              </div>
            ) : callEndedState ? (
              <div className="flex flex-col items-center justify-center">
                <div className="size-24 rounded-full bg-emerald-50 dark:bg-emerald-950/60 border-2 border-emerald-200 dark:border-emerald-500/50 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shadow-lg">
                  <svg className="size-14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              </div>
            ) : isConnecting ? (
              <div className="relative flex items-center justify-center">
                <div className="absolute size-36 rounded-full border-4 border-teal-200 dark:border-teal-500/30 border-t-teal-600 dark:border-t-teal-400 animate-spin" />
                <div className="size-28 rounded-full bg-gradient-to-tr from-teal-500 to-emerald-500 flex items-center justify-center text-white shadow-xl shadow-teal-900/20 animate-pulse">
                  <svg className="size-14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.684a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                  </svg>
                </div>
              </div>
            ) : isConnected ? (
              <div className="flex flex-col items-center justify-center w-full">
                <div className="relative flex items-center justify-center h-[180px] w-full">
                  <AudioVisualizer
                    isChatOpen={false}
                    audioVisualizerType="bar"
                    audioVisualizerBarCount={7}
                    audioVisualizerColor="#0d9488"
                    className="size-[200px] place-self-center"
                  />
                  {isListening && (
                    <div className="absolute bottom-0 bg-emerald-50 dark:bg-emerald-950/90 border border-emerald-200 dark:border-emerald-400/50 text-emerald-800 dark:text-emerald-200 text-xs font-bold px-3.5 py-1 rounded-full shadow-2xs flex items-center gap-1.5">
                      <svg className="size-3.5 text-emerald-600 dark:text-emerald-400 animate-bounce" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
                        <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
                      </svg>
                      Listening to your voice...
                    </div>
                  )}
                  {isSpeaking && (
                    <div className="absolute bottom-0 bg-teal-50 dark:bg-teal-950/90 border border-teal-200 dark:border-teal-400/50 text-teal-800 dark:text-teal-200 text-xs font-bold px-3.5 py-1 rounded-full shadow-2xs flex items-center gap-1.5">
                      <svg className="size-3.5 text-teal-600 dark:text-teal-400 animate-pulse" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" />
                      </svg>
                      Speaking response...
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* Ready State Central Visual */
              <div className="relative flex items-center justify-center">
                <div className="absolute size-36 rounded-full bg-teal-200/50 dark:bg-teal-500/20 animate-ping" />
                <div className="absolute size-32 rounded-full bg-teal-100/70 dark:bg-teal-500/10 border border-teal-200/60 dark:border-teal-400/20" />
                <div className="relative size-28 rounded-full bg-gradient-to-br from-teal-600 to-emerald-600 text-white dark:text-slate-950 font-bold shadow-xl shadow-teal-700/20 dark:shadow-[0_0_35px_rgba(20,184,166,0.4)] flex items-center justify-center transform transition duration-300 hover:scale-105">
                  <svg className="size-14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                  </svg>
                </div>
              </div>
            )}
          </div>

          {/* Primary Action Buttons */}
          <div className="pt-2 flex flex-col items-center gap-3">
            {micBlocked || connectionFailed ? (
              <Button
                size="lg"
                onClick={handleStartCall}
                className="w-full max-w-sm h-14 rounded-full bg-teal-700 hover:bg-teal-800 dark:bg-gradient-to-r dark:from-teal-500 dark:to-emerald-500 text-white dark:text-slate-950 font-black text-base shadow-lg transition active:scale-98"
              >
                🔄 Try Again
              </Button>
            ) : callEndedState ? (
              <Button
                size="lg"
                onClick={handleStartNewConversation}
                className="w-full max-w-sm h-14 rounded-full bg-teal-700 hover:bg-teal-800 dark:bg-gradient-to-r dark:from-teal-500 dark:to-emerald-400 text-white dark:text-slate-950 font-extrabold text-base shadow-xl transition active:scale-98"
              >
                🎙 Start New Conversation
              </Button>
            ) : isConnecting ? (
              <Button
                size="lg"
                disabled
                className="w-full max-w-sm h-14 rounded-full bg-teal-100 dark:bg-teal-950/80 text-teal-800 dark:text-teal-300 font-bold text-base shadow-none opacity-90 cursor-not-allowed border border-teal-200 dark:border-teal-500/40"
              >
                <div className="size-5 border-2 border-teal-800 dark:border-teal-400 border-t-transparent rounded-full animate-spin mr-2" />
                Connecting...
              </Button>
            ) : isConnected ? (
              <div className="w-full flex items-center justify-center gap-3">
                {/* Mute Toggle Button */}
                <Button
                  variant="outline"
                  onClick={handleToggleMute}
                  className={`h-13 px-5 rounded-full border text-sm font-bold transition ${
                    !micToggle.enabled
                      ? 'bg-amber-50 dark:bg-amber-950/80 text-amber-800 dark:text-amber-200 border-amber-300 dark:border-amber-500/40'
                      : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-teal-200 border-slate-200 dark:border-teal-500/30 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  {!micToggle.enabled ? '🔇 Unmute' : '🎙 Mute'}
                </Button>

                {/* End Conversation Button */}
                <Button
                  size="lg"
                  onClick={handleEndCall}
                  className="h-13 px-8 rounded-full bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-base shadow-md shadow-rose-900/10 dark:shadow-[0_0_20px_rgba(225,29,72,0.4)] transition active:scale-98"
                >
                  🛑 End Conversation
                </Button>
              </div>
            ) : (
              /* Ready State Primary Action Button */
              <Button
                size="lg"
                onClick={handleStartCall}
                className="w-full max-w-sm h-14 sm:h-16 rounded-full bg-gradient-to-r from-teal-600 to-emerald-600 dark:from-teal-500 dark:via-emerald-400 dark:to-teal-400 text-white dark:text-slate-950 font-black text-lg tracking-wide shadow-xl shadow-teal-800/20 dark:shadow-[0_0_30px_rgba(20,184,166,0.45)] transition transform active:scale-98"
              >
                🎙 Start Conversation
              </Button>
            )}
          </div>

        </div>

        {/* RIGHT COLUMN: Realtime Live Transcript Box */}
        <div className="relative backdrop-blur-2xl bg-white/90 dark:bg-slate-900/75 border border-teal-100 dark:border-teal-500/25 rounded-3xl p-5 sm:p-6 shadow-xl shadow-teal-900/5 dark:shadow-[0_0_40px_rgba(13,148,136,0.15)] flex flex-col justify-between transition-colors duration-300 min-h-[360px]">
          
          {/* Transcript Header */}
          <div className="flex items-center justify-between pb-3 border-b border-teal-100 dark:border-teal-500/20 mb-3">
            <span className="text-xs font-black text-teal-800 dark:text-teal-300 tracking-widest uppercase flex items-center gap-2">
              <svg className="size-4 text-teal-600 dark:text-teal-400" fill="currentColor" viewBox="0 0 24 24">
                <path d="M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 9h12v2H6V9zm8 5H6v-2h8v2zm4-6H6V6h12v2z" />
              </svg>
              Live Transcript
            </span>
            <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/80 px-2.5 py-0.5 rounded-full border border-emerald-200/80 dark:border-emerald-500/30">
              REALTIME STREAM
            </span>
          </div>

          {/* Transcript Stream Box */}
          <div ref={transcriptScrollRef} className="flex-1 max-h-[320px] sm:max-h-[380px] overflow-y-auto space-y-3 pr-2 font-sans">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400 dark:text-slate-500 space-y-2">
                <svg className="size-10 text-teal-400/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                <p className="text-xs font-semibold">Your live conversation transcript will appear here.</p>
                <p className="text-[11px]">Start talking in English, Hindi, or Bengali once connected.</p>
              </div>
            ) : (
              messages.map((msg) => {
                const isUser = msg.from?.isLocal;
                return (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
                  >
                    <span className={`text-[11px] font-bold pb-0.5 ${isUser ? 'text-teal-700 dark:text-teal-300' : 'text-emerald-700 dark:text-emerald-300'}`}>
                      {isUser ? 'You' : 'Swasthya Sathi'}
                    </span>
                    <div
                      className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs sm:text-sm font-medium leading-relaxed shadow-2xs ${
                        isUser
                          ? 'bg-teal-600 dark:bg-teal-500 text-white dark:text-slate-950 font-semibold rounded-tr-xs'
                          : 'bg-slate-100 dark:bg-slate-800/90 text-slate-800 dark:text-slate-100 border border-teal-100 dark:border-teal-500/30 rounded-tl-xs'
                      }`}
                    >
                      {msg.message}
                    </div>
                  </div>
                );
              })
            )}
            {agent.state === 'thinking' && (
              <div className="flex items-center gap-2 text-xs font-bold text-teal-800 dark:text-teal-300 bg-teal-50 dark:bg-teal-950/60 p-2 rounded-xl border border-teal-200/80 dark:border-teal-500/30 w-fit">
                <span className="size-2 rounded-full bg-teal-600 dark:bg-teal-400 animate-ping"></span>
                Swasthya Sathi is processing...
              </div>
            )}
          </div>

          {/* Transcript Footer Helper */}
          <div className="pt-2 border-t border-teal-100 dark:border-teal-500/20 text-[11px] text-slate-500 dark:text-slate-400 font-medium text-center">
            Automatic Speech Recognition &bull; Powered by LiveKit &amp; Murf Falcon
          </div>
        </div>

      </div>

      {/* Footer Medical Disclaimer */}
      <footer className="w-full max-w-lg text-center text-[10px] sm:text-xs text-teal-800/80 dark:text-teal-300/70 font-medium py-1 z-10">
        <p>Swasthya Sathi provides AI health support &amp; voice companion services. For medical emergencies, call emergency services immediately.</p>
      </footer>
    </div>
  );
}
