import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Bell,
  ChevronDown,
  ChevronRight,
  LayoutPanelLeft,
  LogOut,
  Moon,
  Search,
  Settings,
  Sun,
} from 'lucide-react';
import { DocumentDetailsPanel } from './components/DocumentDetailsPanel';
import { EditPanel } from './components/EditPanel';
import { GreetingCard } from './components/GreetingCard';
import { ReportsPanel } from './components/ReportsPanel';
import { SidebarNav } from './components/SidebarNav';
import { SignatureModal } from './components/SignatureModal';
import { UserSignaturesPanel } from './components/UserSignaturesPanel';
import { ComplianceChart } from './components/ComplianceChart';
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
  UserSignature,
  UserType,
} from './types';

const NAVY = '#004a7c';
const ACCENT = '#0078d4';
const THEME_STORAGE_KEY = 'docrecord-theme-mode';

const getInitialDarkMode = () => {
  if (typeof window === 'undefined') return false;
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === 'dark') return true;
  if (stored === 'light') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
};

function App() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(max-width: 767px)').matches;
  });
  const [darkMode, setDarkMode] = useState(getInitialDarkMode);
  const [search, setSearch] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activePage, setActivePage] = useState('Dashboard');
  const [notice, setNotice] = useState('');
  const [disclaimerText, setDisclaimerText] = useState('');
  const [disclaimerDraft, setDisclaimerDraft] = useState('');
  const [disclaimerUpdatedAt, setDisclaimerUpdatedAt] = useState<string | null>(null);
  const [savingDisclaimer, setSavingDisclaimer] = useState(false);
  const [seedingTestData, setSeedingTestData] = useState(false);
  const [addingTestUser, setAddingTestUser] = useState(false);
  const [addingTestDocument, setAddingTestDocument] = useState(false);
  const [openSettingSections, setOpenSettingSections] = useState<Record<string, boolean>>({
    seedTestData: true,
    addTestData: true,
    disclaimer: true,
  });
  const toggleSettingSection = (key: string) =>
    setOpenSettingSections((prev) => ({ ...prev, [key]: !prev[key] }));

  const [lookups, setLookups] = useState<{
    users: LookupUser[];
    teams: LookupItem[];
    userTypes: LookupItem[];
    schools: LookupItem[];
  }>({ users: [], teams: [], userTypes: [], schools: [] });
  const [lookupsLoading, setLookupsLoading] = useState(true);
  const [lookupsError, setLookupsError] = useState('');
  const [authNotice, setAuthNotice] = useState('');
  const [registering, setRegistering] = useState(false);
  const [splashSelectedUserId, setSplashSelectedUserId] = useState('');
  const [registerForm, setRegisterForm] = useState({
    fullName: '',
    email: '',
    schoolId: '',
    userTypeId: '',
  });

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
  const [documentUserTypeLinks, setDocumentUserTypeLinks] = useState<
    Array<{ document_id: number; user_type_id: number }>
  >([]);
  const [expandedUserTypeIds, setExpandedUserTypeIds] = useState<number[]>([]);

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
  const [isMyTeamDocPanelOpen, setIsMyTeamDocPanelOpen] = useState(false);
  const [isDocumentPanelOpen, setIsDocumentPanelOpen] = useState(false);

  const [selectedDocId, setSelectedDocId] = useState<number | null>(null);
  const [docDetails, setDocDetails] = useState<DocumentDetails | null>(null);
  const [activeDetailTab, setActiveDetailTab] = useState<DetailTab>('DETAILS');
  const [panelWidth, setPanelWidth] = useState(50);
  const [panelPinned, setPanelPinned] = useState(false);
  const [signatureModalOpen, setSignatureModalOpen] = useState(false);
  const [savingSignature, setSavingSignature] = useState(false);
  const [userSignatures, setUserSignatures] = useState<UserSignature[]>([]);
  const [loadingUserSignatures, setLoadingUserSignatures] = useState(false);
  const [savingUserSignature, setSavingUserSignature] = useState(false);
  const [deletingUserSignatureId, setDeletingUserSignatureId] = useState<number | null>(null);
  const [settingDefaultUserSignatureId, setSettingDefaultUserSignatureId] = useState<number | null>(null);
  const [editPanel, setEditPanel] = useState<EditPanelState | null>(null);

  const [theme, setTheme] = useState({
    app: '#f8fafc',
    header: NAVY,
    menu: '#0d1b2a',
    card: '#ffffff',
    button: ACCENT,
  });

  const fetchLookups = async () => {
    setLookupsLoading(true);
    setLookupsError('');
    const data = await apiRequest<{
      users: LookupUser[];
      teams: LookupItem[];
      userTypes: LookupItem[];
      schools: LookupItem[];
    }>('/lookups');
    if (!data) {
      setLookupsLoading(false);
      return;
    }
    setLookups(data);
    setSplashSelectedUserId((prev) => {
      if (prev && data.users.some((user) => String(user.id) === prev)) return prev;
      return data.users.length ? String(data.users[0].id) : '';
    });
    setActiveUserId((prev) => {
      if (prev && data.users.some((user) => user.id === prev)) return prev;
      return null;
    });
    setLookupsLoading(false);
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
    const [teamsData, userTypesData, schoolsData, usersData, documentUserTypeData] = await Promise.all([
      apiRequest<Team[]>('/teams'),
      apiRequest<UserType[]>('/user-types'),
      apiRequest<School[]>('/schools'),
      apiRequest<AdminUser[]>('/users'),
      apiRequest<Array<{ document_id: number; user_type_id: number }>>('/document-user-types'),
    ]);
    setTeams(((teamsData as unknown as Array<Record<string, unknown>>) ?? []).map(normalizeTeam));
    setUserTypes(userTypesData ?? []);
    setSchools(schoolsData ?? []);
    setUsers(usersData ?? []);
    setDocumentUserTypeLinks(documentUserTypeData ?? []);
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

  const refreshDisclaimer = async () => {
    const response = await apiRequest<{ text: string; updated_at: string | null }>('/settings/disclaimer');
    if (!response) return;
    setDisclaimerText(response.text ?? '');
    setDisclaimerDraft(response.text ?? '');
    setDisclaimerUpdatedAt(response.updated_at ?? null);
  };

  const refreshUserSignatures = async (userId: number) => {
    setLoadingUserSignatures(true);
    try {
      const data = await apiRequest<UserSignature[]>(`/signatures?userId=${userId}&actorUserId=${userId}`);
      setUserSignatures(data ?? []);
    } finally {
      setLoadingUserSignatures(false);
    }
  };

  useEffect(() => {
    fetchLookups().catch(() => {
      setLoading(false);
      setLookupsLoading(false);
      setLookupsError('Unable to reach the API at http://localhost:3001. Start the server and refresh.');
      setAuthNotice('Connection failed. Start the backend server to load users and enable registration.');
    });
    refreshDisclaimer().catch(() => undefined);
  }, []);

  useEffect(() => {
    if (activeUserId) {
      refreshDashboard(activeUserId).catch(() => setLoading(false));
    }
  }, [activeUserId]);

  useEffect(() => {
    if (activeUser?.role === 'USER') {
      refreshUserSignatures(activeUser.id).catch(() => undefined);
      return;
    }
    setUserSignatures([]);
  }, [activeUser?.id, activeUser?.role]);

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
    root.style.setProperty('--theme-header', darkMode ? '#0b1220' : theme.header);
    root.style.setProperty('--theme-menu', theme.menu);
    root.style.setProperty('--theme-card', darkMode ? '#0b1220' : theme.card);
    root.style.setProperty('--theme-button', theme.button);
  }, [theme, darkMode]);

  useEffect(() => {
    window.localStorage.setItem(THEME_STORAGE_KEY, darkMode ? 'dark' : 'light');
  }, [darkMode]);

  useEffect(() => {
    if (!selectedDocId) {
      setDocDetails(null);
      return;
    }
    const endpoint = activeUser?.role === 'USER' && activeUserId
      ? `/documents/${selectedDocId}?userId=${activeUserId}&userRole=${activeUser.role}`
      : `/documents/${selectedDocId}`;
    apiRequest<DocumentDetails>(endpoint).then((data) => setDocDetails(data as DocumentDetails));
  }, [selectedDocId, activeUserId, activeUser?.role]);

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
    return ['Dashboard', 'My Documents', 'History', 'Signatures'];
  }, [activeUser]);
  const greetingName = useMemo(() => {
    if (!activeUser?.full_name) return 'there';
    return activeUser.full_name.split(' ')[0] || activeUser.full_name;
  }, [activeUser?.full_name]);

  const greetingUserType = useMemo(() => {
    return (activeUser?.user_type_name ?? '').trim();
  }, [activeUser?.user_type_name]);

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
    setSignatureModalOpen(true);
  };

  const confirmAcknowledgeWithSignature = async (signature: {
    imageDataUrl: string;
    signedName: string;
    signedAt: string;
  }) => {
    if (!selectedDocId || !activeUser) return;
    setSavingSignature(true);
    try {
      await apiRequest(`/documents/${selectedDocId}/acknowledge`, {
        method: 'POST',
        body: JSON.stringify({
          userId: activeUser.id,
          comment: 'Acknowledged from DocRecord UI',
          signature,
        }),
      });
      await refreshDashboard(activeUser.id);
      const detail = await apiRequest<DocumentDetails>(`/documents/${selectedDocId}`);
      setDocDetails(detail ?? null);
      setNotice('Acknowledgment recorded.');
      setSignatureModalOpen(false);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Acknowledge failed');
    } finally {
      setSavingSignature(false);
    }
  };

  const saveDisclaimer = async () => {
    setSavingDisclaimer(true);
    try {
      const response = await apiRequest<{ text: string; updated_at: string | null }>('/settings/disclaimer', {
        method: 'PUT',
        body: JSON.stringify({ text: disclaimerDraft }),
      });
      if (response) {
        setDisclaimerText(response.text ?? '');
        setDisclaimerDraft(response.text ?? '');
        setDisclaimerUpdatedAt(response.updated_at ?? null);
      }
      updateNotice('Disclaimer updated');
    } catch (error) {
      updateNotice(error instanceof Error ? error.message : 'Unable to save disclaimer');
    } finally {
      setSavingDisclaimer(false);
    }
  };

  const seedTestData = async () => {
    if (!activeUser || activeUser.role !== 'ADMINISTRATOR') return;
    setSeedingTestData(true);
    try {
      const response = await apiRequest<{ seeded: boolean; message: string }>('/settings/seed-data', {
        method: 'POST',
        body: JSON.stringify({ actorUserId: activeUser.id }),
      });
      await refreshAll();
      updateNotice(response?.message ?? 'Seed request completed.');
    } catch (error) {
      updateNotice(error instanceof Error ? error.message : 'Unable to seed test data');
    } finally {
      setSeedingTestData(false);
    }
  };

  const addTestUser = async () => {
    if (!activeUser || activeUser.role !== 'ADMINISTRATOR') return;
    setAddingTestUser(true);
    try {
      const response = await apiRequest<{ success: boolean; userId: number; message: string }>(  '/settings/add-user',
        {
          method: 'POST',
          body: JSON.stringify({ actorUserId: activeUser.id }),
        }
      );
      await refreshAll();
      updateNotice(response?.message ?? 'Test user added.');
    } catch (error) {
      updateNotice(error instanceof Error ? error.message : 'Unable to add test user');
    } finally {
      setAddingTestUser(false);
    }
  };

  const addTestDocument = async () => {
    if (!activeUser || activeUser.role !== 'ADMINISTRATOR') return;
    setAddingTestDocument(true);
    try {
      const response = await apiRequest<{ success: boolean; documentId: number; message: string }>(
        '/settings/add-document',
        {
          method: 'POST',
          body: JSON.stringify({ actorUserId: activeUser.id }),
        }
      );
      await refreshAll();
      updateNotice(response?.message ?? 'Test document added.');
    } catch (error) {
      updateNotice(error instanceof Error ? error.message : 'Unable to add test document');
    } finally {
      setAddingTestDocument(false);
    }
  };

  const createUserSignature = async (payload: { name: string; imageDataUrl: string }) => {
    if (!activeUser || activeUser.role !== 'USER') return;
    setSavingUserSignature(true);
    try {
      await apiRequest('/signatures', {
        method: 'POST',
        body: JSON.stringify({
          actorUserId: activeUser.id,
          userId: activeUser.id,
          name: payload.name,
          signatureData: payload.imageDataUrl,
        }),
      });
      await refreshUserSignatures(activeUser.id);
      updateNotice('Signature saved');
    } catch (error) {
      updateNotice(error instanceof Error ? error.message : 'Unable to save signature');
    } finally {
      setSavingUserSignature(false);
    }
  };

  const deleteUserSignature = async (signatureId: number) => {
    if (!activeUser || activeUser.role !== 'USER') return;
    setDeletingUserSignatureId(signatureId);
    try {
      await apiRequest(`/signatures/${signatureId}`, {
        method: 'DELETE',
        body: JSON.stringify({ actorUserId: activeUser.id }),
      });
      await refreshUserSignatures(activeUser.id);
      updateNotice('Signature deleted');
    } catch (error) {
      updateNotice(error instanceof Error ? error.message : 'Unable to delete signature');
    } finally {
      setDeletingUserSignatureId(null);
    }
  };

  const setDefaultUserSignature = async (signatureId: number) => {
    if (!activeUser || activeUser.role !== 'USER') return;
    setSettingDefaultUserSignatureId(signatureId);
    try {
      await apiRequest(`/signatures/${signatureId}/default`, {
        method: 'PUT',
        body: JSON.stringify({ actorUserId: activeUser.id }),
      });
      await refreshUserSignatures(activeUser.id);
      updateNotice('Default signature updated');
    } catch (error) {
      updateNotice(error instanceof Error ? error.message : 'Unable to set default signature');
    } finally {
      setSettingDefaultUserSignatureId(null);
    }
  };

  const createTeamDocument = async () => {
    if (!activeUser) return;
    await withAction(async () => {
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
      setIsMyTeamDocPanelOpen(false);
    }, 'Team document created');
  };

  const createDocument = async () => {
    if (!activeUser) return;
    await withAction(async () => {
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
      await Promise.all([
        fetchLookups(),
        refreshAdminData(),
        activeUserId ? refreshDashboard(activeUserId) : Promise.resolve(),
      ]);
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
      setIsDocumentPanelOpen(false);
    }, 'Document created');
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
  const isReportsPage = activeUser?.role !== 'USER' && activePage === 'Reports';
  const isMyTeamDocsPage = activeUser?.role === 'TEAM_MANAGER' && activePage === 'My Team Docs';
  const isUserMyDocumentsPage = activeUser?.role === 'USER' && activePage === 'My Documents';
  const isUserHistoryPage = activeUser?.role === 'USER' && activePage === 'History';
  const isUserSignaturesPage = activeUser?.role === 'USER' && activePage === 'Signatures';
  const myCompletedDocuments = useMemo(
    () => documents.filter((doc) => doc.status === 'COMPLETED'),
    [documents]
  );
  const teamManagerUsers = useMemo(
    () => users.filter((user) => user.role === 'TEAM_MANAGER'),
    [users]
  );
  const documentsByUserTypeId = useMemo(() => {
    const docsById = new Map(documents.map((doc) => [doc.id, doc]));
    const relatedMap = new Map<number, DocumentItem[]>();

    documentUserTypeLinks.forEach((link) => {
      const doc = docsById.get(link.document_id);
      if (!doc) return;
      const existing = relatedMap.get(link.user_type_id) ?? [];
      if (!existing.some((item) => item.id === doc.id)) {
        relatedMap.set(link.user_type_id, [...existing, doc]);
      }
    });

    return relatedMap;
  }, [documents, documentUserTypeLinks]);

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
        await refreshDashboard(activeUser.id);
      }
      if (activeUser?.role === 'ADMINISTRATOR') {
        await Promise.all([
          fetchLookups(),
          refreshAdminData(),
          activeUserId ? refreshDashboard(activeUserId) : Promise.resolve(),
        ]);
      }
      if (activeUser?.role === 'USER' && activeUserId) {
        await refreshDashboard(activeUserId);
      }
    }, 'Entity updated');

    setEditPanel(null);
  };

  const updateEditPanelPayload = (patch: Record<string, unknown>) => {
    setEditPanel((prev) => (prev ? { ...prev, payload: { ...prev.payload, ...patch } } : prev));
  };

  const handleSelectLogin = (userId: number) => {
    setActiveUserId(userId);
    setActivePage('Dashboard');
    setSearch('');
    setSettingsOpen(false);
    setSelectedDocId(null);
    setAuthNotice('');
  };

  const handleSelectPage = (page: string) => {
    setActivePage(page);
    // Close menu on mobile after selecting a page
    const mediaQuery = window.matchMedia('(max-width: 767px)');
    if (mediaQuery.matches) {
      setSidebarCollapsed(true);
    }
  };

  const handleRegister = async () => {
    if (!registerForm.fullName.trim() || !registerForm.email.trim()) {
      setAuthNotice('Full name and email are required.');
      return;
    }
    if (!registerForm.schoolId || !registerForm.userTypeId) {
      setAuthNotice('Please select both school and user type.');
      return;
    }

    setRegistering(true);
    try {
      const createdUser = await apiRequest<LookupUser>('/register', {
        method: 'POST',
        body: JSON.stringify({
          fullName: registerForm.fullName,
          email: registerForm.email,
          schoolId: Number(registerForm.schoolId),
          userTypeId: Number(registerForm.userTypeId),
        }),
      });

      await fetchLookups();
      if (createdUser?.id) {
        handleSelectLogin(createdUser.id);
      }

      setRegisterForm({ fullName: '', email: '', schoolId: '', userTypeId: '' });
      setAuthNotice('Registration successful. You are now signed in.');
    } catch (error) {
      setAuthNotice(error instanceof Error ? error.message : 'Unable to register right now.');
    } finally {
      setRegistering(false);
    }
  };

  if (lookupsLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 text-sm text-slate-600">
        Loading DocRecord...
      </div>
    );
  }

  if (!activeUserId || !activeUser) {
    return (
      <div className="min-h-screen bg-[radial-gradient(circle_at_top,#e2ebf6_0%,#f1f5f9_38%,#f8fafc_100%)] p-4 md:p-8">
        <div className="mx-auto grid min-h-[calc(100vh-2rem)] w-full max-w-6xl overflow-hidden rounded-[6px] border border-slate-200 bg-white shadow-xl md:grid-cols-2">
          <aside className="relative overflow-hidden bg-[linear-gradient(150deg,#002a4d_0%,#004a7c_55%,#0a3558_100%)] p-8 text-white md:p-10">
            <div className="absolute -right-12 -top-12 h-48 w-48 rounded-full bg-cyan-300/20 blur-2xl" />
            <div className="absolute -bottom-14 -left-14 h-56 w-56 rounded-full bg-blue-900/40 blur-2xl" />
            <div className="relative z-10 flex h-full flex-col">
              <div className="mb-8 inline-flex h-10 w-10 items-center justify-center rounded-[3px] bg-sky-500/80 text-sm font-bold">
                DR
              </div>
              <p className="mb-5 text-xs uppercase tracking-[0.28em] text-slate-200/80">Enterprise Staff Support</p>
              <h1 className="max-w-sm text-4xl font-bold leading-tight md:text-5xl">Sign in to DocRecord</h1>
              <p className="mt-6 max-w-md text-base leading-relaxed text-slate-200/90">
                Choose an existing user profile or register a new account to enter the document workspace.
              </p>
              <div className="mt-auto grid gap-3 pt-8 sm:grid-cols-3">
                <div className="border border-white/15 bg-white/10 p-3">
                  <p className="font-mono text-3xl font-bold">{lookups.teams.length}</p>
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-200/80">Teams</p>
                </div>
                <div className="border border-white/15 bg-white/10 p-3">
                  <p className="font-mono text-3xl font-bold">{lookups.userTypes.length}</p>
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-200/80">User Types</p>
                </div>
                <div className="border border-white/15 bg-white/10 p-3">
                  <p className="font-mono text-3xl font-bold">{lookups.users.length}</p>
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-200/80">Active Users</p>
                </div>
              </div>
            </div>
          </aside>

          <section className="bg-slate-50 p-6 md:p-10">
            <div className="space-y-6">
              <header>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Authentication</p>
                <h2 className="mt-2 text-3xl font-bold text-slate-900">Select Existing User</h2>
                <p className="mt-2 max-w-lg text-sm text-slate-600">
                  Pick a profile to continue, or create a new user account below.
                </p>
              </header>

              {authNotice && (
                <div className="rounded-[3px] border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
                  {authNotice}
                </div>
              )}

              <div className="space-y-2 rounded-[3px] border border-slate-200 bg-white p-3">
                {lookups.users.length ? (
                  <>
                    <select
                      value={splashSelectedUserId}
                      onChange={(e) => setSplashSelectedUserId(e.target.value)}
                      className="w-full border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
                    >
                      {lookups.users.map((user) => (
                        <option key={user.id} value={user.id}>
                          {user.full_name} ({user.role.replace('_', ' ')})
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => handleSelectLogin(Number(splashSelectedUserId))}
                      disabled={!splashSelectedUserId}
                      className="w-full border border-slate-900 bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Sign In as Selected User
                    </button>
                  </>
                ) : (
                  <p className="text-sm text-slate-500">
                    {lookupsError || 'No users found yet. Register your first account below.'}
                  </p>
                )}
              </div>

              <div className="pt-2">
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Register New Account</p>
                <div className="space-y-2 rounded-[3px] border border-slate-200 bg-white p-3">
                  <input
                    value={registerForm.fullName}
                    onChange={(e) => setRegisterForm((prev) => ({ ...prev, fullName: e.target.value }))}
                    placeholder="Full name"
                    className="w-full border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
                  />
                  <input
                    value={registerForm.email}
                    onChange={(e) => setRegisterForm((prev) => ({ ...prev, email: e.target.value }))}
                    placeholder="Work email"
                    className="w-full border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
                  />
                  <select
                    value={registerForm.schoolId}
                    onChange={(e) => setRegisterForm((prev) => ({ ...prev, schoolId: e.target.value }))}
                    className="w-full border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
                  >
                    <option value="">Select school</option>
                    {lookups.schools.map((school) => (
                      <option key={school.id} value={school.id}>
                        {school.name}
                      </option>
                    ))}
                  </select>
                  <select
                    value={registerForm.userTypeId}
                    onChange={(e) => setRegisterForm((prev) => ({ ...prev, userTypeId: e.target.value }))}
                    className="w-full border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
                  >
                    <option value="">Select user type</option>
                    {lookups.userTypes.map((userType) => (
                      <option key={userType.id} value={userType.id}>
                        {userType.name}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={handleRegister}
                    disabled={registering || Boolean(lookupsError)}
                    className="w-full border border-blue-600 bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {registering ? 'Registering...' : 'Register & Sign In'}
                  </button>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--theme-app)] text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <div className="flex min-h-screen">
        <SidebarNav
          nav={nav}
          activePage={activePage}
          sidebarCollapsed={sidebarCollapsed}
          onSelectPage={handleSelectPage}
          onToggleSidebar={() => setSidebarCollapsed((v) => !v)}
        />

        <main className="relative flex-1">
          <header className="sticky top-0 z-50 border-b border-slate-300 bg-[var(--theme-header)] text-white">
            <div className="flex h-14 items-center gap-3 px-4">
              <button
                onClick={() => setSidebarCollapsed((v) => !v)}
                className="rounded-[3px] border border-white/30 p-2 hover:bg-white/15"
                title={sidebarCollapsed ? 'Expand menu' : 'Collapse menu'}
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
                <div className="hidden rounded-[3px] border border-white/30 bg-white/10 px-2 py-1 text-xs md:block">
                  {activeUser.full_name} ({activeUser.role})
                </div>
                <button
                  onClick={() => setActiveUserId(null)}
                  className="rounded-[3px] border border-white/30 p-2 hover:bg-white/15"
                  title="Switch user"
                >
                  <LogOut size={16} />
                </button>
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
              <div className="space-y-3 rounded-[3px] border border-slate-300 bg-[var(--theme-card)] p-3 text-xs dark:border-slate-700">
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase text-slate-500">Theme</p>
                  <div className="grid grid-cols-2 gap-2">
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
                </div>

                <div className="border-t border-slate-200 pt-3 dark:border-slate-700">
                  <p className="mb-1 text-xs font-semibold uppercase text-slate-500">Acknowledgment Disclaimer</p>
                  <p className="mb-2 text-xs text-slate-500">
                    This text appears in the signature dialog when users acknowledge a document.
                  </p>
                  <textarea
                    value={disclaimerDraft}
                    onChange={(e) => setDisclaimerDraft(e.target.value)}
                    rows={4}
                    className="w-full border border-slate-300 px-2 py-2 text-xs dark:border-slate-700"
                  />
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <p className="text-[11px] text-slate-500">
                      {disclaimerUpdatedAt
                        ? `Last updated ${new Date(disclaimerUpdatedAt).toLocaleString()}`
                        : 'No disclaimer update recorded yet.'}
                    </p>
                    <button
                      onClick={saveDisclaimer}
                      disabled={savingDisclaimer || disclaimerDraft === disclaimerText}
                      className="border border-blue-400 bg-blue-600 px-2 py-1 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {savingDisclaimer ? 'Saving...' : 'Save Disclaimer'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {isReportsPage ? (
              <ReportsPanel activeUser={activeUser} />
            ) : isAdminPage ? (
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
                          {teamManagerUsers.map((u) => (
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
                        <div key={item.id} className="border border-slate-200 p-2 text-sm dark:border-slate-700">
                          <div className="flex items-center justify-between gap-2">
                            <span>{item.name}</span>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() =>
                                  setExpandedUserTypeIds((prev) =>
                                    prev.includes(item.id)
                                      ? prev.filter((id) => id !== item.id)
                                      : [...prev, item.id]
                                  )
                                }
                                className="border border-slate-300 px-2 py-1 text-xs"
                              >
                                {expandedUserTypeIds.includes(item.id) ? 'Hide Docs' : 'Show Docs'} (
                                {documentsByUserTypeId.get(item.id)?.length ?? 0})
                              </button>
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

                          {expandedUserTypeIds.includes(item.id) && (
                            <div className="mt-2 space-y-2 border-t border-slate-200 pt-2 dark:border-slate-700">
                              {(documentsByUserTypeId.get(item.id) ?? []).length ? (
                                (documentsByUserTypeId.get(item.id) ?? []).map((doc) => (
                                  <div
                                    key={`${item.id}-${doc.id}`}
                                    className="rounded-[3px] border border-slate-200 bg-slate-50 p-2 dark:border-slate-700 dark:bg-slate-900"
                                  >
                                    <p className="font-semibold">{doc.title}</p>
                                    <p className="text-xs text-slate-500">
                                      {doc.team_name} • {doc.schedule} • {doc.user_types}
                                    </p>
                                  </div>
                                ))
                              ) : (
                                <p className="text-xs text-slate-500">No related documents for this user type.</p>
                              )}
                            </div>
                          )}
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
                        onClick={() => {
                          setSelectedDocId(null);
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
                          setIsDocumentPanelOpen(true);
                        }}
                        className="border border-blue-300 bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-800"
                      >
                        +New
                      </button>
                    </div>

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

                {activePage === 'Settings' && (
                  <section className="space-y-4 rounded-[3px] border border-slate-200 bg-[var(--theme-card)] p-4 dark:border-slate-700">
                    <div>
                      <h3 className="text-sm font-semibold uppercase">Settings</h3>
                      <p className="mt-1 text-xs text-slate-500">
                        Admin controls for test deployments and acknowledgment text.
                      </p>
                    </div>

                    {/* Seed Test Data */}
                    <div className="rounded-[3px] border border-slate-200 dark:border-slate-700">
                      <button
                        onClick={() => toggleSettingSection('seedTestData')}
                        className="flex w-full items-center justify-between px-3 py-2 text-xs font-semibold uppercase text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800"
                      >
                        Seed Test Data
                        {openSettingSections.seedTestData ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </button>
                      {openSettingSections.seedTestData && (
                        <div className="border-t border-slate-200 p-3 dark:border-slate-700">
                          <p className="mb-2 text-xs text-slate-500">
                            Runs once only when the database is empty. Safe for new test environments.
                          </p>
                          <button
                            onClick={seedTestData}
                            disabled={seedingTestData}
                            className="border border-blue-400 bg-blue-600 px-2 py-1 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {seedingTestData ? 'Seeding...' : 'Seed Test Data'}
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Add Test Data */}
                    <div className="rounded-[3px] border border-slate-200 dark:border-slate-700">
                      <button
                        onClick={() => toggleSettingSection('addTestData')}
                        className="flex w-full items-center justify-between px-3 py-2 text-xs font-semibold uppercase text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800"
                      >
                        Add Test Data
                        {openSettingSections.addTestData ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </button>
                      {openSettingSections.addTestData && (
                        <div className="border-t border-slate-200 p-3 dark:border-slate-700">
                          <p className="mb-2 text-xs text-slate-500">Add individual test users or documents at any time.</p>
                          <div className="flex gap-2">
                            <button
                              onClick={addTestUser}
                              disabled={addingTestUser}
                              className="flex-1 border border-amber-400 bg-amber-600 px-2 py-1 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {addingTestUser ? 'Adding...' : '+ Add User'}
                            </button>
                            <button
                              onClick={addTestDocument}
                              disabled={addingTestDocument}
                              className="flex-1 border border-emerald-400 bg-emerald-600 px-2 py-1 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {addingTestDocument ? 'Adding...' : '+ Add Document'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Acknowledgment Disclaimer */}
                    <div className="rounded-[3px] border border-slate-200 dark:border-slate-700">
                      <button
                        onClick={() => toggleSettingSection('disclaimer')}
                        className="flex w-full items-center justify-between px-3 py-2 text-xs font-semibold uppercase text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800"
                      >
                        Acknowledgment Disclaimer
                        {openSettingSections.disclaimer ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </button>
                      {openSettingSections.disclaimer && (
                        <div className="border-t border-slate-200 p-3 dark:border-slate-700">
                          <p className="mb-2 text-xs text-slate-500">
                            This text appears in the signature dialog when users acknowledge a document.
                          </p>
                          <textarea
                            value={disclaimerDraft}
                            onChange={(e) => setDisclaimerDraft(e.target.value)}
                            rows={4}
                            className="w-full border border-slate-300 px-2 py-2 text-xs dark:border-slate-700"
                          />
                          <div className="mt-2 flex items-center justify-between gap-2">
                            <p className="text-[11px] text-slate-500">
                              {disclaimerUpdatedAt
                                ? `Last updated ${new Date(disclaimerUpdatedAt).toLocaleString()}`
                                : 'No disclaimer update recorded yet.'}
                            </p>
                            <button
                              onClick={saveDisclaimer}
                              disabled={savingDisclaimer || disclaimerDraft === disclaimerText}
                              className="border border-blue-400 bg-blue-600 px-2 py-1 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {savingDisclaimer ? 'Saving...' : 'Save Disclaimer'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </section>
                )}
              </>
            ) : isUserMyDocumentsPage ? (
              <section className="-mx-4 w-[calc(100%+2rem)] border-y border-slate-200 bg-[var(--theme-card)] p-4 sm:mx-0 sm:w-auto sm:rounded-[3px] sm:border dark:border-slate-700">
                <h3 className="mb-2 text-sm font-semibold uppercase">My Documents</h3>
                <p className="mb-3 text-xs text-slate-500">Documents currently assigned to your user type.</p>
                <div className="space-y-2">
                  {filteredDocuments.length ? (
                    filteredDocuments.map((doc) => (
                      <button
                        key={doc.id}
                        onClick={() => setSelectedDocId(doc.id)}
                        className="w-full rounded-[3px] border border-slate-200 bg-white p-4 text-left hover:border-slate-400 dark:border-slate-700 dark:bg-slate-900"
                      >
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                          <div>
                            <p className="text-sm font-semibold leading-snug sm:text-base">{doc.title}</p>
                            <p className="mt-1 text-xs text-slate-500">{doc.team_name} • {doc.schedule} • {doc.user_types}</p>
                          </div>
                          <span className={`inline-flex w-fit rounded-[3px] px-2 py-1 text-xs font-semibold ${badgeClass(doc.status)}`}>
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
            ) : isUserSignaturesPage ? (
              <UserSignaturesPanel
                signatures={userSignatures}
                loading={loadingUserSignatures}
                saving={savingUserSignature}
                deletingSignatureId={deletingUserSignatureId}
                settingDefaultSignatureId={settingDefaultUserSignatureId}
                onCreate={createUserSignature}
                onDelete={deleteUserSignature}
                onSetDefault={setDefaultUserSignature}
              />
            ) : isMyTeamDocsPage ? (
              <section className="rounded-[3px] border border-slate-200 bg-[var(--theme-card)] p-4 dark:border-slate-700">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-semibold uppercase">My Team Docs</h3>
                  <button
                    onClick={() => {
                      setSelectedDocId(null);
                      setTeamDocForm((p) => ({
                        ...p,
                        teamId: p.teamId || String(teams[0]?.id ?? ''),
                      }));
                      setIsMyTeamDocPanelOpen(true);
                    }}
                    className="border border-blue-300 bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-800"
                  >
                    +New
                  </button>
                </div>
                <p className="mb-3 text-xs text-slate-500">Manage documents assigned to your team(s). You can add new documents or edit existing ones.</p>

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
                {activeUser.role === 'USER' && (
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
                )}

                <section className={`grid grid-cols-1 gap-4 ${activeUser.role !== 'USER' ? 'xl:grid-cols-3' : ''}`}>
                  {activeUser.role !== 'USER' && (
                    <div className="xl:col-span-2">
                      <ComplianceChart compliance={dashboard.compliance} trend={dashboard.trend} />
                    </div>
                  )}
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

                <section className="rounded-[3px] border border-slate-200 bg-[var(--theme-card)] p-4 dark:border-slate-700">
                  <div className="space-y-2">
                    {filteredDocuments.map((doc) => (
                      <button
                        key={doc.id}
                        onClick={() => setSelectedDocId(doc.id)}
                        className="w-full rounded-[3px] border border-slate-200 bg-white p-4 text-left hover:border-slate-400 dark:border-slate-700 dark:bg-slate-900"
                      >
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                          <div>
                            <p className="text-sm font-semibold leading-snug sm:text-base">{doc.title}</p>
                            <p className="mt-1 text-xs text-slate-500">{doc.team_name} • {doc.schedule} • {doc.user_types}</p>
                          </div>
                          <span className={`inline-flex w-fit rounded-[3px] px-2 py-1 text-xs font-semibold ${badgeClass(doc.status)}`}>
                            {doc.status}
                          </span>
                        </div>
                        <p className="mt-2 text-xs text-slate-500">{formatDueText(doc.due_date)}</p>
                      </button>
                    ))}
                  </div>
                </section>
              </>
            )}
          </div>
        </main>
      </div>

      <AnimatePresence>
        {isMyTeamDocPanelOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMyTeamDocPanelOpen(false)}
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
                <h3 className="text-lg font-semibold">New Team Document</h3>
                <button
                  onClick={() => setIsMyTeamDocPanelOpen(false)}
                  className="text-sm text-slate-500 hover:text-slate-800"
                >
                  Close
                </button>
              </div>

              <div className="space-y-3 text-sm">
                <label className="block">
                  <span className="mb-1 block text-xs uppercase text-slate-500">Team</span>
                  <select
                    value={teamDocForm.teamId}
                    onChange={(e) => setTeamDocForm((p) => ({ ...p, teamId: e.target.value }))}
                    className="w-full border border-slate-300 px-2 py-2 dark:border-slate-700"
                  >
                    <option value="">Select team</option>
                    {teams.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="mb-1 block text-xs uppercase text-slate-500">Title</span>
                  <input
                    value={teamDocForm.title}
                    onChange={(e) => setTeamDocForm((p) => ({ ...p, title: e.target.value }))}
                    className="w-full border border-slate-300 px-2 py-2 dark:border-slate-700"
                    placeholder="Document title"
                  />
                </label>

                <label className="block">
                  <span className="mb-1 block text-xs uppercase text-slate-500">Description</span>
                  <textarea
                    value={teamDocForm.description}
                    onChange={(e) => setTeamDocForm((p) => ({ ...p, description: e.target.value }))}
                    className="w-full border border-slate-300 px-2 py-2 dark:border-slate-700"
                    rows={3}
                    placeholder="Short description"
                  />
                </label>

                <label className="block">
                  <span className="mb-1 block text-xs uppercase text-slate-500">Document URL</span>
                  <input
                    value={teamDocForm.fileUrl}
                    onChange={(e) => setTeamDocForm((p) => ({ ...p, fileUrl: e.target.value }))}
                    className="w-full border border-slate-300 px-2 py-2 dark:border-slate-700"
                    placeholder="https://..."
                  />
                </label>

                <label className="block">
                  <span className="mb-1 block text-xs uppercase text-slate-500">Content</span>
                  <input
                    value={teamDocForm.content}
                    onChange={(e) => setTeamDocForm((p) => ({ ...p, content: e.target.value }))}
                    className="w-full border border-slate-300 px-2 py-2 dark:border-slate-700"
                    placeholder="Optional inline content"
                  />
                </label>

                <div className="grid grid-cols-3 gap-2">
                  <label className="block">
                    <span className="mb-1 block text-xs uppercase text-slate-500">Schedule</span>
                    <select
                      value={teamDocForm.schedule}
                      onChange={(e) =>
                        setTeamDocForm((p) => ({ ...p, schedule: e.target.value as 'MONTHLY' | 'QUARTERLY' | 'YEARLY' }))
                      }
                      className="w-full border border-slate-300 px-2 py-2 dark:border-slate-700"
                    >
                      <option value="MONTHLY">MONTHLY</option>
                      <option value="QUARTERLY">QUARTERLY</option>
                      <option value="YEARLY">YEARLY</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs uppercase text-slate-500">Due Date</span>
                    <input
                      type="date"
                      value={teamDocForm.dueDate}
                      onChange={(e) => setTeamDocForm((p) => ({ ...p, dueDate: e.target.value }))}
                      className="w-full border border-slate-300 px-2 py-2 dark:border-slate-700"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs uppercase text-slate-500">End Date</span>
                    <input
                      type="date"
                      value={teamDocForm.endDate}
                      onChange={(e) => setTeamDocForm((p) => ({ ...p, endDate: e.target.value }))}
                      className="w-full border border-slate-300 px-2 py-2 dark:border-slate-700"
                    />
                  </label>
                </div>

                <label className="block">
                  <span className="mb-1 block text-xs uppercase text-slate-500">User Types</span>
                  <select
                    multiple
                    value={teamDocForm.userTypeIds.map(String)}
                    onChange={(e) =>
                      setTeamDocForm((p) => ({
                        ...p,
                        userTypeIds: Array.from(e.target.selectedOptions).map((opt) => Number(opt.value)),
                      }))
                    }
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

                <div className="flex gap-2 pt-2">
                  <button
                    onClick={() => {
                      createTeamDocument().catch((error) =>
                        updateNotice(error instanceof Error ? error.message : 'Unable to create document')
                      );
                    }}
                    className="rounded-[3px] border border-blue-400 bg-blue-600 px-3 py-2 text-xs font-semibold text-white"
                  >
                    Add Team Document
                  </button>
                  <button
                    onClick={() => setIsMyTeamDocPanelOpen(false)}
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
        {isDocumentPanelOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsDocumentPanelOpen(false)}
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
                <h3 className="text-lg font-semibold">New Document</h3>
                <button
                  onClick={() => setIsDocumentPanelOpen(false)}
                  className="text-sm text-slate-500 hover:text-slate-800"
                >
                  Close
                </button>
              </div>

              <div className="space-y-3 text-sm">
                <label className="block">
                  <span className="mb-1 block text-xs uppercase text-slate-500">Team</span>
                  <select
                    value={docForm.teamId}
                    onChange={(e) => setDocForm((p) => ({ ...p, teamId: e.target.value }))}
                    className="w-full border border-slate-300 px-2 py-2 dark:border-slate-700"
                  >
                    <option value="">Select team</option>
                    {teams.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="mb-1 block text-xs uppercase text-slate-500">Title</span>
                  <input
                    value={docForm.title}
                    onChange={(e) => setDocForm((p) => ({ ...p, title: e.target.value }))}
                    className="w-full border border-slate-300 px-2 py-2 dark:border-slate-700"
                    placeholder="Document title"
                  />
                </label>

                <label className="block">
                  <span className="mb-1 block text-xs uppercase text-slate-500">Description</span>
                  <textarea
                    value={docForm.description}
                    onChange={(e) => setDocForm((p) => ({ ...p, description: e.target.value }))}
                    className="w-full border border-slate-300 px-2 py-2 dark:border-slate-700"
                    rows={3}
                    placeholder="Short description"
                  />
                </label>

                <label className="block">
                  <span className="mb-1 block text-xs uppercase text-slate-500">Document URL</span>
                  <input
                    value={docForm.fileUrl}
                    onChange={(e) => setDocForm((p) => ({ ...p, fileUrl: e.target.value }))}
                    className="w-full border border-slate-300 px-2 py-2 dark:border-slate-700"
                    placeholder="https://..."
                  />
                </label>

                <label className="block">
                  <span className="mb-1 block text-xs uppercase text-slate-500">Content</span>
                  <input
                    value={docForm.content}
                    onChange={(e) => setDocForm((p) => ({ ...p, content: e.target.value }))}
                    className="w-full border border-slate-300 px-2 py-2 dark:border-slate-700"
                    placeholder="Optional inline content"
                  />
                </label>

                <div className="grid grid-cols-3 gap-2">
                  <label className="block">
                    <span className="mb-1 block text-xs uppercase text-slate-500">Schedule</span>
                    <select
                      value={docForm.schedule}
                      onChange={(e) =>
                        setDocForm((p) => ({ ...p, schedule: e.target.value as 'MONTHLY' | 'QUARTERLY' | 'YEARLY' }))
                      }
                      className="w-full border border-slate-300 px-2 py-2 dark:border-slate-700"
                    >
                      <option value="MONTHLY">MONTHLY</option>
                      <option value="QUARTERLY">QUARTERLY</option>
                      <option value="YEARLY">YEARLY</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs uppercase text-slate-500">Due Date</span>
                    <input
                      type="date"
                      value={docForm.dueDate}
                      onChange={(e) => setDocForm((p) => ({ ...p, dueDate: e.target.value }))}
                      className="w-full border border-slate-300 px-2 py-2 dark:border-slate-700"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs uppercase text-slate-500">End Date</span>
                    <input
                      type="date"
                      value={docForm.endDate}
                      onChange={(e) => setDocForm((p) => ({ ...p, endDate: e.target.value }))}
                      className="w-full border border-slate-300 px-2 py-2 dark:border-slate-700"
                    />
                  </label>
                </div>

                <label className="block">
                  <span className="mb-1 block text-xs uppercase text-slate-500">User Types</span>
                  <select
                    multiple
                    value={docForm.userTypeIds.map(String)}
                    onChange={(e) =>
                      setDocForm((p) => ({
                        ...p,
                        userTypeIds: Array.from(e.target.selectedOptions).map((opt) => Number(opt.value)),
                      }))
                    }
                    className="h-28 w-full border border-slate-300 px-2 py-2 dark:border-slate-700"
                  >
                    {userTypes.map((ut) => (
                      <option key={ut.id} value={ut.id}>
                        {ut.name}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-slate-500">Hold Ctrl/Cmd to select multiple user types.</p>
                </label>

                <div className="flex gap-2 pt-2">
                  <button
                    onClick={() => {
                      createDocument().catch((error) =>
                        updateNotice(error instanceof Error ? error.message : 'Unable to create document')
                      );
                    }}
                    className="rounded-[3px] border border-blue-400 bg-blue-600 px-3 py-2 text-xs font-semibold text-white"
                  >
                    Create Document
                  </button>
                  <button
                    onClick={() => setIsDocumentPanelOpen(false)}
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

      <EditPanel
        editPanel={editPanel}
        users={teamManagerUsers}
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
        activeUserRole={activeUser?.role ?? null}
        activeUserId={activeUserId}
        canAcknowledge={
          activeUser?.role === 'USER' &&
          !docDetails?.acknowledgments.some((a) => a.user_id === activeUserId)
        }
        onTogglePinned={() => setPanelPinned((value) => !value)}
        onClose={() => setSelectedDocId(null)}
        onPanelWidthChange={setPanelWidth}
        onTabChange={setActiveDetailTab}
        onAcknowledge={handleAcknowledge}
      />

      <SignatureModal
        isOpen={signatureModalOpen}
        userName={activeUser?.full_name ?? ''}
        disclaimerText={disclaimerText}
        savedSignatures={userSignatures}
        loadingSavedSignatures={loadingUserSignatures}
        saving={savingSignature}
        onClose={() => setSignatureModalOpen(false)}
        onAgree={confirmAcknowledgeWithSignature}
      />
    </div>
  );
}

export default App;
