import { useEffect, useMemo, useState } from 'react';
import {
  Bell,
  LayoutPanelLeft,
  Moon,
  Search,
  Settings,
  Sun,
} from 'lucide-react';
import { DocumentDetailsPanel } from './components/DocumentDetailsPanel';
import { EditPanel } from './components/EditPanel';
import { GreetingCard } from './components/GreetingCard';
import { SidebarNav } from './components/SidebarNav';
import { TrendChart } from './components/TrendChart';
import { apiRequest } from './lib/api';
import { badgeClass, formatDueText, normalizeTeam, teamBadgeClass } from './lib/ui';
import type {
  AdminUser,
  DashboardResponse,
  DetailTab,
  DocumentDetails,
  DocumentItem,
  EditEntity,
  EditPanelState,
  LookupItem,
  LookupUser,
  Role,
  School,
  Team,
  UserType,
} from './types';

const NAVY = '#004a7c';
const ACCENT = '#0078d4';

function App() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [search, setSearch] = useState('');
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
  const [activeDetailTab, setActiveDetailTab] = useState<DetailTab>('DETAILS');
  const [panelWidth, setPanelWidth] = useState(50);
  const [panelPinned, setPanelPinned] = useState(false);
  const [editPanel, setEditPanel] = useState<EditPanelState | null>(null);

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
      return ['Dashboard', 'Teams', 'Users', 'User Types', 'Schools', 'Documents', 'Reports', 'Settings'];
    }
    if (activeUser.role === 'TEAM_MANAGER') return ['Dashboard', 'My Team Docs', 'Activity', 'Reports'];
    return ['Dashboard', 'My Documents', 'History'];
  }, [activeUser]);
  const greetingName = useMemo(() => {
    if (!activeUser?.full_name) return 'there';
    return activeUser.full_name.split(' ')[0] || activeUser.full_name;
  }, [activeUser?.full_name]);

  const greetingUserType = useMemo(() => {
    return activeUser?.user_type_name || activeUser?.role || 'USER';
  }, [activeUser?.user_type_name, activeUser?.role]);

  const activeTeamNames = useMemo(() => {
    if (!activeUser) return [] as string[];
    if (activeUser.role === 'ADMINISTRATOR') {
      return teams.map((team) => team.name).filter(Boolean);
    }
    if (activeUser.role === 'TEAM_MANAGER') {
      return teams
        .filter((team) => team.manager_user_ids.includes(activeUser.id))
        .map((team) => team.name)
        .filter(Boolean);
    }
    return Array.from(new Set(documents.map((doc) => doc.team_name).filter(Boolean)));
  }, [activeUser, teams, documents]);

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
      fileUrl: doc.file_url ?? '',
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
            fileUrl: payload.fileUrl,
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

  const updateEditPanelPayload = (patch: Record<string, unknown>) => {
    setEditPanel((prev) => (prev ? { ...prev, payload: { ...prev.payload, ...patch } } : prev));
  };

  return (
    <div className="min-h-screen bg-[var(--theme-app)] text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <div className="flex min-h-screen">
        <SidebarNav
          nav={nav}
          activePage={activePage}
          sidebarCollapsed={sidebarCollapsed}
          onSelectPage={setActivePage}
        />

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

          </header>

          <div className="space-y-4 p-4">
            {notice && <div className="rounded-[3px] border border-blue-200 bg-blue-50 p-2 text-xs text-blue-900">{notice}</div>}

            <GreetingCard
              activeUser={activeUser}
              greetingName={greetingName}
              greetingUserType={greetingUserType}
              activeTeamNames={activeTeamNames}
            />

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
                          className="border border-slate-300 px-2 py-2 text-sm dark:border-slate-700 md:col-span-3"
                        />
                        <input
                          placeholder="Document URL"
                          value={docForm.fileUrl}
                          onChange={(e) => setDocForm((p) => ({ ...p, fileUrl: e.target.value }))}
                          className="border border-slate-300 px-2 py-2 text-sm dark:border-slate-700 md:col-span-3"
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
                      className="border border-slate-300 px-2 py-2 text-sm dark:border-slate-700 md:col-span-3"
                    />
                    <input
                      placeholder="Document URL"
                      value={teamDocForm.fileUrl}
                      onChange={(e) => setTeamDocForm((p) => ({ ...p, fileUrl: e.target.value }))}
                      className="border border-slate-300 px-2 py-2 text-sm dark:border-slate-700 md:col-span-3"
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
              </>
            )}
          </div>
        </main>
      </div>

      <EditPanel
        editPanel={editPanel}
        users={users}
        schools={schools}
        userTypes={userTypes}
        lookupUserTypes={lookups.userTypes}
        onChangePayload={updateEditPanelPayload}
        onSave={saveEditPanel}
        onClose={() => setEditPanel(null)}
      />

      <DocumentDetailsPanel
        docDetails={docDetails}
        isOpen={Boolean(selectedDocId && docDetails)}
        panelWidth={panelWidth}
        panelPinned={panelPinned}
        activeDetailTab={activeDetailTab}
        canAcknowledge={activeUser?.role === 'USER'}
        onTogglePinned={() => setPanelPinned((value) => !value)}
        onClose={() => setSelectedDocId(null)}
        onPanelWidthChange={setPanelWidth}
        onTabChange={setActiveDetailTab}
        onAcknowledge={handleAcknowledge}
      />
    </div>
  );
}

export default App;
