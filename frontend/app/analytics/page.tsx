'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { ThemeToggle } from '@/components/app/theme-toggle';

interface CallRecord {
  id: number;
  call_id: string;
  user_id: string | null;
  channel: string;
  language: string | null;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number;
  outcome: string;
  outcome_reason: string;
  created_at: string;
}

interface Metrics {
  total_calls: number;
  successful_calls: number;
  failed_calls: number;
  success_rate: number;
}

export default function AnalyticsPage() {
  const [metrics, setMetrics] = useState<Metrics>({
    total_calls: 0,
    successful_calls: 0,
    failed_calls: 0,
    success_rate: 0,
  });
  const [recentCalls, setRecentCalls] = useState<CallRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter states
  const [channelFilter, setChannelFilter] = useState('all');
  const [outcomeFilter, setOutcomeFilter] = useState('all');

  const fetchAnalytics = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/analytics');
      const data = await res.json();
      if (res.ok && data.success) {
        setMetrics(
          data.metrics || {
            total_calls: 0,
            successful_calls: 0,
            failed_calls: 0,
            success_rate: 0,
          }
        );
        setRecentCalls(data.recent_calls || []);
      } else {
        setError(data.error || 'Unable to load call analytics. Please try again.');
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to load call analytics. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
    const interval = setInterval(fetchAnalytics, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleDeleteCall = async (id: number) => {
    if (!confirm('Are you sure you want to delete this call record?')) return;
    try {
      const res = await fetch(`/api/analytics?id=${id}`, { method: 'DELETE' });
      if (res.ok) {
        setRecentCalls((prev) => prev.filter((c) => c.id !== id));
        fetchAnalytics();
      } else {
        alert('Failed to delete call record');
      }
    } catch (e) {
      console.error('Delete call failed:', e);
    }
  };

  const handleClearAll = async () => {
    if (!confirm('Are you sure you want to delete ALL call records? This action cannot be undone.'))
      return;
    try {
      const res = await fetch('/api/analytics?clear_all=true', { method: 'DELETE' });
      if (res.ok) {
        setRecentCalls([]);
        setMetrics({ total_calls: 0, successful_calls: 0, failed_calls: 0, success_rate: 0 });
      } else {
        alert('Failed to clear call records');
      }
    } catch (e) {
      console.error('Clear all failed:', e);
    }
  };

  const formatDuration = (seconds: number) => {
    if (!seconds || seconds < 0) return '00:00';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const formatReason = (reason: string) => {
    const r = (reason || '').toLowerCase().trim();
    switch (r) {
      case 'guidance_provided':
        return 'Guidance Provided';
      case 'human_escalation':
        return 'Human Escalation';
      case 'user_hangup':
        return 'User Disconnected';
      case 'incomplete_conversation':
        return 'Incomplete Call';
      case 'tool_failure':
        return 'Tool Failure';
      case 'no_response':
        return 'No User Response';
      default:
        return r ? r.replace(/_/g, ' ') : 'Unknown';
    }
  };

  const filteredCalls = recentCalls.filter((c) => {
    const matchesChannel =
      channelFilter === 'all' || (c.channel && c.channel.toLowerCase() === channelFilter);
    const matchesOutcome =
      outcomeFilter === 'all' || (c.outcome && c.outcome.toLowerCase() === outcomeFilter);
    return matchesChannel && matchesOutcome;
  });

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 transition-colors duration-300 dark:bg-slate-950 dark:text-slate-100">
      {/* Header Navigation */}
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/85 backdrop-blur-xl transition-all duration-300 dark:border-slate-800/80 dark:bg-slate-900/85">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3.5 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-tr from-emerald-600 via-teal-600 to-emerald-500 text-xl font-black text-white shadow-md shadow-teal-900/20 dark:from-emerald-500 dark:to-teal-400">
              📊
            </div>
            <div>
              <h1 className="bg-gradient-to-r from-slate-900 via-teal-950 to-emerald-900 bg-clip-text text-lg font-black tracking-tight text-transparent sm:text-xl dark:from-white dark:via-teal-100 dark:to-emerald-300">
                Swasthya Sathi — Call Analytics
              </h1>
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                Monitor voice interactions and healthcare outcomes
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={handleClearAll}
              disabled={loading || recentCalls.length === 0}
              className="flex items-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 px-3.5 py-1.5 text-xs font-bold text-rose-700 transition hover:bg-rose-100 active:scale-95 disabled:opacity-50 dark:border-rose-900/60 dark:bg-rose-950/60 dark:text-rose-300 dark:hover:bg-rose-900/80"
            >
              <span>🗑 Clear All</span>
            </button>

            <button
              onClick={fetchAnalytics}
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
              href="/dashboard"
              className="flex items-center gap-1 rounded-full border border-slate-200 bg-slate-100 px-3.5 py-1.5 text-xs font-extrabold text-slate-700 transition hover:bg-slate-200 active:scale-95 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              <span>📋 Escalations</span>
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

      {/* Main Content */}
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        {/* Privacy Notice Banner */}
        <div className="mb-6 flex items-center justify-between rounded-2xl border border-teal-200/70 bg-teal-500/10 p-3.5 text-xs font-bold text-teal-900 shadow-xs backdrop-blur-md dark:border-teal-500/30 dark:bg-teal-950/60 dark:text-teal-200">
          <div className="flex items-center gap-2.5">
            <span className="text-base">🔒</span>
            <span>
              <strong>Privacy Compliant Analytics:</strong> This dashboard records non-sensitive
              call metadata and outcomes only. User transcripts, clinical notes, and personal
              identifiers are excluded.
            </span>
          </div>
        </div>

        {/* 3 Prominent Required Hero Metric Cards + Success Rate */}
        <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {/* TOTAL CALLS */}
          <div className="relative overflow-hidden rounded-3xl border border-slate-200/80 bg-white p-5 shadow-lg shadow-slate-900/5 transition-all duration-200 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold tracking-wider text-slate-500 uppercase dark:text-slate-400">
                Total Calls
              </span>
              <span className="flex size-8 items-center justify-center rounded-xl bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                📞
              </span>
            </div>
            <p className="mt-3 text-4xl font-black tracking-tight text-slate-900 dark:text-white">
              {metrics.total_calls}
            </p>
            <p className="mt-1 text-[11px] font-semibold text-slate-400">
              Total interactions recorded
            </p>
          </div>

          {/* SUCCESSFUL CALLS */}
          <div className="relative overflow-hidden rounded-3xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50/60 via-white to-teal-50/40 p-5 shadow-lg shadow-emerald-900/5 transition-all duration-200 dark:border-emerald-500/30 dark:from-emerald-950/40 dark:via-slate-900 dark:to-teal-950/20">
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold tracking-wider text-emerald-700 uppercase dark:text-emerald-400">
                Successful Calls
              </span>
              <span className="flex size-8 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300">
                ✓
              </span>
            </div>
            <p className="mt-3 text-4xl font-black tracking-tight text-emerald-600 dark:text-emerald-400">
              {metrics.successful_calls}
            </p>
            <p className="mt-1 text-[11px] font-semibold text-emerald-700/70 dark:text-emerald-400/70">
              Safe guidance or human escalation
            </p>
          </div>

          {/* FAILED CALLS */}
          <div className="relative overflow-hidden rounded-3xl border border-rose-200/80 bg-gradient-to-br from-rose-50/60 via-white to-red-50/40 p-5 shadow-lg shadow-rose-900/5 transition-all duration-200 dark:border-rose-500/30 dark:from-rose-950/40 dark:via-slate-900 dark:to-red-950/20">
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold tracking-wider text-rose-700 uppercase dark:text-rose-400">
                Failed Calls
              </span>
              <span className="flex size-8 items-center justify-center rounded-xl bg-rose-100 text-rose-700 dark:bg-rose-900/60 dark:text-rose-300">
                ✕
              </span>
            </div>
            <p className="mt-3 text-4xl font-black tracking-tight text-rose-600 dark:text-rose-400">
              {metrics.failed_calls}
            </p>
            <p className="mt-1 text-[11px] font-semibold text-rose-700/70 dark:text-rose-400/70">
              Early hangup, drop, or tool failure
            </p>
          </div>

          {/* SUCCESS RATE */}
          <div className="relative overflow-hidden rounded-3xl border border-teal-200/80 bg-gradient-to-br from-teal-500/10 via-emerald-500/5 to-teal-500/15 p-5 shadow-lg shadow-teal-900/5 transition-all duration-200 dark:border-teal-500/30 dark:bg-slate-900">
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold tracking-wider text-teal-800 uppercase dark:text-teal-300">
                Success Rate
              </span>
              <span className="flex size-8 items-center justify-center rounded-xl bg-teal-100 text-teal-800 dark:bg-teal-900/60 dark:text-teal-300">
                📈
              </span>
            </div>
            <p className="mt-3 text-4xl font-black tracking-tight text-teal-700 dark:text-teal-300">
              {metrics.success_rate}%
            </p>
            <p className="mt-1 text-[11px] font-semibold text-teal-800/70 dark:text-teal-300/70">
              {metrics.total_calls === 0
                ? 'No calls recorded yet'
                : `${metrics.successful_calls} out of ${metrics.total_calls} calls`}
            </p>
          </div>
        </div>

        {/* Filters & Section Banner */}
        <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-teal-100 bg-white p-4 shadow-xs sm:flex-row sm:items-center sm:justify-between dark:border-teal-500/20 dark:bg-slate-900">
          <div>
            <h3 className="text-sm font-black text-slate-900 dark:text-white">
              Recent Call History
            </h3>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Real-time interaction metadata from SQLite
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div>
              <span className="mr-1.5 text-[11px] font-bold text-slate-500 dark:text-slate-400">
                Channel:
              </span>
              <select
                value={channelFilter}
                onChange={(e) => setChannelFilter(e.target.value)}
                className="rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-bold text-slate-800 focus:border-teal-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                <option value="all">All Channels</option>
                <option value="browser">Browser</option>
                <option value="sip">SIP Telephony</option>
              </select>
            </div>

            <div>
              <span className="mr-1.5 text-[11px] font-bold text-slate-500 dark:text-slate-400">
                Outcome:
              </span>
              <select
                value={outcomeFilter}
                onChange={(e) => setOutcomeFilter(e.target.value)}
                className="rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-bold text-slate-800 focus:border-teal-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                <option value="all">All Outcomes</option>
                <option value="success">✓ Success</option>
                <option value="failed">✕ Failed</option>
              </select>
            </div>
          </div>
        </div>

        {/* Recent Calls Table */}
        <div className="overflow-hidden rounded-2xl border border-teal-100 bg-white shadow-xl shadow-teal-900/5 dark:border-teal-500/20 dark:bg-slate-900">
          {error && (
            <div className="p-4 text-center text-xs font-bold text-rose-600 dark:text-rose-400">
              {error}
            </div>
          )}

          {loading && recentCalls.length === 0 ? (
            <div className="p-12 text-center text-xs font-bold text-slate-500 dark:text-slate-400">
              Loading call analytics...
            </div>
          ) : filteredCalls.length === 0 ? (
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
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <p className="mt-2 text-sm font-bold">No call records found</p>
              <p className="text-xs">
                {channelFilter !== 'all' || outcomeFilter !== 'all'
                  ? 'Try clearing your filters'
                  : 'Start a call with Swasthya Sathi to view call analytics here.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-teal-100 bg-teal-50/60 font-black tracking-wider text-teal-950 uppercase dark:border-teal-500/20 dark:bg-slate-800/80 dark:text-teal-200">
                  <tr>
                    <th className="px-4 py-3">Time</th>
                    <th className="px-4 py-3">Channel</th>
                    <th className="px-4 py-3">Language</th>
                    <th className="px-4 py-3">Duration</th>
                    <th className="px-4 py-3">Outcome</th>
                    <th className="px-4 py-3">Healthcare Outcome Reason</th>
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium dark:divide-slate-800">
                  {filteredCalls.map((call) => {
                    const isSuccess = (call.outcome || '').toLowerCase() === 'success';
                    const startTimeStr = call.started_at
                      ? new Date(call.started_at).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        })
                      : '—';
                    const startDateStr = call.started_at
                      ? new Date(call.started_at).toLocaleDateString([], {
                          month: 'short',
                          day: 'numeric',
                        })
                      : '';

                    return (
                      <tr
                        key={call.id}
                        className="transition hover:bg-slate-50/80 dark:hover:bg-slate-800/50"
                      >
                        <td className="px-4 py-3.5 font-bold whitespace-nowrap text-slate-800 dark:text-slate-200">
                          <span>{startTimeStr}</span>
                          <span className="ml-1.5 text-[10px] font-normal text-slate-400">
                            {startDateStr}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          {call.channel.toLowerCase() === 'sip' ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-purple-500/15 px-2.5 py-0.5 text-xs font-bold text-purple-700 dark:bg-purple-950/80 dark:text-purple-300">
                              📞 SIP Telephony
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/15 px-2.5 py-0.5 text-xs font-bold text-sky-700 dark:bg-sky-950/80 dark:text-sky-300">
                              💻 Browser
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3.5 font-semibold whitespace-nowrap text-slate-700 dark:text-slate-300">
                          {call.language || 'Unknown'}
                        </td>
                        <td className="px-4 py-3.5 font-mono text-xs font-bold whitespace-nowrap text-slate-600 dark:text-slate-400">
                          {formatDuration(call.duration_seconds)}
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          {isSuccess ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-black text-emerald-700 ring-1 ring-emerald-500/30 dark:bg-emerald-950/80 dark:text-emerald-300">
                              ✓ Success
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/15 px-2.5 py-1 text-xs font-black text-rose-700 ring-1 ring-rose-500/30 dark:bg-rose-950/80 dark:text-rose-300">
                              ✕ Failed
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3.5 font-semibold text-slate-700 dark:text-slate-300">
                          {formatReason(call.outcome_reason)}
                        </td>
                        <td className="px-4 py-3.5 text-right whitespace-nowrap">
                          <button
                            onClick={() => handleDeleteCall(call.id)}
                            className="rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-xs font-bold text-rose-600 transition hover:bg-rose-100 hover:text-rose-700 dark:border-slate-700 dark:bg-slate-800 dark:text-rose-400 dark:hover:bg-rose-950"
                            title="Delete call record"
                          >
                            🗑 Delete
                          </button>
                        </td>
                      </tr>
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
