'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ThemeToggle } from '@/components/app/theme-toggle';

interface Escalation {
  id: number;
  reference_id: string;
  user_id: string;
  summary: string;
  urgency: string;
  language: string | null;
  preferred_follow_up: string | null;
  status: string;
  assigned_to?: string | null;
  internal_notes?: string | null;
  created_at: string;
  updated_at: string;
}

export default function DashboardPage() {
  const [escalations, setEscalations] = useState<Escalation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [urgencyFilter, setUrgencyFilter] = useState('all');
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Audio alert and notification states
  const [audioAlertEnabled, setAudioAlertEnabled] = useState(true);
  const [emergencyAlert, setEmergencyAlert] = useState<string | null>(null);
  const prevEmergencyCountRef = useRef<number>(0);

  // Edit drawer state
  const [editAssignedStaff, setEditAssignedStaff] = useState('');
  const [editNotes, setEditNotes] = useState('');

  // Web Audio chime synthesizer
  const playEmergencyChime = () => {
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();

      const now = ctx.currentTime;
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();

      osc1.type = 'triangle';
      osc1.frequency.setValueAtTime(880, now); // A5
      osc1.frequency.exponentialRampToValueAtTime(1174.66, now + 0.15); // D6

      gain1.gain.setValueAtTime(0.3, now);
      gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.35);

      osc1.connect(gain1);
      gain1.connect(ctx.destination);

      osc1.start(now);
      osc1.stop(now + 0.35);
    } catch (e) {
      console.log('Audio chime output prevented:', e);
    }
  };

  const fetchEscalations = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/escalations');
      const data = await res.json();
      if (res.ok && data.success) {
        const fetched: Escalation[] = data.escalations || [];
        setEscalations(fetched);

        // Check for new emergency items
        const newEmergencies = fetched.filter((e) => e.urgency.toLowerCase() === 'emergency');
        if (
          newEmergencies.length > prevEmergencyCountRef.current &&
          prevEmergencyCountRef.current !== 0
        ) {
          const latestEmergency = newEmergencies[0];
          setEmergencyAlert(
            `🚨 NEW EMERGENCY CASE RECEIVED (${latestEmergency.reference_id}): ${latestEmergency.summary}`
          );
          if (audioAlertEnabled) {
            playEmergencyChime();
          }
        }
        prevEmergencyCountRef.current = newEmergencies.length;
      } else {
        setError(data.error || 'Failed to fetch escalation requests');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEscalations();
    const interval = setInterval(fetchEscalations, 10000);
    return () => clearInterval(interval);
  }, [audioAlertEnabled]);

  const handleUpdateDetails = async (
    refId: string,
    payload: { status?: string; assigned_to?: string; internal_notes?: string }
  ) => {
    setUpdatingId(refId);
    try {
      const res = await fetch(`/api/escalations/${refId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setEscalations((prev) =>
          prev.map((item) => (item.reference_id === refId ? { ...item, ...payload } : item))
        );
      } else {
        alert(`Failed to update escalation: ${data.error || 'Unknown error'}`);
      }
    } catch (err) {
      alert(`Failed to update escalation: ${err instanceof Error ? err.message : 'Error'}`);
    } finally {
      setUpdatingId(null);
    }
  };

  const toggleExpand = (item: Escalation) => {
    if (expandedId === item.reference_id) {
      setExpandedId(null);
    } else {
      setExpandedId(item.reference_id);
      setEditAssignedStaff(item.assigned_to || '');
      setEditNotes(item.internal_notes || '');
    }
  };

  const exportToCsv = () => {
    if (filtered.length === 0) {
      alert('No escalation records available to export.');
      return;
    }

    const headers = [
      'Reference ID',
      'Urgency',
      'Caller ID',
      'Summary',
      'Language',
      'Follow-up Preference',
      'Status',
      'Assigned Staff',
      'Internal Notes',
      'Created At',
    ];

    const rows = filtered.map((e) => [
      `"${e.reference_id}"`,
      `"${e.urgency.toUpperCase()}"`,
      `"${e.user_id}"`,
      `"${e.summary.replace(/"/g, '""')}"`,
      `"${e.language || 'English'}"`,
      `"${e.preferred_follow_up || 'Phone'}"`,
      `"${e.status.toUpperCase()}"`,
      `"${(e.assigned_to || '').replace(/"/g, '""')}"`,
      `"${(e.internal_notes || '').replace(/"/g, '""')}"`,
      `"${new Date(e.created_at).toLocaleString()}"`,
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const today = new Date().toISOString().split('T')[0];

    link.href = url;
    link.setAttribute('download', `Swasthya_Sathi_Escalations_${today}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const filtered = escalations.filter((item) => {
    const matchesSearch =
      item.reference_id.toLowerCase().includes(search.toLowerCase()) ||
      item.summary.toLowerCase().includes(search.toLowerCase()) ||
      item.user_id.toLowerCase().includes(search.toLowerCase()) ||
      (item.assigned_to && item.assigned_to.toLowerCase().includes(search.toLowerCase()));
    const matchesStatus = statusFilter === 'all' || item.status.toLowerCase() === statusFilter;
    const matchesUrgency = urgencyFilter === 'all' || item.urgency.toLowerCase() === urgencyFilter;
    return matchesSearch && matchesStatus && matchesUrgency;
  });

  const totalCount = escalations.length;
  const emergencyCount = escalations.filter((e) => e.urgency.toLowerCase() === 'emergency').length;
  const openCount = escalations.filter((e) => e.status.toLowerCase() === 'open').length;
  const resolvedCount = escalations.filter((e) => e.status.toLowerCase() === 'resolved').length;

  const getUrgencyBadge = (urgency: string) => {
    const u = urgency.toLowerCase();
    switch (u) {
      case 'emergency':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/15 px-3 py-1 text-xs font-black text-rose-600 ring-1 ring-rose-500/30 dark:bg-rose-950/80 dark:text-rose-400">
            <span className="size-2 animate-ping rounded-full bg-rose-600 dark:bg-rose-400" />
            EMERGENCY
          </span>
        );
      case 'high':
        return (
          <span className="inline-flex items-center rounded-full bg-amber-500/15 px-3 py-1 text-xs font-extrabold text-amber-700 ring-1 ring-amber-500/30 dark:bg-amber-950/80 dark:text-amber-300">
            HIGH
          </span>
        );
      case 'medium':
        return (
          <span className="inline-flex items-center rounded-full bg-yellow-500/15 px-3 py-1 text-xs font-bold text-yellow-700 ring-1 ring-yellow-500/30 dark:bg-yellow-950/80 dark:text-yellow-300">
            MEDIUM
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center rounded-full bg-teal-500/15 px-3 py-1 text-xs font-bold text-teal-700 ring-1 ring-teal-500/30 dark:bg-teal-950/80 dark:text-teal-300">
            LOW
          </span>
        );
    }
  };

  const formatRelativeTime = (isoStr: string) => {
    const date = new Date(isoStr);
    const diffSec = Math.floor((Date.now() - date.getTime()) / 1000);
    if (diffSec < 60) return 'Just now';
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 transition-colors duration-300 dark:bg-slate-950 dark:text-slate-100">
      {/* Header Banner */}
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/85 backdrop-blur-xl transition-all duration-300 dark:border-slate-800/80 dark:bg-slate-900/85">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3.5 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-tr from-emerald-600 via-teal-600 to-emerald-500 text-xl font-black text-white shadow-md shadow-teal-900/20 dark:from-emerald-500 dark:to-teal-400">
              ✚
            </div>
            <div>
              <h1 className="bg-gradient-to-r from-slate-900 via-teal-950 to-emerald-900 bg-clip-text text-lg font-black tracking-tight text-transparent sm:text-xl dark:from-white dark:via-teal-100 dark:to-emerald-300">
                Swasthya Sathi
              </h1>
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                Human Assistance &amp; Escalation Dashboard
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={() => setAudioAlertEnabled(!audioAlertEnabled)}
              title="Toggle Web Audio Chime Alerts for Emergency Cases"
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition active:scale-95 ${
                audioAlertEnabled
                  ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-700/60 dark:bg-emerald-950/60 dark:text-emerald-300'
                  : 'border-slate-300 bg-slate-100 text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400'
              }`}
            >
              <span>{audioAlertEnabled ? '🔔 Alert Chime: ON' : '🔕 Alert Chime: OFF'}</span>
            </button>

            <button
              onClick={exportToCsv}
              title="Download Escalation Records as CSV"
              className="flex items-center gap-1.5 rounded-full border border-teal-300 bg-teal-50 px-3.5 py-1.5 text-xs font-bold text-teal-800 transition hover:bg-teal-100 active:scale-95 dark:border-teal-700/60 dark:bg-teal-950/60 dark:text-teal-300 dark:hover:bg-teal-900/80"
            >
              <span>📥 Export CSV</span>
            </button>

            <button
              onClick={fetchEscalations}
              disabled={loading}
              className="flex items-center gap-1.5 rounded-full border border-teal-200 bg-teal-50 px-3.5 py-1.5 text-xs font-bold text-teal-800 transition hover:bg-teal-100 active:scale-95 dark:border-teal-500/30 dark:bg-teal-950/60 dark:text-teal-300 dark:hover:bg-teal-900/80"
            >
              <svg
                className={`size-3.5 ${loading ? 'animate-spin' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="2.5"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
              {loading ? 'Refreshing...' : 'Refresh'}
            </button>

            <Link
              href="/analytics"
              className="flex items-center gap-1 rounded-full border border-slate-200 bg-slate-100 px-3 py-1.5 text-xs font-extrabold text-slate-700 transition hover:bg-slate-200 active:scale-95 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              <span>📊 Call Analytics</span>
            </Link>

            <Link
              href="/"
              className="rounded-full bg-gradient-to-r from-teal-600 to-emerald-600 px-4 py-1.5 text-xs font-black text-white shadow-sm transition hover:from-teal-500 hover:to-emerald-500 active:scale-95 dark:from-teal-500 dark:to-emerald-500 dark:text-slate-950 dark:hover:from-teal-400 dark:hover:to-emerald-400"
            >
              ← Back to Voice Agent
            </Link>

            <ThemeToggle size="md" />
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        {/* Emergency Alert Toast Banner */}
        {emergencyAlert && (
          <div className="mb-6 flex items-center justify-between rounded-2xl border border-rose-300 bg-rose-500/10 p-4 text-xs font-bold text-rose-700 shadow-md backdrop-blur-md dark:border-rose-500/30 dark:bg-rose-950/80 dark:text-rose-300">
            <div className="flex items-center gap-3">
              <span className="flex size-3">
                <span className="absolute inline-flex size-3 animate-ping rounded-full bg-rose-500 opacity-75"></span>
                <span className="relative inline-flex size-3 rounded-full bg-rose-500"></span>
              </span>
              <span>{emergencyAlert}</span>
            </div>
            <button
              onClick={() => setEmergencyAlert(null)}
              className="rounded-full bg-rose-200/50 px-2 py-0.5 text-rose-800 transition hover:bg-rose-300 dark:bg-rose-900/60 dark:text-rose-200"
            >
              ✕ Dismiss
            </button>
          </div>
        )}

        {/* Metric Cards */}
        <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-2xl border border-teal-100 bg-white p-4 shadow-xs dark:border-teal-500/20 dark:bg-slate-900">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
              Total Requests
            </span>
            <p className="mt-1 text-2xl font-black text-slate-900 dark:text-slate-100">
              {totalCount}
            </p>
          </div>

          <div className="rounded-2xl border border-rose-100 bg-white p-4 shadow-xs dark:border-rose-500/20 dark:bg-slate-900">
            <span className="text-xs font-bold text-rose-600 dark:text-rose-400">
              Emergency Urgency
            </span>
            <p className="mt-1 text-2xl font-black text-rose-600 dark:text-rose-400">
              {emergencyCount}
            </p>
          </div>

          <div className="rounded-2xl border border-amber-100 bg-white p-4 shadow-xs dark:border-amber-500/20 dark:bg-slate-900">
            <span className="text-xs font-bold text-amber-600 dark:text-amber-400">
              Open Requests
            </span>
            <p className="mt-1 text-2xl font-black text-amber-600 dark:text-amber-400">
              {openCount}
            </p>
          </div>

          <div className="rounded-2xl border border-emerald-100 bg-white p-4 shadow-xs dark:border-emerald-500/20 dark:bg-slate-900">
            <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
              Resolved Requests
            </span>
            <p className="mt-1 text-2xl font-black text-emerald-600 dark:text-emerald-400">
              {resolvedCount}
            </p>
          </div>
        </div>

        {/* Filter and Search Bar */}
        <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-teal-100 bg-white p-4 shadow-xs sm:flex-row sm:items-center sm:justify-between dark:border-teal-500/20 dark:bg-slate-900">
          <div className="relative flex-1">
            <input
              type="text"
              placeholder="Search reference ID (SS-1042), caller ID, staff member, or summary..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pr-3 pl-3 text-xs font-semibold text-slate-900 placeholder:text-slate-400 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div>
              <span className="mr-1.5 text-[11px] font-bold text-slate-500 dark:text-slate-400">
                Status:
              </span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-bold text-slate-800 focus:border-teal-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                <option value="all">All Statuses</option>
                <option value="open">Open</option>
                <option value="in_progress">In Progress</option>
                <option value="resolved">Resolved</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>

            <div>
              <span className="mr-1.5 text-[11px] font-bold text-slate-500 dark:text-slate-400">
                Urgency:
              </span>
              <select
                value={urgencyFilter}
                onChange={(e) => setUrgencyFilter(e.target.value)}
                className="rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-bold text-slate-800 focus:border-teal-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                <option value="all">All Urgencies</option>
                <option value="emergency">Emergency</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
          </div>
        </div>

        {/* Requests Table */}
        <div className="overflow-hidden rounded-2xl border border-teal-100 bg-white shadow-xl shadow-teal-900/5 dark:border-teal-500/20 dark:bg-slate-900">
          {error && (
            <div className="p-4 text-center text-xs font-bold text-rose-600 dark:text-rose-400">
              {error}
            </div>
          )}

          {loading && escalations.length === 0 ? (
            <div className="p-12 text-center text-xs font-bold text-slate-500 dark:text-slate-400">
              Loading human assistance requests...
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center text-slate-500 dark:text-slate-400">
              <svg
                className="mx-auto size-10 text-teal-400/50"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              <p className="mt-2 text-sm font-bold">No escalation requests found</p>
              <p className="text-xs">
                {search || statusFilter !== 'all' || urgencyFilter !== 'all'
                  ? 'Try clearing your filters'
                  : 'Escalation requests created by Swasthya Sathi will appear here.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-teal-100 bg-teal-50/60 font-black tracking-wider text-teal-950 uppercase dark:border-teal-500/20 dark:bg-slate-800/80 dark:text-teal-200">
                  <tr>
                    <th className="px-4 py-3">Ref ID</th>
                    <th className="px-4 py-3">Urgency</th>
                    <th className="px-4 py-3">Summary &amp; Notes</th>
                    <th className="px-4 py-3">Assigned Staff</th>
                    <th className="px-4 py-3">Follow-up</th>
                    <th className="px-4 py-3">Created</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium dark:divide-slate-800">
                  {filtered.map((item) => {
                    const isExpanded = expandedId === item.reference_id;
                    const isUpdating = updatingId === item.reference_id;

                    return (
                      <React.Fragment key={item.id}>
                        <tr className="transition hover:bg-slate-50/80 dark:hover:bg-slate-800/50">
                          <td className="px-4 py-3.5 font-black whitespace-nowrap text-teal-700 dark:text-teal-300">
                            {item.reference_id}
                          </td>
                          <td className="px-4 py-3.5 whitespace-nowrap">
                            {getUrgencyBadge(item.urgency)}
                          </td>
                          <td className="max-w-xs px-4 py-3.5 leading-relaxed font-medium text-slate-800 dark:text-slate-200">
                            <p>{item.summary}</p>
                            {item.internal_notes && (
                              <p className="mt-1 text-[11px] font-medium text-slate-500 italic dark:text-slate-400">
                                📝 Notes: {item.internal_notes}
                              </p>
                            )}
                          </td>
                          <td className="px-4 py-3.5 whitespace-nowrap">
                            {item.assigned_to ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-extrabold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                                👤 {item.assigned_to}
                              </span>
                            ) : (
                              <span className="text-[11px] font-semibold text-slate-400 italic">
                                Unassigned
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3.5 font-semibold whitespace-nowrap text-slate-600 dark:text-slate-400">
                            {item.preferred_follow_up || 'Phone'} ({item.language || 'English'})
                          </td>
                          <td className="px-4 py-3.5 whitespace-nowrap text-slate-500 dark:text-slate-400">
                            <span title={new Date(item.created_at).toLocaleString()}>
                              {formatRelativeTime(item.created_at)}
                            </span>
                          </td>
                          <td className="px-4 py-3.5 whitespace-nowrap">
                            <select
                              value={item.status.toLowerCase()}
                              disabled={isUpdating}
                              onChange={(e) =>
                                handleUpdateDetails(item.reference_id, { status: e.target.value })
                              }
                              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-extrabold text-slate-800 transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 focus:outline-none disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                            >
                              <option value="open">Open</option>
                              <option value="in_progress">In Progress</option>
                              <option value="resolved">Resolved</option>
                              <option value="cancelled">Cancelled</option>
                            </select>
                          </td>
                          <td className="px-4 py-3.5 text-right whitespace-nowrap">
                            <button
                              onClick={() => toggleExpand(item)}
                              className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                            >
                              {isExpanded ? 'Hide Details ▲' : 'Manage Case ▼'}
                            </button>
                          </td>
                        </tr>

                        {/* Expandable Case Drawer */}
                        {isExpanded && (
                          <tr className="bg-teal-50/40 dark:bg-slate-900/90">
                            <td colSpan={8} className="p-4 sm:p-6">
                              <div className="dark:bg-slate-850 rounded-2xl border border-teal-200/70 bg-white p-4 shadow-sm sm:p-5 dark:border-teal-500/30">
                                <div className="mb-4 flex flex-wrap items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
                                  <div>
                                    <h4 className="text-sm font-black text-slate-900 dark:text-white">
                                      Case Details &amp; Medical Operator Actions:{' '}
                                      {item.reference_id}
                                    </h4>
                                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                                      Caller ID:{' '}
                                      <span className="font-mono text-slate-700 dark:text-slate-300">
                                        {item.user_id}
                                      </span>{' '}
                                      | Created: {new Date(item.created_at).toLocaleString()}
                                    </p>
                                  </div>
                                  <span className="text-xs font-bold text-teal-700 dark:text-teal-300">
                                    Urgency Level: {item.urgency.toUpperCase()}
                                  </span>
                                </div>

                                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                                  {/* Staff Assignment */}
                                  <div>
                                    <label className="mb-1 block text-xs font-extrabold text-slate-700 dark:text-slate-300">
                                      Assigned Health Staff / Doctor
                                    </label>
                                    <input
                                      type="text"
                                      value={editAssignedStaff}
                                      onChange={(e) => setEditAssignedStaff(e.target.value)}
                                      placeholder="e.g. Dr. Ananya Roy, Nurse Rajiv Sharma"
                                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-900 focus:border-teal-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                                    />
                                    <div className="mt-2 flex flex-wrap gap-1.5">
                                      <span className="text-[10px] font-bold text-slate-400">
                                        Presets:
                                      </span>
                                      {['Dr. Ananya Roy', 'Nurse Rajiv Sharma', 'Duty Officer'].map(
                                        (name) => (
                                          <button
                                            key={name}
                                            type="button"
                                            onClick={() => setEditAssignedStaff(name)}
                                            className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600 transition hover:bg-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                                          >
                                            {name}
                                          </button>
                                        )
                                      )}
                                    </div>
                                  </div>

                                  {/* Internal Case Notes */}
                                  <div>
                                    <label className="mb-1 block text-xs font-extrabold text-slate-700 dark:text-slate-300">
                                      Internal Resolution &amp; Audit Notes
                                    </label>
                                    <textarea
                                      rows={2}
                                      value={editNotes}
                                      onChange={(e) => setEditNotes(e.target.value)}
                                      placeholder="Log clinical notes, follow-up status, or instructions..."
                                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-900 focus:border-teal-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                                    />
                                  </div>
                                </div>

                                <div className="mt-4 flex items-center justify-end gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                                  <button
                                    type="button"
                                    onClick={() => setExpandedId(null)}
                                    className="rounded-full px-3.5 py-1.5 text-xs font-bold text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    type="button"
                                    disabled={isUpdating}
                                    onClick={() => {
                                      handleUpdateDetails(item.reference_id, {
                                        assigned_to: editAssignedStaff,
                                        internal_notes: editNotes,
                                      });
                                      setExpandedId(null);
                                    }}
                                    className="rounded-full bg-gradient-to-r from-teal-600 to-emerald-600 px-4 py-1.5 text-xs font-extrabold text-white shadow-sm transition hover:from-teal-500 hover:to-emerald-500 active:scale-95 disabled:opacity-50 dark:from-teal-500 dark:to-emerald-500 dark:text-slate-950"
                                  >
                                    {isUpdating ? 'Saving...' : 'Save Case Details'}
                                  </button>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
