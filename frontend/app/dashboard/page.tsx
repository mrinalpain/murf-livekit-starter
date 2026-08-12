'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';

interface Escalation {
  id: number;
  reference_id: string;
  user_id: string;
  summary: string;
  urgency: string;
  language: string | null;
  preferred_follow_up: string | null;
  status: string;
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

  const fetchEscalations = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/escalations');
      const data = await res.json();
      if (res.ok && data.success) {
        setEscalations(data.escalations || []);
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
  }, []);

  const handleStatusChange = async (refId: string, newStatus: string) => {
    setUpdatingId(refId);
    try {
      const res = await fetch(`/api/escalations/${refId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setEscalations((prev) =>
          prev.map((item) => (item.reference_id === refId ? { ...item, status: newStatus } : item))
        );
      } else {
        alert(`Failed to update status: ${data.error || 'Unknown error'}`);
      }
    } catch (err) {
      alert(`Failed to update status: ${err instanceof Error ? err.message : 'Error'}`);
    } finally {
      setUpdatingId(null);
    }
  };

  const filtered = escalations.filter((item) => {
    const matchesSearch =
      item.reference_id.toLowerCase().includes(search.toLowerCase()) ||
      item.summary.toLowerCase().includes(search.toLowerCase()) ||
      item.user_id.toLowerCase().includes(search.toLowerCase());
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
            <span className="size-2 animate-pulse rounded-full bg-rose-600 dark:bg-rose-400" />
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

  const getStatusSelect = (item: Escalation) => {
    const isUpdating = updatingId === item.reference_id;
    return (
      <select
        value={item.status.toLowerCase()}
        disabled={isUpdating}
        onChange={(e) => handleStatusChange(item.reference_id, e.target.value)}
        className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-extrabold text-slate-800 transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 focus:outline-none disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
      >
        <option value="open">Open</option>
        <option value="in_progress">In Progress</option>
        <option value="resolved">Resolved</option>
        <option value="cancelled">Cancelled</option>
      </select>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 transition-colors duration-300 dark:bg-slate-950 dark:text-slate-100">
      {/* Header Banner */}
      <header className="sticky top-0 z-20 border-b border-teal-200/60 bg-white/85 backdrop-blur-md dark:border-teal-500/20 dark:bg-slate-900/85">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-tr from-teal-600 to-emerald-500 text-xl font-black text-white shadow-md shadow-teal-900/20">
              ✚
            </div>
            <div>
              <h1 className="text-lg font-black tracking-tight text-teal-900 sm:text-xl dark:text-teal-200">
                Swasthya Sathi
              </h1>
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                Human Assistance &amp; Escalation Dashboard
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
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
              href="/"
              className="rounded-full bg-teal-600 px-4 py-1.5 text-xs font-black text-white transition hover:bg-teal-700 active:scale-95 dark:bg-teal-500 dark:text-slate-950 dark:hover:bg-teal-400"
            >
              ← Back to Voice Agent
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
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
              placeholder="Search by reference ID (e.g. SS-1042), caller ID, or summary..."
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
                    <th className="px-4 py-3">Summary</th>
                    <th className="px-4 py-3">Language</th>
                    <th className="px-4 py-3">Follow-up</th>
                    <th className="px-4 py-3">Created</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium dark:divide-slate-800">
                  {filtered.map((item) => (
                    <tr
                      key={item.id}
                      className="dark:hover:bg-slate-850 transition hover:bg-slate-50/80"
                    >
                      <td className="px-4 py-3.5 font-black whitespace-nowrap text-teal-700 dark:text-teal-300">
                        {item.reference_id}
                      </td>
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        {getUrgencyBadge(item.urgency)}
                      </td>
                      <td className="max-w-xs px-4 py-3.5 leading-relaxed font-medium text-slate-800 dark:text-slate-200">
                        {item.summary}
                      </td>
                      <td className="px-4 py-3.5 font-semibold whitespace-nowrap text-slate-700 dark:text-slate-300">
                        {item.language || 'English'}
                      </td>
                      <td className="px-4 py-3.5 font-semibold whitespace-nowrap text-slate-600 dark:text-slate-400">
                        {item.preferred_follow_up || 'Phone'}
                      </td>
                      <td className="px-4 py-3.5 whitespace-nowrap text-slate-500 dark:text-slate-400">
                        {new Date(item.created_at).toLocaleString([], {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td className="px-4 py-3.5 whitespace-nowrap">{getStatusSelect(item)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
