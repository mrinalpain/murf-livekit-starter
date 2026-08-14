'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Track } from 'livekit-client';
import { AnimatePresence, motion } from 'motion/react';
import {
  useAgent,
  useSessionContext,
  useSessionMessages,
  useTrackToggle,
} from '@livekit/components-react';
import type { AppConfig } from '@/app-config';
import { AudioVisualizer } from '@/components/agents-ui/blocks/agent-session-view-01/components/audio-visualizer';
import { ThemeToggle } from '@/components/app/theme-toggle';
import { Button } from '@/components/ui/button';

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
  const [outboundStatus, setOutboundStatus] = useState<string | null>(null);
  const [isTriggeringOutbound, setIsTriggeringOutbound] = useState(false);

  const handleTriggerOutboundCall = async () => {
    setIsTriggeringOutbound(true);
    setOutboundStatus(null);
    try {
      const res = await fetch('/api/outbound', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason: 'Follow-up after health consultation',
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setOutboundStatus('Outbound call initiated! Linphone should ring shortly.');
      } else {
        setOutboundStatus(`Call failed: ${data.error || 'Unknown error'}`);
      }
    } catch (err) {
      setOutboundStatus(`Call failed: ${err instanceof Error ? err.message : 'Error'}`);
    } finally {
      setIsTriggeringOutbound(false);
    }
  };

  const transcriptScrollRef = useRef<HTMLDivElement>(null);
  const micToggle = useTrackToggle({ source: Track.Source.Microphone });

  // Auto-scroll transcript when new messages arrive
  useEffect(() => {
    if (transcriptScrollRef.current) {
      transcriptScrollRef.current.scrollTop = transcriptScrollRef.current.scrollHeight;
    }
  }, [messages, agent.state]);

  // Detect if an escalation reference ID was generated in the conversation
  const escalationRefId = React.useMemo(() => {
    for (const m of messages) {
      if (m.message && m.message.includes('SS-')) {
        const match = m.message.match(/SS-\d{4}/);
        if (match) {
          return match[0];
        }
      }
    }
    return null;
  }, [messages]);

  // Detect active agent (Clinic Specialist vs Main Assistant)
  const isClinicSpecialist = React.useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const text = (messages[i].message || '').toLowerCase();
      if (
        text.includes('clinic specialist') ||
        text.includes('appointment specialist') ||
        text.includes('clinic and appointment specialist') ||
        text.includes('hospital and appointment')
      ) {
        return true;
      }
      if (
        text.includes('main healthcare assistant') ||
        text.includes('main assistant') ||
        text.includes('connect you back')
      ) {
        return false;
      }
    }
    return false;
  }, [messages]);

  // Monitor agent failure reasons
  useEffect(() => {
    if (agent.state === 'failed') {
      setConnectionFailed(true);
    }
  }, [agent.state]);

  // Active state conditions
  const isConnecting =
    isStartingCall ||
    connectionState === 'connecting' ||
    agent.state === 'connecting' ||
    agent.state === 'initializing';
  const isSpeaking = isConnected && (agent.state === 'speaking' || agent.state === 'thinking');
  const isListening =
    isConnected && !isSpeaking && (agent.state === 'listening' || agent.canListen);

  // Start call handler
  const handleStartCall = async () => {
    setMicBlocked(false);
    setConnectionFailed(false);
    setCallEndedState(false);
    setIsStartingCall(true);

    try {
      if (typeof window !== 'undefined' && navigator.permissions?.query) {
        try {
          const status = await navigator.permissions.query({
            name: 'microphone' as PermissionName,
          });
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
    } catch (e) {
      console.error('Error ending call:', e);
    } finally {
      setIsStartingCall(false);
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
    <div className="relative flex h-screen w-full flex-col items-center justify-between overflow-hidden bg-slate-50 px-4 pt-4 pb-3 font-sans text-slate-800 transition-colors duration-300 select-none sm:px-8 dark:bg-slate-950 dark:text-slate-100">
      {/* Ambient Background Light Orbs */}
      <div className="pointer-events-none absolute top-1/3 left-1/4 z-0 size-[400px] animate-pulse rounded-full bg-teal-400/10 blur-[120px] dark:bg-teal-500/15" />
      <div className="pointer-events-none absolute right-1/4 bottom-10 z-0 size-[350px] rounded-full bg-emerald-400/10 blur-[100px] dark:bg-emerald-500/10" />

      {/* Top Navigation Bar Header */}
      <header className="z-30 w-full max-w-6xl rounded-2xl border border-slate-200/80 bg-white/80 p-2.5 shadow-sm backdrop-blur-xl transition-all duration-300 dark:border-slate-800/80 dark:bg-slate-900/80 dark:shadow-teal-950/30">
        <div className="flex flex-wrap items-center justify-between gap-3 px-1">
          {/* Left Logo & App Title */}
          <div className="flex items-center gap-3">
            <div className="relative flex size-10 items-center justify-center rounded-xl bg-gradient-to-tr from-emerald-600 via-teal-600 to-emerald-500 text-white shadow-md ring-1 shadow-emerald-500/25 ring-white/20 dark:from-emerald-500 dark:to-teal-400">
              <svg className="size-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
              </svg>
              <span className="absolute -top-0.5 -right-0.5 flex size-2.5">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex size-2.5 rounded-full bg-emerald-400"></span>
              </span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="bg-gradient-to-r from-slate-900 via-teal-950 to-emerald-900 bg-clip-text text-base font-black tracking-tight text-transparent sm:text-lg dark:from-white dark:via-teal-100 dark:to-emerald-300">
                  Swasthya Sathi
                </h1>
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-extrabold tracking-wider text-emerald-700 uppercase dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-300">
                  <span className="size-1.5 animate-pulse rounded-full bg-emerald-500 dark:bg-emerald-400" />
                  Voice Companion
                </span>
              </div>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Your voice companion for everyday health
              </p>
            </div>
          </div>

          {/* Center Language Indicator Pill & Tech Badge */}
          <div className="hidden items-center gap-2 lg:flex">
            <div className="flex items-center gap-1.5 rounded-full border border-teal-200/80 bg-teal-50/80 px-3.5 py-1 text-xs font-bold text-teal-900 shadow-2xs dark:border-teal-800/80 dark:bg-teal-950/60 dark:text-teal-200">
              <span className="text-teal-600 dark:text-teal-400">🌐</span>
              <span>English &bull; हिंदी &bull; বাংলা</span>
            </div>
            <a
              target="_blank"
              rel="noopener noreferrer"
              href="https://docs.livekit.io/agents"
              className="rounded-full border border-slate-200/70 bg-slate-100/60 px-2.5 py-1 text-[11px] font-bold text-slate-600 transition hover:bg-slate-200/80 hover:text-slate-900 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            >
              LiveKit &amp; Murf AI
            </a>
          </div>

          {/* Right Controls */}
          <div className="flex items-center gap-2.5">
            <Link
              href="/analytics"
              className="group flex items-center gap-1.5 rounded-full border border-teal-200 bg-teal-50 px-3.5 py-1.5 text-xs font-extrabold text-teal-800 transition hover:bg-teal-100 active:scale-95 dark:border-teal-500/30 dark:bg-teal-950/60 dark:text-teal-300 dark:hover:bg-teal-900/80"
            >
              <span className="transition-transform group-hover:scale-110">📊</span>
              <span>Call Analytics</span>
            </Link>

            <Link
              href="/dashboard"
              className="group flex items-center gap-1.5 rounded-full bg-gradient-to-r from-teal-600 to-emerald-600 px-3.5 py-1.5 text-xs font-extrabold text-white shadow-md shadow-teal-600/20 transition-all duration-200 hover:from-teal-500 hover:to-emerald-500 hover:shadow-lg hover:shadow-teal-600/30 active:scale-95 dark:from-teal-500 dark:to-emerald-500 dark:text-slate-950 dark:hover:from-teal-400 dark:hover:to-emerald-400"
            >
              <span className="transition-transform group-hover:scale-110">📋</span>
              <span>Escalations</span>
            </Link>

            <ThemeToggle size="md" />
          </div>
        </div>
      </header>

      {/* Side-by-Side Laptop Grid Container (Strictly Viewport Constrained) */}
      <div className="z-10 my-auto grid w-full max-w-6xl grid-cols-1 items-stretch gap-6 py-2 lg:grid-cols-2">
        {/* LEFT COLUMN: Voice Agent & Interaction HUD */}
        <div className="relative flex flex-col justify-between gap-4 rounded-3xl border border-teal-100 bg-white/90 p-6 shadow-xl shadow-teal-900/5 backdrop-blur-2xl transition-colors duration-300 sm:p-7 dark:border-teal-500/25 dark:bg-slate-900/75 dark:shadow-[0_0_40px_rgba(13,148,136,0.15)]">
          {/* Decorative Corner HUD Markers */}
          <div className="pointer-events-none absolute top-3 left-3 size-2 rounded-tl-xs border-t-2 border-l-2 border-teal-500/50" />
          <div className="pointer-events-none absolute top-3 right-3 size-2 rounded-tr-xs border-t-2 border-r-2 border-teal-500/50" />
          <div className="pointer-events-none absolute bottom-3 left-3 size-2 rounded-bl-xs border-b-2 border-l-2 border-teal-500/50" />
          <div className="pointer-events-none absolute right-3 bottom-3 size-2 rounded-br-xs border-r-2 border-b-2 border-teal-500/50" />

          {/* Agent Status Header */}
          <div className="space-y-1 text-center">
            <AnimatePresence mode="wait">
              {micBlocked ? (
                <motion.div
                  key="mic-error"
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                >
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-red-100 px-3.5 py-0.5 text-[11px] font-extrabold text-red-700 dark:border-red-500/40 dark:bg-red-950/80 dark:text-red-300">
                    🎙 MICROPHONE BLOCKED
                  </span>
                  <h2 className="mt-1 text-xl font-bold text-slate-900 sm:text-2xl dark:text-white">
                    Microphone access is blocked
                  </h2>
                </motion.div>
              ) : connectionFailed ? (
                <motion.div
                  key="conn-error"
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                >
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-100 px-3.5 py-0.5 text-[11px] font-extrabold text-amber-800 dark:border-amber-500/40 dark:bg-amber-950/80 dark:text-amber-300">
                    ⚠️ CONNECTION ISSUE
                  </span>
                  <h2 className="mt-1 text-xl font-bold text-slate-900 sm:text-2xl dark:text-white">
                    Unable to connect
                  </h2>
                </motion.div>
              ) : callEndedState ? (
                <motion.div
                  key="ended"
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                >
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-100 px-3.5 py-0.5 text-[11px] font-extrabold text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-950/80 dark:text-emerald-300">
                    ✓ SESSION COMPLETED
                  </span>
                  <h2 className="mt-1 text-xl font-extrabold text-teal-950 sm:text-2xl dark:text-white">
                    Conversation ended
                  </h2>
                  <p className="text-xs font-semibold text-emerald-600 sm:text-sm dark:text-emerald-400">
                    Take care!
                  </p>
                </motion.div>
              ) : isConnecting ? (
                <motion.div
                  key="connecting"
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                >
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-200 bg-teal-100 px-3.5 py-0.5 text-[11px] font-extrabold text-teal-800 dark:border-teal-500/40 dark:bg-teal-950/80 dark:text-teal-300">
                    <span className="size-2 animate-ping rounded-full bg-teal-500 dark:bg-teal-400"></span>
                    CONNECTING...
                  </span>
                  <h2 className="mt-1 text-xl font-extrabold text-teal-950 sm:text-2xl dark:text-white">
                    Connecting to Swasthya Sathi...
                  </h2>
                  <p className="text-xs font-medium text-slate-500 sm:text-sm dark:text-slate-400">
                    Please wait
                  </p>
                </motion.div>
              ) : isSpeaking ? (
                <motion.div
                  key="speaking"
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                >
                  {isClinicSpecialist ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-300 bg-sky-100 px-3.5 py-0.5 text-[11px] font-extrabold text-sky-900 shadow-2xs dark:border-sky-400/50 dark:bg-sky-950/90 dark:text-sky-200 dark:shadow-[0_0_15px_rgba(56,189,248,0.3)]">
                      <span className="size-2 animate-pulse rounded-full bg-sky-600 dark:bg-sky-400"></span>
                      CLINIC &amp; APPOINTMENT SPECIALIST
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-300 bg-teal-100 px-3.5 py-0.5 text-[11px] font-extrabold text-teal-900 shadow-2xs dark:border-teal-400/50 dark:bg-teal-950/90 dark:text-teal-200 dark:shadow-[0_0_15px_rgba(20,184,166,0.3)]">
                      <span className="size-2 animate-pulse rounded-full bg-teal-600 dark:bg-teal-400"></span>
                      MAIN HEALTHCARE ASSISTANT
                    </span>
                  )}
                  <h2 className="mt-1 text-xl font-black text-teal-900 sm:text-2xl dark:text-teal-200">
                    🔊 {isClinicSpecialist ? 'Clinic Specialist' : 'Swasthya Sathi'} is speaking...
                  </h2>
                </motion.div>
              ) : isListening ? (
                <motion.div
                  key="listening"
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                >
                  {isClinicSpecialist ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-300 bg-sky-100 px-3.5 py-0.5 text-[11px] font-extrabold text-sky-900 shadow-2xs dark:border-sky-400/50 dark:bg-sky-950/90 dark:text-sky-200 dark:shadow-[0_0_15px_rgba(56,189,248,0.3)]">
                      <span className="size-2 animate-ping rounded-full bg-sky-600 dark:bg-sky-400"></span>
                      CLINIC SPECIALIST LISTENING
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300 bg-emerald-100 px-3.5 py-0.5 text-[11px] font-extrabold text-emerald-900 shadow-2xs dark:border-emerald-400/50 dark:bg-emerald-950/90 dark:text-emerald-200 dark:shadow-[0_0_15px_rgba(52,211,153,0.3)]">
                      <span className="size-2 animate-ping rounded-full bg-emerald-600 dark:bg-emerald-400"></span>
                      YOUR TURN TO SPEAK
                    </span>
                  )}
                  <h2 className="mt-1 text-xl font-black text-emerald-900 sm:text-2xl dark:text-emerald-300">
                    🎙 Listening to you...
                  </h2>
                  <p className="text-xs font-semibold text-emerald-700/80 dark:text-emerald-400/80">
                    Speak clearly in English, Hindi, or Bengali
                  </p>
                </motion.div>
              ) : (
                <motion.div
                  key="ready"
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                >
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-200/80 bg-teal-50 px-3.5 py-0.5 text-[11px] font-extrabold text-teal-800 dark:border-teal-500/30 dark:bg-teal-950/60 dark:text-teal-300">
                      <span className="size-2 rounded-full bg-teal-500 dark:bg-teal-400"></span>
                      VOICE ASSISTANT READY
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full border border-indigo-200/80 bg-indigo-50 px-2.5 py-0.5 text-[10px] font-semibold text-indigo-700 dark:border-indigo-500/30 dark:bg-indigo-950/60 dark:text-indigo-300">
                      ✨ Memory Active
                    </span>
                  </div>
                  <h2 className="mt-1 text-xl font-extrabold text-teal-950 sm:text-2xl dark:text-white">
                    Ready to help
                  </h2>
                  <p className="text-xs font-medium text-slate-600 sm:text-sm dark:text-slate-400">
                    Tap below to start your conversation
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Centerpiece Audio Visualizer Area */}
          <div className="relative my-auto flex min-h-[220px] items-center justify-center py-4">
            {micBlocked ? (
              <div className="flex flex-col items-center gap-3 p-3 text-center">
                <div className="flex size-24 items-center justify-center rounded-full border-2 border-red-200 bg-red-50 text-red-500 shadow-md dark:border-red-500/40 dark:bg-red-950/50">
                  <svg
                    className="size-12"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                    />
                    <line
                      x1="1"
                      y1="1"
                      x2="23"
                      y2="23"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  </svg>
                </div>
                <p className="max-w-xs text-xs font-medium text-slate-600 dark:text-slate-300">
                  Please allow microphone access in your browser settings and try again.
                </p>
              </div>
            ) : connectionFailed ? (
              <div className="flex flex-col items-center gap-3 p-3 text-center">
                <div className="flex size-24 items-center justify-center rounded-full border-2 border-amber-200 bg-amber-50 text-amber-600 shadow-md dark:border-amber-500/40 dark:bg-amber-950/50 dark:text-amber-400">
                  <svg
                    className="size-12"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                    />
                  </svg>
                </div>
                <p className="max-w-xs text-xs font-medium text-slate-600 dark:text-slate-300">
                  We couldn&apos;t connect to Swasthya Sathi right now. Please check your network
                  and try again.
                </p>
              </div>
            ) : callEndedState ? (
              <div className="flex flex-col items-center justify-center">
                <div className="flex size-24 items-center justify-center rounded-full border-2 border-emerald-200 bg-emerald-50 text-emerald-600 shadow-lg dark:border-emerald-500/50 dark:bg-emerald-950/60 dark:text-emerald-400">
                  <svg
                    className="size-14"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth="2.5"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              </div>
            ) : isConnecting ? (
              <div className="relative flex items-center justify-center">
                <div className="absolute size-36 animate-spin rounded-full border-4 border-teal-200 border-t-teal-600 dark:border-teal-500/30 dark:border-t-teal-400" />
                <div className="flex size-28 animate-pulse items-center justify-center rounded-full bg-gradient-to-tr from-teal-500 to-emerald-500 text-white shadow-xl shadow-teal-900/20">
                  <svg
                    className="size-14"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.684a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
                    />
                  </svg>
                </div>
              </div>
            ) : isConnected ? (
              <div className="flex w-full flex-col items-center justify-center">
                <div className="relative flex h-[180px] w-full items-center justify-center">
                  <AudioVisualizer
                    isChatOpen={false}
                    audioVisualizerType="bar"
                    audioVisualizerBarCount={7}
                    audioVisualizerColor="#0d9488"
                    className="size-[200px] place-self-center"
                  />
                  {isListening && (
                    <div className="absolute bottom-0 flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3.5 py-1 text-xs font-bold text-emerald-800 shadow-2xs dark:border-emerald-400/50 dark:bg-emerald-950/90 dark:text-emerald-200">
                      <svg
                        className="size-3.5 animate-bounce text-emerald-600 dark:text-emerald-400"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
                        <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
                      </svg>
                      Listening to your voice...
                    </div>
                  )}
                  {isSpeaking && (
                    <div className="absolute bottom-0 flex items-center gap-1.5 rounded-full border border-teal-200 bg-teal-50 px-3.5 py-1 text-xs font-bold text-teal-800 shadow-2xs dark:border-teal-400/50 dark:bg-teal-950/90 dark:text-teal-200">
                      <svg
                        className="size-3.5 animate-pulse text-teal-600 dark:text-teal-400"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                      >
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
                <div className="absolute size-36 animate-ping rounded-full bg-teal-200/50 dark:bg-teal-500/20" />
                <div className="absolute size-32 rounded-full border border-teal-200/60 bg-teal-100/70 dark:border-teal-400/20 dark:bg-teal-500/10" />
                <div className="relative flex size-28 transform items-center justify-center rounded-full bg-gradient-to-br from-teal-600 to-emerald-600 font-bold text-white shadow-xl shadow-teal-700/20 transition duration-300 hover:scale-105 dark:text-slate-950 dark:shadow-[0_0_35px_rgba(20,184,166,0.4)]">
                  <svg
                    className="size-14"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth="2.2"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                    />
                  </svg>
                </div>
              </div>
            )}
          </div>

          {/* Primary Action Buttons */}
          <div className="flex flex-col items-center gap-3 pt-2">
            {escalationRefId && (
              <div className="flex w-full max-w-sm items-center justify-between rounded-xl border border-amber-300 bg-amber-50/90 px-3.5 py-2 text-xs font-bold text-amber-900 shadow-2xs dark:border-amber-500/40 dark:bg-amber-950/80 dark:text-amber-200">
                <div className="flex items-center gap-2">
                  <span className="size-2 animate-pulse rounded-full bg-amber-600 dark:bg-amber-400" />
                  <span>Human Request Sent</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-extrabold">{escalationRefId}</span>
                  <Link
                    href="/dashboard"
                    className="underline hover:text-amber-700 dark:hover:text-amber-300"
                  >
                    View
                  </Link>
                </div>
              </div>
            )}
            {micBlocked || connectionFailed ? (
              <Button
                size="lg"
                onClick={handleStartCall}
                className="h-14 w-full max-w-sm rounded-full bg-teal-700 text-base font-black text-white shadow-lg transition hover:bg-teal-800 active:scale-98 dark:bg-gradient-to-r dark:from-teal-500 dark:to-emerald-500 dark:text-slate-950"
              >
                🔄 Try Again
              </Button>
            ) : callEndedState ? (
              <Button
                size="lg"
                onClick={handleStartNewConversation}
                className="h-14 w-full max-w-sm rounded-full bg-teal-700 text-base font-extrabold text-white shadow-xl transition hover:bg-teal-800 active:scale-98 dark:bg-gradient-to-r dark:from-teal-500 dark:to-emerald-400 dark:text-slate-950"
              >
                🎙 Start New Conversation
              </Button>
            ) : isConnecting ? (
              <Button
                size="lg"
                disabled
                className="h-14 w-full max-w-sm cursor-not-allowed rounded-full border border-teal-200 bg-teal-100 text-base font-bold text-teal-800 opacity-90 shadow-none dark:border-teal-500/40 dark:bg-teal-950/80 dark:text-teal-300"
              >
                <div className="mr-2 size-5 animate-spin rounded-full border-2 border-teal-800 border-t-transparent dark:border-teal-400" />
                Connecting...
              </Button>
            ) : isConnected ? (
              <div className="flex w-full items-center justify-center gap-3">
                {/* Mute Toggle Button */}
                <Button
                  variant="outline"
                  onClick={handleToggleMute}
                  className={`h-13 rounded-full border px-5 text-sm font-bold transition ${
                    !micToggle.enabled
                      ? 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-500/40 dark:bg-amber-950/80 dark:text-amber-200'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-teal-500/30 dark:bg-slate-900 dark:text-teal-200 dark:hover:bg-slate-800'
                  }`}
                >
                  {!micToggle.enabled ? '🔇 Unmute' : '🎙 Mute'}
                </Button>

                {/* End Conversation Button */}
                <Button
                  size="lg"
                  onClick={handleEndCall}
                  className="h-13 rounded-full bg-rose-600 px-8 text-base font-extrabold text-white shadow-md shadow-rose-900/10 transition hover:bg-rose-700 active:scale-98 dark:shadow-[0_0_20px_rgba(225,29,72,0.4)]"
                >
                  🛑 End Conversation
                </Button>
              </div>
            ) : (
              /* Ready State Primary Action Button */
              <div className="flex w-full flex-col items-center gap-3">
                <Button
                  size="lg"
                  onClick={handleStartCall}
                  className="h-14 w-full max-w-sm transform rounded-full bg-gradient-to-r from-teal-600 to-emerald-600 text-lg font-black tracking-wide text-white shadow-xl shadow-teal-800/20 transition active:scale-98 sm:h-16 dark:from-teal-500 dark:via-emerald-400 dark:to-teal-400 dark:text-slate-950 dark:shadow-[0_0_30px_rgba(20,184,166,0.45)]"
                >
                  🎙 Start Conversation
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  disabled={isTriggeringOutbound}
                  onClick={handleTriggerOutboundCall}
                  className="w-full max-w-sm rounded-full border-teal-200/80 bg-teal-50/50 py-2.5 text-xs font-extrabold text-teal-800 transition hover:bg-teal-100 dark:border-teal-500/30 dark:bg-teal-950/40 dark:text-teal-300 dark:hover:bg-teal-900/60"
                >
                  {isTriggeringOutbound
                    ? 'Initiating Call...'
                    : '📞 Trigger Outbound Follow-up Call (Linphone)'}
                </Button>
                {outboundStatus && (
                  <p className="text-center text-xs font-semibold text-teal-700 dark:text-teal-300">
                    {outboundStatus}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: Realtime Live Transcript Box */}
        <div className="relative flex min-h-[360px] flex-col justify-between rounded-3xl border border-teal-100 bg-white/90 p-5 shadow-xl shadow-teal-900/5 backdrop-blur-2xl transition-colors duration-300 sm:p-6 dark:border-teal-500/25 dark:bg-slate-900/75 dark:shadow-[0_0_40px_rgba(13,148,136,0.15)]">
          {/* Transcript Header */}
          <div className="mb-3 flex items-center justify-between border-b border-teal-100 pb-3 dark:border-teal-500/20">
            <span className="flex items-center gap-2 text-xs font-black tracking-widest text-teal-800 uppercase dark:text-teal-300">
              <svg
                className="size-4 text-teal-600 dark:text-teal-400"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 9h12v2H6V9zm8 5H6v-2h8v2zm4-6H6V6h12v2z" />
              </svg>
              Live Transcript
            </span>
            <span className="rounded-full border border-emerald-200/80 bg-emerald-50 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-950/80 dark:text-emerald-400">
              REALTIME STREAM
            </span>
          </div>

          {/* Transcript Stream Box */}
          <div
            ref={transcriptScrollRef}
            className="max-h-[320px] flex-1 space-y-3 overflow-y-auto pr-2 font-sans sm:max-h-[380px]"
          >
            {messages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center space-y-2 p-6 text-center text-slate-400 dark:text-slate-500">
                <svg
                  className="size-10 text-teal-400/40"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth="1.5"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                  />
                </svg>
                <p className="text-xs font-semibold">
                  Your live conversation transcript will appear here.
                </p>
                <p className="text-[11px]">
                  Start talking in English, Hindi, or Bengali once connected.
                </p>
              </div>
            ) : (
              messages.map((msg) => {
                const isUser = msg.from?.isLocal;
                return (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
                  >
                    <span
                      className={`pb-0.5 text-[11px] font-bold ${isUser ? 'text-teal-700 dark:text-teal-300' : 'text-emerald-700 dark:text-emerald-300'}`}
                    >
                      {isUser ? 'You' : 'Swasthya Sathi'}
                    </span>
                    <div
                      className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed font-medium shadow-2xs sm:text-sm ${
                        isUser
                          ? 'rounded-tr-xs bg-teal-600 font-semibold text-white dark:bg-teal-500 dark:text-slate-950'
                          : 'rounded-tl-xs border border-teal-100 bg-slate-100 text-slate-800 dark:border-teal-500/30 dark:bg-slate-800/90 dark:text-slate-100'
                      }`}
                    >
                      {msg.message}
                    </div>
                  </div>
                );
              })
            )}
            {agent.state === 'thinking' && (
              <div className="flex w-fit items-center gap-2 rounded-xl border border-teal-200/80 bg-teal-50 p-2 text-xs font-bold text-teal-800 dark:border-teal-500/30 dark:bg-teal-950/60 dark:text-teal-300">
                <span className="size-2 animate-ping rounded-full bg-teal-600 dark:bg-teal-400"></span>
                Swasthya Sathi is processing...
              </div>
            )}
          </div>

          {/* Transcript Footer Helper */}
          <div className="border-t border-teal-100 pt-2 text-center text-[11px] font-medium text-slate-500 dark:border-teal-500/20 dark:text-slate-400">
            Automatic Speech Recognition &bull; Powered by LiveKit &amp; Murf Falcon
          </div>
        </div>
      </div>

      {/* Footer Medical Disclaimer */}
      <footer className="z-10 w-full max-w-lg py-1 text-center text-[10px] font-medium text-teal-800/80 sm:text-xs dark:text-teal-300/70">
        <p>
          Swasthya Sathi provides AI health support &amp; voice companion services. For medical
          emergencies, call emergency services immediately.
        </p>
      </footer>
    </div>
  );
}
