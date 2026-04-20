"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface Job { name: string; label: string; description: string; schedule: string; }
interface JobResult { ok: boolean; summary: string; durationMs: number; }

export default function AdminJobsPage() {
  const router = useRouter();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [runningJob, setRunningJob] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, JobResult>>({});

  useEffect(() => {
    fetch("/api/admin/jobs")
      .then(r => { if (r.status === 403) { router.push("/dashboard"); return null; } return r.json(); })
      .then(data => { if (data) setJobs(data.jobs || []); })
      .catch(() => router.push("/dashboard"))
      .finally(() => setLoading(false));
  }, [router]);

  async function runJob(name: string) {
    setRunningJob(name);
    try {
      const res = await fetch("/api/admin/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      setResults(r => ({ ...r, [name]: data }));
    } catch {
      setResults(r => ({ ...r, [name]: { ok: false, summary: "Request failed", durationMs: 0 } }));
    } finally {
      setRunningJob(null);
    }
  }

  async function runAll() {
    for (const job of jobs) {
      setRunningJob(job.name);
      try {
        const res = await fetch("/api/admin/jobs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: job.name }),
        });
        const data = await res.json();
        setResults(r => ({ ...r, [job.name]: data }));
      } catch {
        setResults(r => ({ ...r, [job.name]: { ok: false, summary: "Request failed", durationMs: 0 } }));
      }
    }
    setRunningJob(null);
  }

  if (loading) {
    return <div className="flex flex-1 items-center justify-center min-h-screen"><div className="text-muted">Loading...</div></div>;
  }

  return (
    <div className="min-h-screen">
      <nav className="bg-primary text-white px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center gap-4">
          <Link href="/dashboard" className="text-xl font-bold flex items-center gap-2">
            <span>&#9971;</span> Golf Challenge
          </Link>
          <span className="text-green-200">/</span>
          <span className="font-medium">Admin Jobs</span>
          <div className="ml-auto flex gap-3 text-sm">
            <Link href="/admin/results" className="text-green-200 hover:text-white">Results</Link>
            <span className="text-white font-medium">Jobs</span>
          </div>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-6 gap-3">
          <div>
            <h1 className="text-2xl font-bold">Background Jobs</h1>
            <p className="text-sm text-muted mt-1">Run any cron-scheduled job on demand. Each run is logged to the audit trail.</p>
          </div>
          <button onClick={runAll} disabled={runningJob !== null}
            className="bg-primary hover:bg-primary-light text-white font-semibold px-5 py-2.5 rounded-lg disabled:opacity-50">
            {runningJob ? `Running ${runningJob}...` : "Run All"}
          </button>
        </div>

        <div className="space-y-3">
          {jobs.map(job => {
            const result = results[job.name];
            const isRunning = runningJob === job.name;
            return (
              <div key={job.name} className="bg-surface rounded-xl border border-border p-4 sm:p-5">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold">{job.label}</h3>
                      <span className="text-xs bg-surface-alt border border-border px-2 py-0.5 rounded-full text-muted">{job.schedule}</span>
                    </div>
                    <p className="text-sm text-muted mt-1">{job.description}</p>
                    <code className="text-xs text-muted font-mono">{job.name}</code>
                  </div>
                  <button onClick={() => runJob(job.name)} disabled={runningJob !== null}
                    className="bg-accent hover:bg-accent-light text-primary-dark font-semibold px-4 py-2 rounded-lg text-sm whitespace-nowrap disabled:opacity-50">
                    {isRunning ? "Running..." : "Run Now"}
                  </button>
                </div>
                {result && (
                  <div className={`mt-3 p-3 rounded-lg text-sm ${result.ok ? "bg-success/10 border border-success/20" : "bg-danger/10 border border-danger/20"}`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className={`font-semibold ${result.ok ? "text-success" : "text-danger"}`}>
                        {result.ok ? "\u2713 Success" : "\u2717 Failed"}
                      </span>
                      <span className="text-xs text-muted">{result.durationMs}ms</span>
                    </div>
                    <p className="text-xs font-mono break-all">{result.summary}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
