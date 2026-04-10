import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Bell,
  ChartLine,
  Download,
  FileCheck2,
  Filter,
  LayoutGrid,
  LayoutList,
  LayoutPanelLeft,
  Moon,
  Pin,
  PinOff,
  Plus,
  Search,
  Settings,
  Shield,
  Sun,
} from 'lucide-react';
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist';

type Role = 'ADMINISTRATOR' | 'TEAM_MANAGER' | 'USER';

type LookupUser = {
  id: number;
  full_name: string;
  email: string;
  role: Role;
  school_name: string;
  user_type_name: string;
  school_id: number;
  user_type_id: number;
};

type LookupItem = { id: number; name: string };

type DocumentItem = {
  id: number;
  title: string;
  description: string;
  content: string;
  team_name: string;
  due_date: string;
  end_date: string;
  schedule: 'MONTHLY' | 'QUARTERLY' | 'YEARLY';
  document_type: string;
  file_url?: string;
  user_types: string;
  status: 'PENDING' | 'OVERDUE' | 'COMPLETED';
};

type DashboardResponse = {
  summary: {
    total_documents: number;
    completed: number;
    assigned: number;
    overdue: number;
  };
  trend: Array<{ day: string; team_name: string; ticket_count: number }>;
  overdueList: Array<{ id: number; title: string; due_date: string; team_name: string }>;
};

type DocumentDetails = {
  document: DocumentItem;
  activity: Array<{ id: number; message: string; created_at: string; actor_name: string }>;
  acknowledgments: Array<{
    id: number;
    acknowledged_at: string;
    comment: string;
    full_name: string;
    school_name: string;
    user_type_name: string;
  }>;
};

const API_BASE = 'http://localhost:3001/api';
const NAVY = '#004a7c';
const ACCENT = '#0078d4';

GlobalWorkerOptions.workerSrc =
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.8.69/pdf.worker.min.mjs';

function badgeClass(status: string): string {
  if (status === 'COMPLETED') return 'bg-emerald-100 text-emerald-900 border border-emerald-300';
  if (status === 'OVERDUE') return 'bg-red-100 text-red-900 border border-red-300';
  return 'bg-amber-100 text-amber-900 border border-amber-300';
}

function formatDueText(dateStr: string): string {
  const due = new Date(dateStr).getTime();
  const delta = Math.ceil((due - Date.now()) / 86400000);
  if (delta < 0) return `Overdue by ${Math.abs(delta)} day${Math.abs(delta) === 1 ? '' : 's'}`;
  if (delta === 0) return 'Due today';
  return `Due in ${delta} day${delta === 1 ? '' : 's'}`;
}

function TrendChart({ trend }: { trend: DashboardResponse['trend'] }) {
  const teams = useMemo(() => {
    const grouped = new Map<string, Array<{ day: string; ticket_count: number }>>();
    trend.forEach((item) => {
      const list = grouped.get(item.team_name) ?? [];
      list.push({ day: item.day, ticket_count: item.ticket_count });
      grouped.set(item.team_name, list);
    });
    return [...grouped.entries()].slice(0, 4);
  }, [trend]);

  const maxValue = Math.max(1, ...trend.map((t) => t.ticket_count));
  const palette = ['#0078d4', '#00a2ae', '#7f56d9', '#ff7a00'];

  return (
    <div className="rounded-[3px] border border-slate-200 bg-white p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700">Daily Team Ticket Trend</h3>
        <ChartLine size={16} className="text-slate-500" />
      </div>
      <svg viewBox="0 0 640 260" className="h-64 w-full bg-slate-50">
        {[0, 1, 2, 3, 4].map((n) => (
          <line
            key={n}
            x1="40"
            y1={30 + n * 50}
            x2="620"
            y2={30 + n * 50}
            stroke="#dfe4ea"
            strokeWidth="1"
          />
        ))}
        {teams.map(([teamName, points], index) => {
          const d = points
            .map((p, i) => {
              const x = 40 + (i * 580) / Math.max(points.length - 1, 1);
              const y = 230 - (p.ticket_count / maxValue) * 190;
              return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
            })
            .join(' ');
          return (
            <g key={teamName}>
              <path d={d} fill="none" stroke={palette[index]} strokeWidth="3" />
              <text x={50} y={24 + index * 16} fill={palette[index]} fontSize="11" fontWeight="600">
                {teamName}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function PdfPreview({ url }: { url?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    if (!url || !url.toLowerCase().includes('.pdf')) {
      setError('PDF preview unavailable for this document type.');
      return;
    }

    let disposed = false;
    setError('');

    (async () => {
      try {
        const pdf = await getDocument(url).promise;
        const page = await pdf.getPage(1);
        const viewport = page.getViewport({ scale: 1.1 });
        const canvas = canvasRef.current;
        if (!canvas || disposed) return;
        const context = canvas.getContext('2d');
        if (!context) return;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await page.render({ canvas: canvas, canvasContext: context, viewport }).promise;
      } catch {
        if (!disposed) setError('Unable to render PDF preview. You can open it externally.');
      }
    })();

    return () => {
      disposed = true;
    };
  }, [url]);

  return (
    <div className="rounded-[3px] border border-slate-200 bg-slate-50 p-3">
      {error ? (
        <p className="text-xs text-slate-600">{error}</p>
      ) : (
        <div className="max-h-72 overflow-auto">
          <canvas ref={canvasRef} className="w-full rounded-[3px] border border-slate-300" />
        </div>
      )}
    </div>
  );
}

function App() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'TABLE' | 'CARD'>('TABLE');
  const [settingsOpen, setSettingsOpen] = useState(false);

  const [lookups, setLookups] = useState<{
    users: LookupUser[];
    teams: LookupItem[];
    userTypes: LookupItem[];
    schools: LookupItem[];
  }>({ users: [], teams: [], userTypes: [], schools: [] });

  const [activeUserId, setActiveUserId] = useState<number | null>(null);
  const activeUser = useMemo(
    () => lookups.users.find((u) => u.id === activeUserId) ?? null,
    [lookups.users, activeUserId]
  );

  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedDocId, setSelectedDocId] = useState<number | null>(null);
  const [docDetails, setDocDetails] = useState<DocumentDetails | null>(null);
  const [activeDetailTab, setActiveDetailTab] = useState<'DETAILS' | 'ACTIVITY'>('DETAILS');
  const [panelWidth, setPanelWidth] = useState(50);
  const [panelPinned, setPanelPinned] = useState(false);

  const [theme, setTheme] = useState({
    app: '#f8fafc',
    header: NAVY,
    menu: '#0d1b2a',
    card: '#ffffff',
    button: ACCENT,
  });

  const fetchLookups = async () => {
    const response = await fetch(`${API_BASE}/lookups`);
    const data = await response.json();
    setLookups(data);
    if (!activeUserId && data.users.length) {
      setActiveUserId(data.users[0].id);
    }
  };

  const refreshDashboard = async (userId: number) => {
    setLoading(true);
    const [dashRes, docsRes] = await Promise.all([
      fetch(`${API_BASE}/dashboard?userId=${userId}`),
      fetch(`${API_BASE}/documents?userId=${userId}`),
    ]);
    setDashboard(await dashRes.json());
    setDocuments(await docsRes.json());
    setLoading(false);
  };

  useEffect(() => {
    fetchLookups().catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (activeUserId) {
      refreshDashboard(activeUserId).catch(() => setLoading(false));
    }
  }, [activeUserId]);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', darkMode);
    root.style.setProperty('--theme-app', theme.app);
    root.style.setProperty('--theme-header', theme.header);
    root.style.setProperty('--theme-menu', theme.menu);
    root.style.setProperty('--theme-card', theme.card);
    root.style.setProperty('--theme-button', theme.button);
  }, [theme, darkMode]);

  useEffect(() => {
    if (!selectedDocId) {
      setDocDetails(null);
      return;
    }
    fetch(`${API_BASE}/documents/${selectedDocId}`)
      .then((res) => res.json())
      .then((data) => setDocDetails(data));
  }, [selectedDocId]);

  const filteredDocuments = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return documents;
    return documents.filter((doc) => {
      return (
        doc.title.toLowerCase().includes(needle) ||
        doc.team_name.toLowerCase().includes(needle) ||
        doc.user_types.toLowerCase().includes(needle)
      );
    });
  }, [documents, search]);

  const nav = useMemo(() => {
    if (!activeUser) return [];
    if (activeUser.role === 'ADMINISTRATOR') return ['Dashboard', 'Teams', 'Users', 'Reports', 'Settings'];
    if (activeUser.role === 'TEAM_MANAGER') return ['Dashboard', 'My Team Docs', 'Activity', 'Reports'];
    return ['Dashboard', 'My Documents', 'History'];
  }, [activeUser]);

  const handleAcknowledge = async () => {
    if (!selectedDocId || !activeUser) return;
    await fetch(`${API_BASE}/documents/${selectedDocId}/acknowledge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: activeUser.id, comment: 'Acknowledged from DocRecord UI' }),
    });
    await refreshDashboard(activeUser.id);
    const detail = await fetch(`${API_BASE}/documents/${selectedDocId}`).then((res) => res.json());
    setDocDetails(detail);
  };

  return (
    <div className="min-h-screen bg-[var(--theme-app)] text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <div className="flex min-h-screen">
        <motion.aside
          animate={{ width: sidebarCollapsed ? 78 : 250 }}
          transition={{ duration: 0.22, ease: 'easeInOut' }}
          className="sticky top-0 h-screen border-r border-slate-300 bg-[var(--theme-menu)] text-slate-100"
        >
          <div className="flex h-14 items-center border-b border-slate-500 px-3 font-semibold tracking-wide">
            <Shield size={18} />
            {!sidebarCollapsed && <span className="ml-2">DocRecord</span>}
          </div>
          <nav className="space-y-1 p-2 text-sm">
            {nav.map((item) => (
              <button
                key={item}
                className="flex w-full items-center rounded-[3px] border border-transparent px-3 py-2 text-left hover:border-slate-300 hover:bg-slate-800"
              >
                <LayoutGrid size={15} />
                {!sidebarCollapsed && <span className="ml-2">{item}</span>}
              </button>
            ))}
          </nav>
        </motion.aside>

        <main className="relative flex-1">
          <header className="sticky top-0 z-20 border-b border-slate-300 bg-[var(--theme-header)] text-white">
            <div className="flex h-14 items-center gap-3 px-4">
              <button
                onClick={() => setSidebarCollapsed((v) => !v)}
                className="rounded-[3px] border border-white/30 p-2 hover:bg-white/15"
              >
                <LayoutPanelLeft size={16} />
              </button>
              <div className="flex min-w-64 items-center gap-2 rounded-[3px] border border-white/30 bg-white/10 px-2 py-1.5">
                <Search size={14} />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search docs, team, user type"
                  className="w-full bg-transparent text-sm outline-none placeholder:text-slate-100/70"
                />
              </div>

              <div className="ml-auto flex items-center gap-2">
                <select
                  value={activeUserId ?? ''}
                  onChange={(e) => setActiveUserId(Number(e.target.value))}
                  className="rounded-[3px] border border-white/30 bg-white/10 px-2 py-1 text-xs"
                >
                  {lookups.users.map((user) => (
                    <option className="text-slate-900" key={user.id} value={user.id}>
                      {user.full_name} ({user.role})
                    </option>
                  ))}
                </select>
                {activeUser?.role === 'ADMINISTRATOR' && (
                  <button
                    className="rounded-[3px] border border-white/30 p-2 hover:bg-white/15"
                    onClick={() => setSettingsOpen((v) => !v)}
                  >
                    <Settings size={16} />
                  </button>
                )}
                <button className="relative rounded-[3px] border border-white/30 p-2 hover:bg-white/15">
                  <Bell size={16} />
                  <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-red-500" />
                </button>
                <button
                  onClick={() => setDarkMode((v) => !v)}
                  className="rounded-[3px] border border-white/30 p-2 hover:bg-white/15"
                >
                  {darkMode ? <Sun size={16} /> : <Moon size={16} />}
                </button>
              </div>
            </div>

            <div className="flex h-12 items-center gap-2 border-t border-white/20 px-4">
              <button
                className={`rounded-[3px] border px-3 py-1.5 text-xs ${viewMode === 'TABLE' ? 'border-white bg-white/15' : 'border-white/35'}`}
                onClick={() => setViewMode('TABLE')}
              >
                <LayoutList size={14} className="mr-1 inline" /> Table
              </button>
              <button
                className={`rounded-[3px] border px-3 py-1.5 text-xs ${viewMode === 'CARD' ? 'border-white bg-white/15' : 'border-white/35'}`}
                onClick={() => setViewMode('CARD')}
              >
                <LayoutGrid size={14} className="mr-1 inline" /> Card
              </button>
              <button className="rounded-[3px] border border-white/35 px-3 py-1.5 text-xs">
                <Filter size={14} className="mr-1 inline" /> Filter
              </button>
              <div className="ml-auto space-x-2">
                <button className="rounded-[3px] border border-white/35 px-3 py-1.5 text-xs">
                  <Plus size={14} className="mr-1 inline" /> NEW
                </button>
                <button className="rounded-[3px] border border-white/35 px-3 py-1.5 text-xs">
                  <Download size={14} className="mr-1 inline" /> EXPORT
                </button>
              </div>
            </div>
          </header>

          <div className="space-y-4 p-4">
            {settingsOpen && (
              <div className="grid grid-cols-2 gap-2 rounded-[3px] border border-slate-300 bg-[var(--theme-card)] p-3 text-xs dark:border-slate-700">
                {[
                  ['App', 'app'],
                  ['Header', 'header'],
                  ['Menu', 'menu'],
                  ['Card', 'card'],
                  ['Button', 'button'],
                ].map(([label, key]) => (
                  <label key={key} className="flex items-center gap-2">
                    <span className="w-16">{label}</span>
                    <input
                      type="color"
                      value={theme[key as keyof typeof theme]}
                      onChange={(e) =>
                        setTheme((prev) => ({ ...prev, [key]: e.target.value }))
                      }
                      className="h-7 w-14 rounded-[3px] border border-slate-300"
                    />
                  </label>
                ))}
              </div>
            )}

            {loading || !dashboard || !activeUser ? (
              <div className="rounded-[3px] border border-slate-300 bg-[var(--theme-card)] p-6 text-sm">Loading DocRecord...</div>
            ) : (
              <>
                <section className="grid grid-cols-1 gap-3 md:grid-cols-4">
                  {[
                    ['Assigned', dashboard.summary.assigned],
                    ['Completed', dashboard.summary.completed],
                    ['Overdue', dashboard.summary.overdue],
                    ['Total Docs', dashboard.summary.total_documents],
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      className="rounded-[3px] border border-slate-200 bg-[var(--theme-card)] p-3 dark:border-slate-700"
                    >
                      <p className="text-xs uppercase text-slate-500">{label}</p>
                      <p className="font-mono text-2xl font-bold">{value}</p>
                    </div>
                  ))}
                </section>

                <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                  <div className="xl:col-span-2">
                    <TrendChart trend={dashboard.trend} />
                  </div>
                  <div className="rounded-[3px] border border-slate-200 bg-[var(--theme-card)] p-4 dark:border-slate-700">
                    <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-300">
                      Overdue Queue
                    </h3>
                    <div className="space-y-2 text-sm">
                      {dashboard.overdueList.length ? (
                        dashboard.overdueList.map((item) => (
                          <button
                            key={item.id}
                            onClick={() => setSelectedDocId(item.id)}
                            className="w-full rounded-[3px] border border-red-200 bg-red-50 p-2 text-left hover:bg-red-100"
                          >
                            <p className="font-semibold text-red-900">{item.title}</p>
                            <p className="text-xs text-red-700">{item.team_name} • {formatDueText(item.due_date)}</p>
                          </button>
                        ))
                      ) : (
                        <p className="text-xs text-slate-500">No overdue items for current user context.</p>
                      )}
                    </div>
                  </div>
                </section>

                {viewMode === 'TABLE' ? (
                  <section className="overflow-x-auto rounded-[3px] border border-slate-200 bg-[var(--theme-card)] dark:border-slate-700">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        <tr>
                          <th className="px-3 py-2">Document</th>
                          <th className="px-3 py-2">Team</th>
                          <th className="px-3 py-2">User Types</th>
                          <th className="px-3 py-2">Due</th>
                          <th className="px-3 py-2">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredDocuments.map((doc) => (
                          <tr
                            key={doc.id}
                            className="cursor-pointer border-t border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-900"
                            onClick={() => setSelectedDocId(doc.id)}
                          >
                            <td className="px-3 py-2">
                              <p className="font-semibold">{doc.title}</p>
                              <p className="text-xs text-slate-500">{doc.schedule} • {doc.document_type}</p>
                            </td>
                            <td className="px-3 py-2">{doc.team_name}</td>
                            <td className="px-3 py-2">{doc.user_types}</td>
                            <td className="px-3 py-2">{formatDueText(doc.due_date)}</td>
                            <td className="px-3 py-2">
                              <span className={`rounded-[3px] px-2 py-1 text-xs font-semibold ${badgeClass(doc.status)}`}>
                                {doc.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </section>
                ) : (
                  <section className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3">
                    {filteredDocuments.map((doc) => (
                      <button
                        key={doc.id}
                        onClick={() => setSelectedDocId(doc.id)}
                        className="rounded-[3px] border border-slate-200 bg-[var(--theme-card)] p-3 text-left hover:border-slate-400 dark:border-slate-700"
                      >
                        <div className="mb-1 flex items-center justify-between">
                          <p className="font-semibold">{doc.title}</p>
                          <span className={`rounded-[3px] px-2 py-1 text-xs font-semibold ${badgeClass(doc.status)}`}>
                            {doc.status}
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 dark:text-slate-400">{doc.team_name} • {doc.user_types}</p>
                        <p className="mt-2 text-xs text-slate-500">{formatDueText(doc.due_date)}</p>
                      </button>
                    ))}
                  </section>
                )}
              </>
            )}
          </div>
        </main>
      </div>

      <AnimatePresence>
        {selectedDocId && docDetails && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => (panelPinned ? null : setSelectedDocId(null))}
              className="fixed inset-0 z-30 bg-slate-900/20"
            />
            <motion.aside
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ duration: 0.24, ease: 'easeInOut' }}
              style={{ width: `${panelWidth}%` }}
              className="fixed right-0 top-0 z-40 h-screen overflow-y-auto border-l border-slate-300 bg-white p-4 dark:border-slate-700 dark:bg-slate-950"
            >
              <div className="mb-3 flex items-center justify-between border-b border-slate-200 pb-2 dark:border-slate-700">
                <div>
                  <h3 className="text-lg font-semibold">{docDetails.document.title}</h3>
                  <p className="text-xs text-slate-500">{docDetails.document.team_name} • {docDetails.document.schedule}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPanelPinned((v) => !v)}
                    className="rounded-[3px] border border-slate-300 p-2 text-slate-600 hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800"
                  >
                    {panelPinned ? <Pin size={15} /> : <PinOff size={15} />}
                  </button>
                  <button
                    onClick={() => setSelectedDocId(null)}
                    className="rounded-[3px] border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800"
                  >
                    Close
                  </button>
                </div>
              </div>

              <label className="mb-3 block text-xs text-slate-500">
                Panel Width: <span className="font-mono">{panelWidth}%</span>
                <input
                  type="range"
                  min={35}
                  max={70}
                  value={panelWidth}
                  onChange={(e) => setPanelWidth(Number(e.target.value))}
                  className="mt-1 w-full"
                />
              </label>

              <div className="mb-3 flex gap-5 border-b border-slate-200 text-sm dark:border-slate-700">
                {(['DETAILS', 'ACTIVITY'] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveDetailTab(tab)}
                    className={`border-b-2 px-1 py-2 ${activeDetailTab === tab ? 'border-[var(--theme-button)] text-[var(--theme-button)]' : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'}`}
                  >
                    {tab === 'DETAILS' ? 'Details' : 'Activity'}
                  </button>
                ))}
              </div>

              {activeDetailTab === 'DETAILS' ? (
                <div className="space-y-3 text-sm">
                  <div className="rounded-[3px] border border-slate-200 p-3 dark:border-slate-700">
                    <p className="text-xs uppercase text-slate-500">Description</p>
                    <p>{docDetails.document.description}</p>
                    <p className="mt-2 text-xs text-slate-500">{docDetails.document.content}</p>
                  </div>

                  <PdfPreview url={docDetails.document.file_url} />

                  {docDetails.document.file_url && (
                    <a
                      href={docDetails.document.file_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center rounded-[3px] border border-slate-300 px-3 py-2 text-xs hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800"
                    >
                      <Download size={14} className="mr-2" /> Open in External Tab
                    </a>
                  )}

                  <div className="rounded-[3px] border border-slate-200 p-3 dark:border-slate-700">
                    <p className="mb-2 text-xs uppercase text-slate-500">Acknowledgment History</p>
                    <div className="space-y-2">
                      {docDetails.acknowledgments.length ? (
                        docDetails.acknowledgments.map((ack) => (
                          <div key={ack.id} className="rounded-[3px] border border-slate-200 p-2 text-xs dark:border-slate-700">
                            <p className="font-semibold">{ack.full_name}</p>
                            <p>{ack.school_name} • {ack.user_type_name}</p>
                            <p className="font-mono text-slate-500">{new Date(ack.acknowledged_at).toLocaleString()}</p>
                          </div>
                        ))
                      ) : (
                        <p className="text-xs text-slate-500">No acknowledgments yet.</p>
                      )}
                    </div>
                  </div>

                  {activeUser?.role === 'USER' && (
                    <button
                      onClick={handleAcknowledge}
                      className="inline-flex items-center rounded-[3px] border border-blue-400 bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700"
                    >
                      <FileCheck2 size={14} className="mr-2" /> I've read and understand the document
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  {docDetails.activity.length ? (
                    docDetails.activity.map((event) => (
                      <div key={event.id} className="rounded-[3px] border border-slate-200 p-3 text-sm dark:border-slate-700">
                        <p>{event.message}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {event.actor_name ?? 'System'} • {new Date(event.created_at).toLocaleString()}
                        </p>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-slate-500">No activity yet.</p>
                  )}
                </div>
              )}
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

export default App;
