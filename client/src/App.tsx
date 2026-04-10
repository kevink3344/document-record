import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Activity,
  BarChart2,
  Bell,
  BookOpen,
  Building2,
  ChartLine,
  Clock,
  Download,
  File,
  FileCheck2,
  Filter,
  FolderOpen,
  GraduationCap,
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
  Tag,
  User,
  Users,
} from 'lucide-react';
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist';

type Role = 'ADMINISTRATOR' | 'TEAM_MANAGER' | 'USER';
type ViewMode = 'TABLE' | 'CARD';

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

type Team = {
  id: number;
  name: string;
  description: string;
  manager_user_id: number | null;
  manager_user_ids: number[];
  manager_names?: string;
};
type UserType = { id: number; name: string };
type School = { id: number; name: string };

type AdminUser = {
  id: number;
  full_name: string;
  email: string;
  role: Role;
  school_id: number | null;
  user_type_id: number | null;
  is_active: number;
};

type DocumentItem = {
  id: number;
  title: string;
  description: string;
  content: string;
  team_id?: number;
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

type EditEntity = 'TEAM' | 'USER_TYPE' | 'SCHOOL' | 'USER' | 'DOCUMENT';

const API_BASE = 'http://localhost:3001/api';
const NAVY = '#004a7c';
const ACCENT = '#0078d4';

GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.8.69/pdf.worker.min.mjs';

function badgeClass(status: string): string {
  if (status === 'COMPLETED') return 'bg-emerald-100 text-emerald-900 border border-emerald-300';
  if (status === 'OVERDUE') return 'bg-red-100 text-red-900 border border-red-300';
  return 'bg-amber-100 text-amber-900 border border-amber-300';
}

function teamBadgeClass(teamName: string): string {
  const pastelClasses = [
    'bg-sky-100 text-sky-900 border border-sky-200',
    'bg-emerald-100 text-emerald-900 border border-emerald-200',
    'bg-amber-100 text-amber-900 border border-amber-200',
    'bg-rose-100 text-rose-900 border border-rose-200',
    'bg-violet-100 text-violet-900 border border-violet-200',
    'bg-teal-100 text-teal-900 border border-teal-200',
  ];
  const hash = [...teamName].reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return pastelClasses[hash % pastelClasses.length];
}

function formatDueText(dateStr: string): string {
  const due = new Date(dateStr).getTime();
  const delta = Math.ceil((due - Date.now()) / 86400000);
  if (delta < 0) return `Overdue by ${Math.abs(delta)} day${Math.abs(delta) === 1 ? '' : 's'}`;
  if (delta === 0) return 'Due today';
  return `Due in ${delta} day${delta === 1 ? '' : 's'}`;
}

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T | null> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    ...init,
  });

  if (!response.ok) {
    let msg = `Request failed (${response.status})`;
    try {
      const payload = (await response.json()) as { error?: string };
      if (payload.error) msg = payload.error;
    } catch {
      // no-op
    }
    throw new Error(msg);
  }

  if (response.status === 204) return null;
  return (await response.json()) as T;
}

function normalizeTeam(raw: Record<string, unknown>): Team {
  let managerUserIds: number[] = [];
  const rawIds = raw.manager_user_ids;
  if (Array.isArray(rawIds)) {
    managerUserIds = rawIds.map((v) => Number(v)).filter((v) => Number.isFinite(v));
  } else if (typeof rawIds === 'string' && rawIds.trim()) {
    try {
      const parsed = JSON.parse(rawIds);
      if (Array.isArray(parsed)) {
        managerUserIds = parsed.map((v) => Number(v)).filter((v) => Number.isFinite(v));
      }
    } catch {
      managerUserIds = [];
    }
  }

  return {
    id: Number(raw.id),
    name: String(raw.name ?? ''),
    description: String(raw.description ?? ''),
    manager_user_id: raw.manager_user_id == null ? null : Number(raw.manager_user_id),
    manager_user_ids: managerUserIds,
    manager_names: String(raw.manager_names ?? ''),
  };
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
          <line key={n} x1="40" y1={30 + n * 50} x2="620" y2={30 + n * 50} stroke="#dfe4ea" strokeWidth="1" />
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
        await page.render({ canvas, canvasContext: context, viewport }).promise;
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
  const [viewMode, setViewMode] = useState<ViewMode>('TABLE');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activePage, setActivePage] = useState('Dashboard');
  const [notice, setNotice] = useState('');

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
  const [teamDocs, setTeamDocs] = useState<DocumentItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [teams, setTeams] = useState<Team[]>([]);
  const [userTypes, setUserTypes] = useState<UserType[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);

  const [teamForm, setTeamForm] = useState({ name: '', description: '', managerUserIds: [] as number[] });
  const [userTypeForm, setUserTypeForm] = useState({ name: '' });
  const [schoolForm, setSchoolForm] = useState({ name: '' });
  const [userForm, setUserForm] = useState({
    fullName: '',
    email: '',
    role: 'USER' as Role,
    schoolId: '',
    userTypeId: '',
    isActive: true,
  });
  const [docForm, setDocForm] = useState({
    title: '',
    description: '',
    content: '',
    teamId: '',
    documentType: 'PDF',
    schedule: 'YEARLY' as 'MONTHLY' | 'QUARTERLY' | 'YEARLY',
    dueDate: '',
    endDate: '',
    fileUrl: '',
    userTypeIds: [] as number[],
  });
  const [newForms, setNewForms] = useState({
    teams: false,
    userTypes: false,
    schools: false,
    users: false,
    documents: false,
    myTeamDocs: false,
  });
  const [teamDocForm, setTeamDocForm] = useState({
    title: '',
    description: '',
    content: '',
    teamId: '',
    documentType: 'PDF',
    schedule: 'YEARLY' as 'MONTHLY' | 'QUARTERLY' | 'YEARLY',
    dueDate: '',
    endDate: '',
    fileUrl: '',
    userTypeIds: [] as number[],
  });

  const [selectedDocId, setSelectedDocId] = useState<number | null>(null);
  const [docDetails, setDocDetails] = useState<DocumentDetails | null>(null);
  const [activeDetailTab, setActiveDetailTab] = useState<'DETAILS' | 'ACTIVITY'>('DETAILS');
  const [panelWidth, setPanelWidth] = useState(50);
  const [panelPinned, setPanelPinned] = useState(false);
  const [editPanel, setEditPanel] = useState<{
    entity: EditEntity;
    id: number;
    title: string;
    payload: Record<string, unknown>;
  } | null>(null);

  const [theme, setTheme] = useState({
    app: '#f8fafc',
    header: NAVY,
    menu: '#0d1b2a',
    card: '#ffffff',
    button: ACCENT,
  });

  const fetchLookups = async () => {
    const data = await apiRequest<{
      users: LookupUser[];
      teams: LookupItem[];
      userTypes: LookupItem[];
      schools: LookupItem[];
    }>('/lookups');
    if (!data) return;
    setLookups(data);
    if (!activeUserId && data.users.length) {
      setActiveUserId(data.users[0].id);
    }
  };

  const refreshDashboard = async (userId: number) => {
    setLoading(true);
    const [dash, docs] = await Promise.all([
      apiRequest<DashboardResponse>(`/dashboard?userId=${userId}`),
      apiRequest<DocumentItem[]>(`/documents?userId=${userId}`),
    ]);
    setDashboard(dash ?? null);
    setDocuments(docs ?? []);
    setLoading(false);
  };

  const refreshAdminData = async () => {
    if (!activeUser || activeUser.role !== 'ADMINISTRATOR') return;
    const [teamsData, userTypesData, schoolsData, usersData] = await Promise.all([
      apiRequest<Team[]>('/teams'),
      apiRequest<UserType[]>('/user-types'),
      apiRequest<School[]>('/schools'),
      apiRequest<AdminUser[]>('/users'),
    ]);
    setTeams(((teamsData as unknown as Array<Record<string, unknown>>) ?? []).map(normalizeTeam));
    setUserTypes(userTypesData ?? []);
    setSchools(schoolsData ?? []);
    setUsers(usersData ?? []);
  };

  const refreshTeamManagerDocs = async (managerUserId: number) => {
    const [managerTeams, docs] = await Promise.all([
      apiRequest<Team[]>('/teams'),
      apiRequest<DocumentItem[]>(`/my-team-docs?managerUserId=${managerUserId}`),
    ]);

    const normalizedTeams = ((managerTeams as unknown as Array<Record<string, unknown>>) ?? []).map(normalizeTeam);
    const filteredTeams = normalizedTeams.filter((team) => team.manager_user_ids.includes(managerUserId));
    setTeams(filteredTeams);
    setTeamDocs(docs ?? []);
    setTeamDocForm((prev) => ({
      ...prev,
      teamId: prev.teamId || String(filteredTeams[0]?.id ?? ''),
    }));
  };

  const refreshAll = async () => {
    await fetchLookups();
    if (activeUserId) {
      await refreshDashboard(activeUserId);
    }
    await refreshAdminData();
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
    refreshAdminData().catch(() => undefined);
  }, [activeUser?.role]);

  useEffect(() => {
    if (activeUser?.role === 'TEAM_MANAGER' && activePage === 'My Team Docs') {
      refreshTeamManagerDocs(activeUser.id).catch(() => undefined);
    }
  }, [activeUser?.id, activeUser?.role, activePage]);

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
    apiRequest<DocumentDetails>(`/documents/${selectedDocId}`).then((data) => setDocDetails(data as DocumentDetails));
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
    if (activeUser.role === 'ADMINISTRATOR') {
      return ['Dashboard', 'Teams', 'User Types', 'Schools', 'Users', 'Documents', 'Reports', 'Settings'];
    }
    if (activeUser.role === 'TEAM_MANAGER') return ['Dashboard', 'My Team Docs', 'Activity', 'Reports'];
    return ['Dashboard', 'My Documents', 'History'];
  }, [activeUser]);
  const navIconMap: Record<string, React.ReactNode> = {
    Dashboard: <LayoutGrid size={15} />,
    Teams: <Users size={15} />,
    'User Types': <Tag size={15} />,
    Schools: <GraduationCap size={15} />,
    Users: <User size={15} />,
    Documents: <BookOpen size={15} />,
    Reports: <BarChart2 size={15} />,
    Settings: <Settings size={15} />,
    'My Team Docs': <FolderOpen size={15} />,
    'My Documents': <File size={15} />,
    Activity: <Activity size={15} />,
    History: <Clock size={15} />,
    'School Buildings': <Building2 size={15} />,
  };

  const handleAcknowledge = async () => {
    if (!selectedDocId || !activeUser) return;
    try {
      await apiRequest(`/documents/${selectedDocId}/acknowledge`, {
        method: 'POST',
        body: JSON.stringify({ userId: activeUser.id, comment: 'Acknowledged from DocRecord UI' }),
      });
      await refreshDashboard(activeUser.id);
      const detail = await apiRequest<DocumentDetails>(`/documents/${selectedDocId}`);
      setDocDetails(detail ?? null);
      setNotice('Acknowledgment recorded.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Acknowledge failed');
    }
  };

  const updateNotice = (msg: string) => {
    setNotice(msg);
    window.setTimeout(() => setNotice(''), 2500);
  };

  const withAction = async (action: () => Promise<void>, successMessage: string) => {
    try {
      await action();
      await refreshAll();
      updateNotice(successMessage);
    } catch (error) {
      updateNotice(error instanceof Error ? error.message : 'Action failed');
    }
  };

  const isAdminPage = activeUser?.role === 'ADMINISTRATOR' && activePage !== 'Dashboard';
  const isMyTeamDocsPage = activeUser?.role === 'TEAM_MANAGER' && activePage === 'My Team Docs';
  const isUserMyDocumentsPage = activeUser?.role === 'USER' && activePage === 'My Documents';
  const isUserHistoryPage = activeUser?.role === 'USER' && activePage === 'History';
  const myCompletedDocuments = useMemo(
    () => documents.filter((doc) => doc.status === 'COMPLETED'),
    [documents]
  );

  const payloadString = (key: string, fallback = ''): string => {
    if (!editPanel) return fallback;
    const value = editPanel.payload[key];
    return typeof value === 'string' ? value : fallback;
  };

  const payloadNumberArray = (key: string): number[] => {
    if (!editPanel) return [];
    const value = editPanel.payload[key];
    return Array.isArray(value) ? (value as number[]) : [];
  };

  const openEditPanel = (
    entity: EditEntity,
    id: number,
    title: string,
    payload: Record<string, unknown>
  ) => {
    setSelectedDocId(null);
    setEditPanel({ entity, id, title, payload });
  };

  const openDocumentEditPanel = async (doc: DocumentItem, title: string) => {
    const mappings =
      (await apiRequest<Array<{ document_id: number; user_type_id: number }>>(
        `/document-user-types?documentId=${doc.id}`
      )) ?? [];
    const userTypeIds = mappings.map((m) => m.user_type_id);

    openEditPanel('DOCUMENT', doc.id, title, {
      title: doc.title,
      description: doc.description ?? '',
      dueDate: doc.due_date.slice(0, 10),
      schedule: doc.schedule,
      userTypeIds,
    });
  };

  const saveEditPanel = async () => {
    if (!editPanel) return;

    const { entity, id, payload } = editPanel;
    const submit = async () => {
      if (entity === 'TEAM') {
        const managerUserIds = Array.isArray(payload.managerUserIds)
          ? (payload.managerUserIds as number[])
          : [];
        await apiRequest(`/teams/${id}`, {
          method: 'PUT',
          body: JSON.stringify({
            name: payload.name,
            description: payload.description,
            managerUserIds,
          }),
        });
      }

      if (entity === 'USER_TYPE') {
        await apiRequest(`/user-types/${id}`, {
          method: 'PUT',
          body: JSON.stringify({ name: payload.name }),
        });
      }

      if (entity === 'SCHOOL') {
        await apiRequest(`/schools/${id}`, {
          method: 'PUT',
          body: JSON.stringify({ name: payload.name }),
        });
      }

      if (entity === 'USER') {
        await apiRequest(`/users/${id}`, {
          method: 'PUT',
          body: JSON.stringify({
            fullName: payload.fullName,
            email: payload.email,
            role: payload.role,
            schoolId: payload.schoolId ? Number(payload.schoolId) : null,
            userTypeId: payload.userTypeId ? Number(payload.userTypeId) : null,
            isActive: payload.isActive === '1' ? 1 : 0,
          }),
        });
      }

      if (entity === 'DOCUMENT') {
        const userTypeIds = Array.isArray(payload.userTypeIds)
          ? (payload.userTypeIds as number[])
          : [];
        await apiRequest(`/documents/${id}`, {
          method: 'PUT',
          body: JSON.stringify({
            title: payload.title,
            description: payload.description,
            dueDate: payload.dueDate,
            schedule: payload.schedule,
            userTypeIds,
            actorUserId: activeUser?.id,
          }),
        });
      }
    };

    await withAction(async () => {
      await submit();
      if (activeUser?.role === 'TEAM_MANAGER') {
        await refreshTeamManagerDocs(activeUser.id);
      }
    }, 'Entity updated');

    setEditPanel(null);
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
                onClick={() => setActivePage(item)}
                className={`flex w-full items-center rounded-[3px] border px-3 py-2 text-left ${activePage === item ? 'border-slate-300 bg-slate-800' : 'border-transparent hover:border-slate-300 hover:bg-slate-800'}`}
              >
                {navIconMap[item] ?? <LayoutGrid size={15} />}
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
            {notice && <div className="rounded-[3px] border border-blue-200 bg-blue-50 p-2 text-xs text-blue-900">{notice}</div>}

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
                      onChange={(e) => setTheme((prev) => ({ ...prev, [key]: e.target.value }))}
                      className="h-7 w-14 rounded-[3px] border border-slate-300"
                    />
                  </label>
                ))}
              </div>
            )}

            {isAdminPage ? (
              <>
                {activePage === 'Teams' && (
                  <section className="rounded-[3px] border border-slate-200 bg-[var(--theme-card)] p-4 dark:border-slate-700">
                    <div className="mb-3 flex items-center justify-between">
                      <h3 className="text-sm font-semibold uppercase">Teams</h3>
                      <button
                        onClick={() => setNewForms((prev) => ({ ...prev, teams: !prev.teams }))}
                        className="border border-blue-300 bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-800"
                      >
                        +New
                      </button>
                    </div>
                    {newForms.teams && (
                    <div className="mb-4 grid grid-cols-1 gap-2 md:grid-cols-4">
                      <input
                        placeholder="Team name"
                        value={teamForm.name}
                        onChange={(e) => setTeamForm((p) => ({ ...p, name: e.target.value }))}
                        className="border border-slate-300 px-2 py-2 text-sm dark:border-slate-700"
                      />
                      <input
                        placeholder="Description"
                        value={teamForm.description}
                        onChange={(e) => setTeamForm((p) => ({ ...p, description: e.target.value }))}
                        className="border border-slate-300 px-2 py-2 text-sm dark:border-slate-700"
                      />
                      <select
                        multiple
                        value={teamForm.managerUserIds.map(String)}
                        onChange={(e) =>
                          setTeamForm((p) => ({
                            ...p,
                            managerUserIds: Array.from(e.target.selectedOptions).map((opt) => Number(opt.value)),
                          }))
                        }
                        className="h-24 border border-slate-300 px-2 py-2 text-sm dark:border-slate-700"
                      >
                        {users.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.full_name}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() =>
                          withAction(async () => {
                            await apiRequest('/teams', {
                              method: 'POST',
                              body: JSON.stringify({
                                name: teamForm.name,
                                description: teamForm.description,
                                managerUserIds: teamForm.managerUserIds,
                              }),
                            });
                            setTeamForm({ name: '', description: '', managerUserIds: [] });
                            setNewForms((prev) => ({ ...prev, teams: false }));
                          }, 'Team created')
                        }
                        className="border border-blue-400 bg-blue-600 px-2 py-2 text-xs font-semibold text-white"
                      >
                        Create Team
                      </button>
                    </div>
                    )}
                    <div className="space-y-2">
                      {teams.map((team) => (
                        <div key={team.id} className="flex items-center justify-between border border-slate-200 p-2 text-sm dark:border-slate-700">
                          <div>
                            <p className="font-semibold">{team.name}</p>
                            <p className="text-xs text-slate-500">{team.description || 'No description provided.'}</p>
                            <p className="text-xs text-slate-500">Managers: {team.manager_names || 'Unassigned'}</p>
                          </div>
                          <div className="space-x-2">
                            <button
                              onClick={() =>
                                openEditPanel('TEAM', team.id, `Edit Team: ${team.name}`, {
                                  name: team.name,
                                  description: team.description,
                                  managerUserIds: team.manager_user_ids,
                                })
                              }
                              className="border border-slate-300 px-2 py-1 text-xs"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() =>
                                withAction(
                                  async () => {
                                    await apiRequest(`/teams/${team.id}`, { method: 'DELETE' });
                                  },
                                  'Team deleted'
                                )
                              }
                              className="border border-red-300 bg-red-50 px-2 py-1 text-xs text-red-700"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {activePage === 'User Types' && (
                  <section className="rounded-[3px] border border-slate-200 bg-[var(--theme-card)] p-4 dark:border-slate-700">
                    <div className="mb-3 flex items-center justify-between">
                      <h3 className="text-sm font-semibold uppercase">User Types</h3>
                      <button
                        onClick={() => setNewForms((prev) => ({ ...prev, userTypes: !prev.userTypes }))}
                        className="border border-blue-300 bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-800"
                      >
                        +New
                      </button>
                    </div>
                    {newForms.userTypes && (
                    <div className="mb-4 flex gap-2">
                      <input
                        placeholder="User type name"
                        value={userTypeForm.name}
                        onChange={(e) => setUserTypeForm({ name: e.target.value })}
                        className="flex-1 border border-slate-300 px-2 py-2 text-sm dark:border-slate-700"
                      />
                      <button
                        onClick={() =>
                          withAction(async () => {
                            await apiRequest('/user-types', {
                              method: 'POST',
                              body: JSON.stringify({ name: userTypeForm.name }),
                            });
                            setUserTypeForm({ name: '' });
                            setNewForms((prev) => ({ ...prev, userTypes: false }));
                          }, 'User type created')
                        }
                        className="border border-blue-400 bg-blue-600 px-2 py-2 text-xs font-semibold text-white"
                      >
                        Create
                      </button>
                    </div>
                    )}
                    <div className="space-y-2">
                      {userTypes.map((item) => (
                        <div key={item.id} className="flex items-center justify-between border border-slate-200 p-2 text-sm dark:border-slate-700">
                          <span>{item.name}</span>
                          <div className="space-x-2">
                            <button
                              onClick={() =>
                                openEditPanel('USER_TYPE', item.id, `Edit User Type: ${item.name}`, {
                                  name: item.name,
                                })
                              }
                              className="border border-slate-300 px-2 py-1 text-xs"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() =>
                                withAction(
                                  async () => {
                                    await apiRequest(`/user-types/${item.id}`, { method: 'DELETE' });
                                  },
                                  'User type deleted'
                                )
                              }
                              className="border border-red-300 bg-red-50 px-2 py-1 text-xs text-red-700"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {activePage === 'Schools' && (
                  <section className="rounded-[3px] border border-slate-200 bg-[var(--theme-card)] p-4 dark:border-slate-700">
                    <div className="mb-3 flex items-center justify-between">
                      <h3 className="text-sm font-semibold uppercase">Schools</h3>
                      <button
                        onClick={() => setNewForms((prev) => ({ ...prev, schools: !prev.schools }))}
                        className="border border-blue-300 bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-800"
                      >
                        +New
                      </button>
                    </div>
                    {newForms.schools && (
                    <div className="mb-4 flex gap-2">
                      <input
                        placeholder="School name"
                        value={schoolForm.name}
                        onChange={(e) => setSchoolForm({ name: e.target.value })}
                        className="flex-1 border border-slate-300 px-2 py-2 text-sm dark:border-slate-700"
                      />
                      <button
                        onClick={() =>
                          withAction(async () => {
                            await apiRequest('/schools', {
                              method: 'POST',
                              body: JSON.stringify({ name: schoolForm.name }),
                            });
                            setSchoolForm({ name: '' });
                            setNewForms((prev) => ({ ...prev, schools: false }));
                          }, 'School created')
                        }
                        className="border border-blue-400 bg-blue-600 px-2 py-2 text-xs font-semibold text-white"
                      >
                        Create
                      </button>
                    </div>
                    )}
                    <div className="space-y-2">
                      {schools.map((item) => (
                        <div key={item.id} className="flex items-center justify-between border border-slate-200 p-2 text-sm dark:border-slate-700">
                          <span>{item.name}</span>
                          <div className="space-x-2">
                            <button
                              onClick={() =>
                                openEditPanel('SCHOOL', item.id, `Edit School: ${item.name}`, {
                                  name: item.name,
                                })
                              }
                              className="border border-slate-300 px-2 py-1 text-xs"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() =>
                                withAction(
                                  async () => {
                                    await apiRequest(`/schools/${item.id}`, { method: 'DELETE' });
                                  },
                                  'School deleted'
                                )
                              }
                              className="border border-red-300 bg-red-50 px-2 py-1 text-xs text-red-700"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {activePage === 'Users' && (
                  <section className="rounded-[3px] border border-slate-200 bg-[var(--theme-card)] p-4 dark:border-slate-700">
                    <div className="mb-3 flex items-center justify-between">
                      <h3 className="text-sm font-semibold uppercase">Users</h3>
                      <button
                        onClick={() => setNewForms((prev) => ({ ...prev, users: !prev.users }))}
                        className="border border-blue-300 bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-800"
                      >
                        +New
                      </button>
                    </div>
                    {newForms.users && (
                    <div className="mb-4 grid grid-cols-1 gap-2 md:grid-cols-3">
                      <input
                        placeholder="Full name"
                        value={userForm.fullName}
                        onChange={(e) => setUserForm((p) => ({ ...p, fullName: e.target.value }))}
                        className="border border-slate-300 px-2 py-2 text-sm dark:border-slate-700"
                      />
                      <input
                        placeholder="Email"
                        value={userForm.email}
                        onChange={(e) => setUserForm((p) => ({ ...p, email: e.target.value }))}
                        className="border border-slate-300 px-2 py-2 text-sm dark:border-slate-700"
                      />
                      <select
                        value={userForm.role}
                        onChange={(e) => setUserForm((p) => ({ ...p, role: e.target.value as Role }))}
                        className="border border-slate-300 px-2 py-2 text-sm dark:border-slate-700"
                      >
                        <option value="ADMINISTRATOR">ADMINISTRATOR</option>
                        <option value="TEAM_MANAGER">TEAM_MANAGER</option>
                        <option value="USER">USER</option>
                      </select>
                      <select
                        value={userForm.schoolId}
                        onChange={(e) => setUserForm((p) => ({ ...p, schoolId: e.target.value }))}
                        className="border border-slate-300 px-2 py-2 text-sm dark:border-slate-700"
                      >
                        <option value="">School</option>
                        {schools.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                      <select
                        value={userForm.userTypeId}
                        onChange={(e) => setUserForm((p) => ({ ...p, userTypeId: e.target.value }))}
                        className="border border-slate-300 px-2 py-2 text-sm dark:border-slate-700"
                      >
                        <option value="">User type</option>
                        {userTypes.map((ut) => (
                          <option key={ut.id} value={ut.id}>
                            {ut.name}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() =>
                          withAction(async () => {
                            await apiRequest('/users', {
                              method: 'POST',
                              body: JSON.stringify({
                                fullName: userForm.fullName,
                                email: userForm.email,
                                role: userForm.role,
                                schoolId: userForm.schoolId ? Number(userForm.schoolId) : null,
                                userTypeId: userForm.userTypeId ? Number(userForm.userTypeId) : null,
                                isActive: userForm.isActive ? 1 : 0,
                              }),
                            });
                            setUserForm({
                              fullName: '',
                              email: '',
                              role: 'USER',
                              schoolId: '',
                              userTypeId: '',
                              isActive: true,
                            });
                            setNewForms((prev) => ({ ...prev, users: false }));
                          }, 'User created')
                        }
                        className="border border-blue-400 bg-blue-600 px-2 py-2 text-xs font-semibold text-white"
                      >
                        Create User
                      </button>
                    </div>
                    )}
                    <div className="space-y-2">
                      {users.map((u) => (
                        <div key={u.id} className="flex items-center justify-between border border-slate-200 p-2 text-sm dark:border-slate-700">
                          <div>
                            <p className="font-semibold">{u.full_name}</p>
                            <p className="text-xs text-slate-500">
                              {u.email} • {u.role} • {u.is_active ? 'Active' : 'Inactive'}
                            </p>
                          </div>
                          <div className="space-x-2">
                            <button
                              onClick={() =>
                                openEditPanel('USER', u.id, `Edit User: ${u.full_name}`, {
                                  fullName: u.full_name,
                                  email: u.email,
                                  role: u.role,
                                  schoolId: String(u.school_id ?? ''),
                                  userTypeId: String(u.user_type_id ?? ''),
                                  isActive: String(u.is_active),
                                })
                              }
                              className="border border-slate-300 px-2 py-1 text-xs"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() =>
                                withAction(
                                  async () => {
                                    await apiRequest(`/users/${u.id}`, { method: 'DELETE' });
                                  },
                                  'User deleted'
                                )
                              }
                              className="border border-red-300 bg-red-50 px-2 py-1 text-xs text-red-700"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {activePage === 'Documents' && (
                  <section className="rounded-[3px] border border-slate-200 bg-[var(--theme-card)] p-4 dark:border-slate-700">
                    <div className="mb-3 flex items-center justify-between">
                      <h3 className="text-sm font-semibold uppercase">Documents</h3>
                      <button
                        onClick={() => setNewForms((prev) => ({ ...prev, documents: !prev.documents }))}
                        className="border border-blue-300 bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-800"
                      >
                        +New
                      </button>
                    </div>
                    {newForms.documents && (
                    <div className="mb-4 grid grid-cols-1 gap-2 md:grid-cols-3">
                      <input
                        placeholder="Title"
                        value={docForm.title}
                        onChange={(e) => setDocForm((p) => ({ ...p, title: e.target.value }))}
                        className="border border-slate-300 px-2 py-2 text-sm dark:border-slate-700"
                      />
                      <input
                        placeholder="Description"
                        value={docForm.description}
                        onChange={(e) => setDocForm((p) => ({ ...p, description: e.target.value }))}
                        className="border border-slate-300 px-2 py-2 text-sm dark:border-slate-700"
                      />
                      <input
                        placeholder="Content"
                        value={docForm.content}
                        onChange={(e) => setDocForm((p) => ({ ...p, content: e.target.value }))}
                        className="border border-slate-300 px-2 py-2 text-sm dark:border-slate-700"
                      />
                      <select
                        value={docForm.teamId}
                        onChange={(e) => setDocForm((p) => ({ ...p, teamId: e.target.value }))}
                        className="border border-slate-300 px-2 py-2 text-sm dark:border-slate-700"
                      >
                        <option value="">Team</option>
                        {teams.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                      <select
                        value={docForm.schedule}
                        onChange={(e) => setDocForm((p) => ({ ...p, schedule: e.target.value as 'MONTHLY' | 'QUARTERLY' | 'YEARLY' }))}
                        className="border border-slate-300 px-2 py-2 text-sm dark:border-slate-700"
                      >
                        <option value="MONTHLY">MONTHLY</option>
                        <option value="QUARTERLY">QUARTERLY</option>
                        <option value="YEARLY">YEARLY</option>
                      </select>
                      <input
                        type="date"
                        value={docForm.dueDate}
                        onChange={(e) => setDocForm((p) => ({ ...p, dueDate: e.target.value }))}
                        className="border border-slate-300 px-2 py-2 text-sm dark:border-slate-700"
                      />
                      <input
                        type="date"
                        value={docForm.endDate}
                        onChange={(e) => setDocForm((p) => ({ ...p, endDate: e.target.value }))}
                        className="border border-slate-300 px-2 py-2 text-sm dark:border-slate-700"
                      />
                      <input
                        placeholder="File URL"
                        value={docForm.fileUrl}
                        onChange={(e) => setDocForm((p) => ({ ...p, fileUrl: e.target.value }))}
                        className="border border-slate-300 px-2 py-2 text-sm dark:border-slate-700"
                      />
                      <select
                        multiple
                        value={docForm.userTypeIds.map(String)}
                        onChange={(e) =>
                          setDocForm((p) => ({
                            ...p,
                            userTypeIds: Array.from(e.target.selectedOptions).map((opt) => Number(opt.value)),
                          }))
                        }
                        className="h-24 border border-slate-300 px-2 py-2 text-sm dark:border-slate-700"
                      >
                        {userTypes.map((ut) => (
                          <option key={ut.id} value={ut.id}>
                            {ut.name}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() =>
                          withAction(async () => {
                            if (!activeUser) return;
                            await apiRequest('/documents', {
                              method: 'POST',
                              body: JSON.stringify({
                                teamId: Number(docForm.teamId),
                                title: docForm.title,
                                description: docForm.description,
                                content: docForm.content,
                                documentType: docForm.documentType,
                                schedule: docForm.schedule,
                                dueDate: docForm.dueDate,
                                endDate: docForm.endDate,
                                fileUrl: docForm.fileUrl,
                                userTypeIds: docForm.userTypeIds,
                                actorUserId: activeUser.id,
                              }),
                            });
                            setDocForm({
                              title: '',
                              description: '',
                              content: '',
                              teamId: '',
                              documentType: 'PDF',
                              schedule: 'YEARLY',
                              dueDate: '',
                              endDate: '',
                              fileUrl: '',
                              userTypeIds: [],
                            });
                            setNewForms((prev) => ({ ...prev, documents: false }));
                          }, 'Document created')
                        }
                        className="border border-blue-400 bg-blue-600 px-2 py-2 text-xs font-semibold text-white"
                      >
                        Create Document
                      </button>
                    </div>
                    )}

                    <div className="space-y-2">
                      {documents.map((doc) => (
                        <div key={doc.id} className="flex items-center justify-between border border-slate-200 p-2 text-sm dark:border-slate-700">
                          <div>
                            <p className="font-semibold">{doc.title}</p>
                            <p className="text-xs text-slate-500">
                              <span className={`mr-1 inline-flex rounded-[3px] px-1.5 py-0.5 font-semibold ${teamBadgeClass(doc.team_name)}`}>
                                {doc.team_name}
                              </span>
                              • {doc.schedule} • {doc.user_types}
                            </p>
                          </div>
                          <div className="space-x-2">
                            <button
                              onClick={() => {
                                openDocumentEditPanel(doc, `Edit Document: ${doc.title}`).catch((error) =>
                                  updateNotice(error instanceof Error ? error.message : 'Unable to open editor')
                                );
                              }}
                              className="border border-slate-300 px-2 py-1 text-xs"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() =>
                                withAction(
                                  async () => {
                                    await apiRequest(`/documents/${doc.id}`, { method: 'DELETE' });
                                  },
                                  'Document deleted'
                                )
                              }
                              className="border border-red-300 bg-red-50 px-2 py-1 text-xs text-red-700"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                )}
              </>
            ) : isUserMyDocumentsPage ? (
              <section className="rounded-[3px] border border-slate-200 bg-[var(--theme-card)] p-4 dark:border-slate-700">
                <h3 className="mb-2 text-sm font-semibold uppercase">My Documents</h3>
                <p className="mb-3 text-xs text-slate-500">Documents currently assigned to your user type.</p>
                <div className="space-y-2">
                  {filteredDocuments.length ? (
                    filteredDocuments.map((doc) => (
                      <button
                        key={doc.id}
                        onClick={() => setSelectedDocId(doc.id)}
                        className="w-full rounded-[3px] border border-slate-200 bg-white p-3 text-left hover:border-slate-400 dark:border-slate-700 dark:bg-slate-900"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="font-semibold">{doc.title}</p>
                            <p className="text-xs text-slate-500">{doc.team_name} • {doc.schedule} • {doc.user_types}</p>
                          </div>
                          <span className={`rounded-[3px] px-2 py-1 text-xs font-semibold ${badgeClass(doc.status)}`}>
                            {doc.status}
                          </span>
                        </div>
                        <p className="mt-2 text-xs text-slate-500">{formatDueText(doc.due_date)}</p>
                      </button>
                    ))
                  ) : (
                    <p className="text-xs text-slate-500">No assigned documents match your search.</p>
                  )}
                </div>
              </section>
            ) : isUserHistoryPage ? (
              <section className="rounded-[3px] border border-slate-200 bg-[var(--theme-card)] p-4 dark:border-slate-700">
                <h3 className="mb-2 text-sm font-semibold uppercase">History</h3>
                <p className="mb-3 text-xs text-slate-500">Documents you have already acknowledged.</p>
                <div className="space-y-2">
                  {myCompletedDocuments.length ? (
                    myCompletedDocuments.map((doc) => (
                      <button
                        key={doc.id}
                        onClick={() => setSelectedDocId(doc.id)}
                        className="w-full rounded-[3px] border border-emerald-200 bg-emerald-50 p-3 text-left hover:bg-emerald-100"
                      >
                        <p className="font-semibold text-emerald-900">{doc.title}</p>
                        <p className="text-xs text-emerald-700">{doc.team_name} • Completed</p>
                      </button>
                    ))
                  ) : (
                    <p className="text-xs text-slate-500">No completed acknowledgments yet.</p>
                  )}
                </div>
              </section>
            ) : isMyTeamDocsPage ? (
              <section className="rounded-[3px] border border-slate-200 bg-[var(--theme-card)] p-4 dark:border-slate-700">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-semibold uppercase">My Team Docs</h3>
                  <button
                    onClick={() => setNewForms((prev) => ({ ...prev, myTeamDocs: !prev.myTeamDocs }))}
                    className="border border-blue-300 bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-800"
                  >
                    +New
                  </button>
                </div>
                <p className="mb-3 text-xs text-slate-500">Manage documents assigned to your team(s). You can add new documents or edit existing ones.</p>

                {newForms.myTeamDocs && (
                <div className="mb-4 grid grid-cols-1 gap-2 md:grid-cols-3">
                  <select
                    value={teamDocForm.teamId}
                    onChange={(e) => setTeamDocForm((p) => ({ ...p, teamId: e.target.value }))}
                    className="border border-slate-300 px-2 py-2 text-sm dark:border-slate-700"
                  >
                    <option value="">Team</option>
                    {teams.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                  <input
                    placeholder="Title"
                    value={teamDocForm.title}
                    onChange={(e) => setTeamDocForm((p) => ({ ...p, title: e.target.value }))}
                    className="border border-slate-300 px-2 py-2 text-sm dark:border-slate-700"
                  />
                  <input
                    placeholder="Description"
                    value={teamDocForm.description}
                    onChange={(e) => setTeamDocForm((p) => ({ ...p, description: e.target.value }))}
                    className="border border-slate-300 px-2 py-2 text-sm dark:border-slate-700"
                  />
                  <input
                    placeholder="Content"
                    value={teamDocForm.content}
                    onChange={(e) => setTeamDocForm((p) => ({ ...p, content: e.target.value }))}
                    className="border border-slate-300 px-2 py-2 text-sm dark:border-slate-700"
                  />
                  <select
                    value={teamDocForm.schedule}
                    onChange={(e) =>
                      setTeamDocForm((p) => ({ ...p, schedule: e.target.value as 'MONTHLY' | 'QUARTERLY' | 'YEARLY' }))
                    }
                    className="border border-slate-300 px-2 py-2 text-sm dark:border-slate-700"
                  >
                    <option value="MONTHLY">MONTHLY</option>
                    <option value="QUARTERLY">QUARTERLY</option>
                    <option value="YEARLY">YEARLY</option>
                  </select>
                  <input
                    type="date"
                    value={teamDocForm.dueDate}
                    onChange={(e) => setTeamDocForm((p) => ({ ...p, dueDate: e.target.value }))}
                    className="border border-slate-300 px-2 py-2 text-sm dark:border-slate-700"
                  />
                  <input
                    type="date"
                    value={teamDocForm.endDate}
                    onChange={(e) => setTeamDocForm((p) => ({ ...p, endDate: e.target.value }))}
                    className="border border-slate-300 px-2 py-2 text-sm dark:border-slate-700"
                  />
                  <input
                    placeholder="File URL"
                    value={teamDocForm.fileUrl}
                    onChange={(e) => setTeamDocForm((p) => ({ ...p, fileUrl: e.target.value }))}
                    className="border border-slate-300 px-2 py-2 text-sm dark:border-slate-700"
                  />
                  <select
                    multiple
                    value={teamDocForm.userTypeIds.map(String)}
                    onChange={(e) =>
                      setTeamDocForm((p) => ({
                        ...p,
                        userTypeIds: Array.from(e.target.selectedOptions).map((opt) => Number(opt.value)),
                      }))
                    }
                    className="h-24 border border-slate-300 px-2 py-2 text-sm dark:border-slate-700"
                  >
                    {lookups.userTypes.map((ut) => (
                      <option key={ut.id} value={ut.id}>
                        {ut.name}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() =>
                      withAction(async () => {
                        if (!activeUser) return;
                        await apiRequest('/documents', {
                          method: 'POST',
                          body: JSON.stringify({
                            teamId: Number(teamDocForm.teamId),
                            title: teamDocForm.title,
                            description: teamDocForm.description,
                            content: teamDocForm.content,
                            documentType: teamDocForm.documentType,
                            schedule: teamDocForm.schedule,
                            dueDate: teamDocForm.dueDate,
                            endDate: teamDocForm.endDate,
                            fileUrl: teamDocForm.fileUrl,
                            userTypeIds: teamDocForm.userTypeIds,
                            actorUserId: activeUser.id,
                          }),
                        });
                        await refreshTeamManagerDocs(activeUser.id);
                        setTeamDocForm((p) => ({
                          ...p,
                          title: '',
                          description: '',
                          content: '',
                          dueDate: '',
                          endDate: '',
                          fileUrl: '',
                          userTypeIds: [],
                        }));
                        setNewForms((prev) => ({ ...prev, myTeamDocs: false }));
                      }, 'Team document created')
                    }
                    className="border border-blue-400 bg-blue-600 px-2 py-2 text-xs font-semibold text-white"
                  >
                    Add Team Document
                  </button>
                </div>
                )}

                <div className="space-y-2">
                  {teamDocs.length ? (
                    teamDocs.map((doc) => (
                      <div key={doc.id} className="flex items-center justify-between border border-slate-200 p-2 text-sm dark:border-slate-700">
                        <div>
                          <p className="font-semibold">{doc.title}</p>
                          <p className="text-xs text-slate-500">
                            <span className={`mr-1 inline-flex rounded-[3px] px-1.5 py-0.5 font-semibold ${teamBadgeClass(doc.team_name)}`}>
                              {doc.team_name}
                            </span>
                            • {doc.schedule} • {formatDueText(doc.due_date)}
                          </p>
                        </div>
                        <div className="space-x-2">
                          <button
                            onClick={() => {
                              openDocumentEditPanel(doc, `Edit Team Document: ${doc.title}`).catch((error) =>
                                updateNotice(error instanceof Error ? error.message : 'Unable to open editor')
                              );
                            }}
                            className="border border-slate-300 px-2 py-1 text-xs"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => setSelectedDocId(doc.id)}
                            className="border border-slate-300 px-2 py-1 text-xs"
                          >
                            View
                          </button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-slate-500">No documents found for your managed team(s).</p>
                  )}
                </div>
              </section>
            ) : loading || !dashboard || !activeUser ? (
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
                    <div key={label} className="rounded-[3px] border border-slate-200 bg-[var(--theme-card)] p-3 dark:border-slate-700">
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
                    <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-300">Overdue Queue</h3>
                    <div className="space-y-2 text-sm">
                      {dashboard.overdueList.length ? (
                        dashboard.overdueList.map((item) => (
                          <button
                            key={item.id}
                            onClick={() => setSelectedDocId(item.id)}
                            className="w-full rounded-[3px] border border-red-200 bg-red-50 p-2 text-left hover:bg-red-100"
                          >
                            <p className="font-semibold text-red-900">{item.title}</p>
                            <p className="text-xs text-red-700">
                              {item.team_name} • {formatDueText(item.due_date)}
                            </p>
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
                              <span className={`rounded-[3px] px-2 py-1 text-xs font-semibold ${badgeClass(doc.status)}`}>{doc.status}</span>
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
                          <span className={`rounded-[3px] px-2 py-1 text-xs font-semibold ${badgeClass(doc.status)}`}>{doc.status}</span>
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
        {editPanel && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setEditPanel(null)}
              className="fixed inset-0 z-40 bg-slate-900/20"
            />
            <motion.aside
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ duration: 0.24, ease: 'easeInOut' }}
              className="fixed right-0 top-0 z-50 h-screen w-full max-w-2xl overflow-y-auto border-l border-slate-300 bg-white p-4 dark:border-slate-700 dark:bg-slate-950"
            >
              <div className="mb-4 flex items-center justify-between border-b border-slate-200 pb-2 dark:border-slate-700">
                <h3 className="text-lg font-semibold">{editPanel.title}</h3>
                <button
                  onClick={() => setEditPanel(null)}
                  className="rounded-[3px] border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800"
                >
                  Close
                </button>
              </div>

              <div className="space-y-3 text-sm">
                {editPanel.entity === 'TEAM' && (
                  <>
                    <label className="block">
                      <span className="mb-1 block text-xs uppercase text-slate-500">Team Name</span>
                      <input
                        value={payloadString('name')}
                        onChange={(e) =>
                          setEditPanel((prev) =>
                            prev ? { ...prev, payload: { ...prev.payload, name: e.target.value } } : prev
                          )
                        }
                        className="w-full border border-slate-300 px-2 py-2 dark:border-slate-700"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-xs uppercase text-slate-500">Description</span>
                      <textarea
                        rows={3}
                        value={payloadString('description')}
                        onChange={(e) =>
                          setEditPanel((prev) =>
                            prev ? { ...prev, payload: { ...prev.payload, description: e.target.value } } : prev
                          )
                        }
                        className="w-full border border-slate-300 px-2 py-2 dark:border-slate-700"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-xs uppercase text-slate-500">Managers</span>
                      <select
                        multiple
                        value={payloadNumberArray('managerUserIds').map(String)}
                        onChange={(e) =>
                          setEditPanel((prev) => {
                            if (!prev) return prev;
                            const managerUserIds = Array.from(e.target.selectedOptions).map((opt) => Number(opt.value));
                            return { ...prev, payload: { ...prev.payload, managerUserIds } };
                          })
                        }
                        className="h-28 w-full border border-slate-300 px-2 py-2 dark:border-slate-700"
                      >
                        {users.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.full_name}
                          </option>
                        ))}
                      </select>
                      <p className="mt-1 text-xs text-slate-500">Hold Ctrl/Cmd to select multiple managers.</p>
                    </label>
                  </>
                )}

                {editPanel.entity === 'USER_TYPE' && (
                  <label className="block">
                    <span className="mb-1 block text-xs uppercase text-slate-500">User Type Name</span>
                    <input
                      value={payloadString('name')}
                      onChange={(e) =>
                        setEditPanel((prev) =>
                          prev ? { ...prev, payload: { ...prev.payload, name: e.target.value } } : prev
                        )
                      }
                      className="w-full border border-slate-300 px-2 py-2 dark:border-slate-700"
                    />
                  </label>
                )}

                {editPanel.entity === 'SCHOOL' && (
                  <label className="block">
                    <span className="mb-1 block text-xs uppercase text-slate-500">School Name</span>
                    <input
                      value={payloadString('name')}
                      onChange={(e) =>
                        setEditPanel((prev) =>
                          prev ? { ...prev, payload: { ...prev.payload, name: e.target.value } } : prev
                        )
                      }
                      className="w-full border border-slate-300 px-2 py-2 dark:border-slate-700"
                    />
                  </label>
                )}

                {editPanel.entity === 'USER' && (
                  <>
                    <label className="block">
                      <span className="mb-1 block text-xs uppercase text-slate-500">Full Name</span>
                      <input
                        value={payloadString('fullName')}
                        onChange={(e) =>
                          setEditPanel((prev) =>
                            prev ? { ...prev, payload: { ...prev.payload, fullName: e.target.value } } : prev
                          )
                        }
                        className="w-full border border-slate-300 px-2 py-2 dark:border-slate-700"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-xs uppercase text-slate-500">Email</span>
                      <input
                        value={payloadString('email')}
                        onChange={(e) =>
                          setEditPanel((prev) =>
                            prev ? { ...prev, payload: { ...prev.payload, email: e.target.value } } : prev
                          )
                        }
                        className="w-full border border-slate-300 px-2 py-2 dark:border-slate-700"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-xs uppercase text-slate-500">Role</span>
                      <select
                        value={payloadString('role', 'USER')}
                        onChange={(e) =>
                          setEditPanel((prev) =>
                            prev ? { ...prev, payload: { ...prev.payload, role: e.target.value } } : prev
                          )
                        }
                        className="w-full border border-slate-300 px-2 py-2 dark:border-slate-700"
                      >
                        <option value="ADMINISTRATOR">ADMINISTRATOR</option>
                        <option value="TEAM_MANAGER">TEAM_MANAGER</option>
                        <option value="USER">USER</option>
                      </select>
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="block">
                        <span className="mb-1 block text-xs uppercase text-slate-500">School</span>
                        <select
                          value={payloadString('schoolId')}
                          onChange={(e) =>
                            setEditPanel((prev) =>
                              prev ? { ...prev, payload: { ...prev.payload, schoolId: e.target.value } } : prev
                            )
                          }
                          className="w-full border border-slate-300 px-2 py-2 dark:border-slate-700"
                        >
                          <option value="">None</option>
                          {schools.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-xs uppercase text-slate-500">User Type</span>
                        <select
                          value={payloadString('userTypeId')}
                          onChange={(e) =>
                            setEditPanel((prev) =>
                              prev ? { ...prev, payload: { ...prev.payload, userTypeId: e.target.value } } : prev
                            )
                          }
                          className="w-full border border-slate-300 px-2 py-2 dark:border-slate-700"
                        >
                          <option value="">None</option>
                          {userTypes.map((ut) => (
                            <option key={ut.id} value={ut.id}>
                              {ut.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <label className="block">
                      <span className="mb-1 block text-xs uppercase text-slate-500">Active</span>
                      <select
                        value={payloadString('isActive', '1')}
                        onChange={(e) =>
                          setEditPanel((prev) =>
                            prev ? { ...prev, payload: { ...prev.payload, isActive: e.target.value } } : prev
                          )
                        }
                        className="w-full border border-slate-300 px-2 py-2 dark:border-slate-700"
                      >
                        <option value="1">Active</option>
                        <option value="0">Inactive</option>
                      </select>
                    </label>
                  </>
                )}

                {editPanel.entity === 'DOCUMENT' && (
                  <>
                    <label className="block">
                      <span className="mb-1 block text-xs uppercase text-slate-500">Title</span>
                      <input
                        value={payloadString('title')}
                        onChange={(e) =>
                          setEditPanel((prev) =>
                            prev ? { ...prev, payload: { ...prev.payload, title: e.target.value } } : prev
                          )
                        }
                        className="w-full border border-slate-300 px-2 py-2 dark:border-slate-700"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-xs uppercase text-slate-500">Description</span>
                      <textarea
                        value={payloadString('description')}
                        onChange={(e) =>
                          setEditPanel((prev) =>
                            prev ? { ...prev, payload: { ...prev.payload, description: e.target.value } } : prev
                          )
                        }
                        className="w-full border border-slate-300 px-2 py-2 dark:border-slate-700"
                        rows={3}
                      />
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="block">
                        <span className="mb-1 block text-xs uppercase text-slate-500">Due Date</span>
                        <input
                          type="date"
                          value={payloadString('dueDate')}
                          onChange={(e) =>
                            setEditPanel((prev) =>
                              prev ? { ...prev, payload: { ...prev.payload, dueDate: e.target.value } } : prev
                            )
                          }
                          className="w-full border border-slate-300 px-2 py-2 dark:border-slate-700"
                        />
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-xs uppercase text-slate-500">Schedule</span>
                        <select
                          value={payloadString('schedule', 'YEARLY')}
                          onChange={(e) =>
                            setEditPanel((prev) =>
                              prev ? { ...prev, payload: { ...prev.payload, schedule: e.target.value } } : prev
                            )
                          }
                          className="w-full border border-slate-300 px-2 py-2 dark:border-slate-700"
                        >
                          <option value="MONTHLY">MONTHLY</option>
                          <option value="QUARTERLY">QUARTERLY</option>
                          <option value="YEARLY">YEARLY</option>
                        </select>
                      </label>
                    </div>
                    <label className="block">
                      <span className="mb-1 block text-xs uppercase text-slate-500">User Types</span>
                      <select
                        multiple
                        value={payloadNumberArray('userTypeIds').map(String)}
                        onChange={(e) => {
                          const values = Array.from(e.target.selectedOptions).map((opt) => Number(opt.value));
                          setEditPanel((prev) =>
                            prev ? { ...prev, payload: { ...prev.payload, userTypeIds: values } } : prev
                          );
                        }}
                        className="h-28 w-full border border-slate-300 px-2 py-2 dark:border-slate-700"
                      >
                        {lookups.userTypes.map((ut) => (
                          <option key={ut.id} value={ut.id}>
                            {ut.name}
                          </option>
                        ))}
                      </select>
                      <p className="mt-1 text-xs text-slate-500">Hold Ctrl/Cmd to select multiple user types.</p>
                    </label>
                  </>
                )}

                <div className="flex gap-2 pt-2">
                  <button
                    onClick={saveEditPanel}
                    className="rounded-[3px] border border-blue-400 bg-blue-600 px-3 py-2 text-xs font-semibold text-white"
                  >
                    Save Changes
                  </button>
                  <button
                    onClick={() => setEditPanel(null)}
                    className="rounded-[3px] border border-slate-300 px-3 py-2 text-xs hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

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
