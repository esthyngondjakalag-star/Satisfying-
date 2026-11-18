import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  LayoutDashboard,
  Ticket as TicketIcon,
  Users,
  Smile,
  GitBranch,
  UserCheck,
  Zap,
  BookOpen,
  Globe,
  FileBarChart,
  Building2,
  ShieldAlert,
  Bell,
  Search,
  Sun,
  Moon,
  LogOut,
  Menu,
  X,
} from 'lucide-react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { apiRequest } from './lib/apiClient';
import { ROLE_LABELS, WorkspaceBootstrap } from './types/workspace';
import { AuthGate } from './components/AuthGate';
import { PublicPortalView } from './components/PublicPortalView';
import { PublicSurveyRunner } from './components/PublicSurveyRunner';
import { DashboardView } from './components/views/DashboardView';
import { TicketsView } from './components/views/TicketsView';
import { CrmView } from './components/views/CrmView';
import { SatisfactionRootCauseView } from './components/views/SatisfactionRootCauseView';
import { TeamsSlaView } from './components/views/TeamsSlaView';
import { AutomationsKbView } from './components/views/AutomationsKbView';
import { ReportsOrgAdminView } from './components/views/ReportsOrgAdminView';

type NavKey =
  | 'dashboard'
  | 'tickets'
  | 'crm'
  | 'satisfaction'
  | 'root-causes'
  | 'teams-sla'
  | 'automations'
  | 'kb'
  | 'portal'
  | 'reports'
  | 'org'
  | 'super-admin';

const NAV_ITEMS: Array<{ id: NavKey; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'dashboard', label: 'Pilotage', icon: LayoutDashboard },
  { id: 'tickets', label: 'Tickets & SAV', icon: TicketIcon },
  { id: 'crm', label: 'CRM Clients', icon: Users },
  { id: 'satisfaction', label: 'Sondages & CSAT', icon: Smile },
  { id: 'root-causes', label: 'Causes Racines', icon: GitBranch },
  { id: 'teams-sla', label: 'Équipes & SLA', icon: UserCheck },
  { id: 'automations', label: 'Automatisations', icon: Zap },
  { id: 'kb', label: 'Base Connaissances', icon: BookOpen },
  { id: 'portal', label: 'Portail Client', icon: Globe },
  { id: 'reports', label: 'Rapports', icon: FileBarChart },
  { id: 'org', label: 'Organisation & Plans', icon: Building2 },
  { id: 'super-admin', label: 'Admin SaaS', icon: ShieldAlert },
];

function WorkspaceShell() {
  const { sessionUser, loading: authLoading, getToken, logout } = useAuth();
  const [darkMode, setDarkMode] = useState(false);
  const [showPublicPortalGuest, setShowPublicPortalGuest] = useState(false);

  const [activeOrgId, setActiveOrgId] = useState<number | null>(null);
  const [workspace, setWorkspace] = useState<WorkspaceBootstrap | null>(null);
  const [wsLoading, setWsLoading] = useState(false);
  const [wsError, setWsError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<NavKey>('dashboard');
  const [selectedTicketId, setSelectedTicketId] = useState<number | null>(null);
  const [globalQuery, setGlobalQuery] = useState('');
  const [showNotifications, setShowNotifications] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) root.classList.add('dark');
    else root.classList.remove('dark');
  }, [darkMode]);

  const loadWorkspace = useCallback(
    async (targetOrgId?: number | null) => {
      if (!sessionUser) return;
      setWsLoading(true);
      setWsError(null);
      try {
        const token = await getToken();
        if (!token) return;
        const data = await apiRequest<WorkspaceBootstrap>('/api/workspace/bootstrap', {
          token,
          orgId: targetOrgId ?? activeOrgId,
        });
        setWorkspace(data);
        setActiveOrgId(data.activeOrganization.id);
      } catch (err: any) {
        console.error('Load workspace error:', err);
        setWsError(err?.message || 'Erreur lors du chargement de l’espace.');
      } finally {
        setWsLoading(false);
      }
    },
    [sessionUser, getToken, activeOrgId]
  );

  useEffect(() => {
    if (sessionUser) {
      loadWorkspace();
    } else {
      setWorkspace(null);
      setActiveOrgId(null);
    }
  }, [sessionUser]);

  useEffect(() => {
    if (!sessionUser || !workspace) return;
    const params = new URLSearchParams(window.location.search);
    const stripeSessionId = params.get('stripe_session_id');
    if (!stripeSessionId) return;

    (async () => {
      try {
        const token = await getToken();
        if (!token) return;
        await apiRequest(`/api/billing/verify-session?session_id=${encodeURIComponent(stripeSessionId)}`, {
          token,
          orgId: workspace.activeOrganization.id,
        });
        const url = new URL(window.location.href);
        url.searchParams.delete('stripe_session_id');
        window.history.replaceState({}, '', url.toString());
        setActiveTab('org');
        await loadWorkspace(workspace.activeOrganization.id);
      } catch (err) {
        console.error('Stripe verify error:', err);
      }
    })();
  }, [sessionUser, workspace?.activeOrganization.id]);

  const handleSwitchOrg = async (orgId: number) => {
    setActiveOrgId(orgId);
    setSelectedTicketId(null);
    await loadWorkspace(orgId);
  };

  const handleOpenTicket = (ticketId: number) => {
    setSelectedTicketId(ticketId);
    setActiveTab('tickets');
    setGlobalQuery('');
    setShowNotifications(false);
  };

  const handleMarkNotificationRead = async (id: number, ticketId: number | null) => {
    const token = await getToken();
    if (token && workspace) {
      await apiRequest(`/api/notifications/${id}/read`, {
        method: 'POST',
        token,
        orgId: workspace.activeOrganization.id,
      });
      await loadWorkspace(workspace.activeOrganization.id);
    }
    if (ticketId) handleOpenTicket(ticketId);
  };

  const handleMarkAllRead = async () => {
    const token = await getToken();
    if (!token || !workspace) return;
    await apiRequest('/api/notifications/read-all', {
      method: 'POST',
      token,
      orgId: workspace.activeOrganization.id,
    });
    await loadWorkspace(workspace.activeOrganization.id);
  };

  const globalResults = useMemo(() => {
    const q = globalQuery.trim().toLowerCase();
    if (!q || !workspace) return { tickets: [], customers: [], articles: [] };
    return {
      tickets: workspace.tickets
        .filter((t) => `${t.ticketNumber} ${t.subject}`.toLowerCase().includes(q))
        .slice(0, 4),
      customers: workspace.customers
        .filter((c) => `${c.fullName} ${c.companyName} ${c.email}`.toLowerCase().includes(q))
        .slice(0, 3),
      articles: workspace.kbArticles
        .filter((a) => `${a.title} ${a.category}`.toLowerCase().includes(q))
        .slice(0, 3),
    };
  }, [globalQuery, workspace]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center text-sm text-slate-500">
        Initialisation de ClientPulse 360...
      </div>
    );
  }

  if (!sessionUser) {
    if (showPublicPortalGuest) {
      return (
        <PublicPortalView
          orgSlug="horizon-distribution-demo"
          onBack={() => setShowPublicPortalGuest(false)}
        />
      );
    }
    return (
      <AuthGate
        onOpenPublicPortal={() => setShowPublicPortalGuest(true)}
        darkMode={darkMode}
        onToggleDark={() => setDarkMode((d) => !d)}
      />
    );
  }

  if (!workspace && wsLoading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center text-sm text-slate-500">
        Chargement de votre espace PostgreSQL multi-tenant...
      </div>
    );
  }

  if (wsError && !workspace) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-sm text-red-600 dark:text-red-400">{wsError}</p>
        <button
          onClick={() => loadWorkspace()}
          className="px-4 py-2 text-xs font-semibold bg-blue-600 text-white rounded-lg cursor-pointer"
        >
          Réessayer
        </button>
      </div>
    );
  }

  if (!workspace) return null;

  const unreadCount = workspace.notifications.filter((n) => !n.isRead).length;
  const currentTabLabel = NAV_ITEMS.find((n) => n.id === activeTab)?.label || 'Pilotage';

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex">
      {/* Sidebar Desktop */}
      <aside
        className={`${
          mobileMenuOpen ? 'fixed inset-y-0 left-0 z-40 flex' : 'hidden lg:flex'
        } w-64 shrink-0 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex-col justify-between no-print`}
      >
        <div className="p-4 space-y-5 overflow-y-auto">
          <div className="flex items-center justify-between px-2">
            <span className="font-display text-base font-bold tracking-tight whitespace-nowrap shrink-0">
              ClientPulse 360
            </span>
            <button
              onClick={() => setMobileMenuOpen(false)}
              className="lg:hidden p-1 text-slate-500 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Organization Tenant Switcher */}
          <div className="px-1">
            <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
              Organisation active
            </label>
            <select
              value={workspace.activeOrganization.id}
              onChange={(e) => handleSwitchOrg(Number(e.target.value))}
              className="w-full px-2.5 py-2 text-xs font-medium bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg truncate"
            >
              {workspace.accessibleOrganizations.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                </option>
              ))}
            </select>
          </div>

          {/* Navigation Links */}
          <nav className="space-y-0.5">
            {NAV_ITEMS.filter((item) =>
              item.id === 'super-admin' ? workspace.currentUser.isSuperAdmin : true
            ).map((item) => {
              const Icon = item.icon;
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveTab(item.id);
                    setMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    active
                      ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 font-semibold'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* User Footer */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
          <div className="flex items-center gap-2.5">
            {workspace.currentUser.avatarUrl ? (
              <img
                src={workspace.currentUser.avatarUrl}
                alt={workspace.currentUser.fullName}
                referrerPolicy="no-referrer"
                className="w-8 h-8 rounded-full object-cover shrink-0"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-semibold shrink-0">
                {workspace.currentUser.fullName.slice(0, 2).toUpperCase()}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold truncate">{workspace.currentUser.fullName}</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                {ROLE_LABELS[workspace.currentUser.activeRole]}
              </p>
            </div>
          </div>
          <button
            onClick={logout}
            className="w-full flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 border border-slate-200 dark:border-slate-700 rounded-lg cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            Déconnexion
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar Contract */}
        <header className="h-14 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 lg:px-6 flex items-center justify-between gap-4 sticky top-0 z-30 no-print">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-1.5 text-slate-600 dark:text-slate-400 cursor-pointer"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
              <span>{workspace.activeOrganization.name}</span>
              <span className="mx-2">/</span>
              <span className="font-semibold text-slate-900 dark:text-white">{currentTabLabel}</span>
            </div>
          </div>

          {/* Global Search */}
          <div className="relative flex-1 max-w-md hidden sm:block">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
            <input
              value={globalQuery}
              onChange={(e) => setGlobalQuery(e.target.value)}
              placeholder="Recherche globale : tickets, clients, base de connaissances..."
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {globalQuery.trim() && (
              <div className="absolute left-0 right-0 top-10 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-lg p-3 space-y-2 z-50 text-xs">
                {globalResults.tickets.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => handleOpenTicket(t.id)}
                    className="w-full text-left p-2 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-between cursor-pointer"
                  >
                    <span className="truncate font-medium">{t.subject}</span>
                    <span className="font-mono text-slate-400 ml-2 shrink-0">{t.ticketNumber}</span>
                  </button>
                ))}
                {globalResults.customers.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => {
                      setActiveTab('crm');
                      setGlobalQuery('');
                    }}
                    className="w-full text-left p-2 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-between cursor-pointer"
                  >
                    <span>Client : {c.fullName}</span>
                    <span className="text-slate-400">{c.companyName}</span>
                  </button>
                ))}
                {globalResults.articles.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => {
                      setActiveTab('kb');
                      setGlobalQuery('');
                    }}
                    className="w-full text-left p-2 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-between cursor-pointer"
                  >
                    <span className="truncate">KB : {a.title}</span>
                    <span className="text-slate-400">{a.category}</span>
                  </button>
                ))}
                {globalResults.tickets.length === 0 &&
                  globalResults.customers.length === 0 &&
                  globalResults.articles.length === 0 && (
                    <p className="text-slate-500 text-center py-2">Aucun résultat.</p>
                  )}
              </div>
            )}
          </div>

          {/* Right Controls: Theme + Notifications */}
          <div className="flex items-center gap-2 shrink-0 relative">
            <button
              onClick={() => setDarkMode((d) => !d)}
              className="p-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
              title={darkMode ? 'Passer en mode clair' : 'Passer en mode sombre'}
            >
              {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            <button
              onClick={() => setShowNotifications((s) => !s)}
              className="relative p-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
              title="Centre de notifications"
            >
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 px-1 min-w-[16px] h-4 text-[10px] font-mono font-bold bg-red-600 text-white rounded-full flex items-center justify-center">
                  {unreadCount}
                </span>
              )}
            </button>

            {showNotifications && (
              <div className="absolute right-0 top-12 w-80 sm:w-96 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-lg p-4 z-50 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-display text-xs font-semibold">
                    Notifications ({unreadCount} non lues)
                  </span>
                  {unreadCount > 0 && (
                    <button
                      onClick={handleMarkAllRead}
                      className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                    >
                      Tout marquer lu
                    </button>
                  )}
                </div>
                <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-80 overflow-y-auto">
                  {workspace.notifications.slice(0, 12).map((n) => (
                    <button
                      key={n.id}
                      onClick={() => handleMarkNotificationRead(n.id, n.ticketId)}
                      className={`w-full text-left py-2.5 px-2 rounded-md transition-colors cursor-pointer ${
                        !n.isRead ? 'bg-blue-50/50 dark:bg-blue-950/20' : ''
                      }`}
                    >
                      <p className="text-xs font-semibold text-slate-900 dark:text-white">{n.title}</p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{n.message}</p>
                    </button>
                  ))}
                  {workspace.notifications.length === 0 && (
                    <p className="py-6 text-center text-xs text-slate-500">Aucune notification.</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </header>

        {/* Main Viewport */}
        <main className="flex-1 p-5 lg:p-7 max-w-[1440px] w-full mx-auto">
          {activeTab === 'dashboard' && (
            <DashboardView
              data={workspace}
              onSelectTicket={handleOpenTicket}
              onNavigate={(tab) => setActiveTab(tab as NavKey)}
            />
          )}
          {activeTab === 'tickets' && (
            <TicketsView
              data={workspace}
              selectedTicketId={selectedTicketId}
              onSelectTicket={setSelectedTicketId}
              onRefresh={() => loadWorkspace(workspace.activeOrganization.id)}
            />
          )}
          {activeTab === 'crm' && (
            <CrmView
              data={workspace}
              onRefresh={() => loadWorkspace(workspace.activeOrganization.id)}
              onSelectTicket={handleOpenTicket}
            />
          )}
          {activeTab === 'satisfaction' && (
            <SatisfactionRootCauseView
              data={workspace}
              mode="satisfaction"
              onRefresh={() => loadWorkspace(workspace.activeOrganization.id)}
              onSelectTicket={handleOpenTicket}
            />
          )}
          {activeTab === 'root-causes' && (
            <SatisfactionRootCauseView
              data={workspace}
              mode="root-causes"
              onRefresh={() => loadWorkspace(workspace.activeOrganization.id)}
              onSelectTicket={handleOpenTicket}
            />
          )}
          {activeTab === 'teams-sla' && (
            <TeamsSlaView
              data={workspace}
              onRefresh={() => loadWorkspace(workspace.activeOrganization.id)}
            />
          )}
          {activeTab === 'automations' && (
            <AutomationsKbView
              data={workspace}
              mode="automations"
              onRefresh={() => loadWorkspace(workspace.activeOrganization.id)}
            />
          )}
          {activeTab === 'kb' && (
            <AutomationsKbView
              data={workspace}
              mode="kb"
              onRefresh={() => loadWorkspace(workspace.activeOrganization.id)}
            />
          )}
          {activeTab === 'portal' && (
            <PublicPortalView orgSlug={workspace.activeOrganization.slug} embedded />
          )}
          {activeTab === 'reports' && (
            <ReportsOrgAdminView
              data={workspace}
              mode="reports"
              onRefresh={() => loadWorkspace(workspace.activeOrganization.id)}
              onSwitchOrg={handleSwitchOrg}
            />
          )}
          {activeTab === 'org' && (
            <ReportsOrgAdminView
              data={workspace}
              mode="org"
              onRefresh={() => loadWorkspace(workspace.activeOrganization.id)}
              onSwitchOrg={handleSwitchOrg}
            />
          )}
          {activeTab === 'super-admin' && (
            <ReportsOrgAdminView
              data={workspace}
              mode="super-admin"
              onRefresh={() => loadWorkspace(workspace.activeOrganization.id)}
              onSwitchOrg={handleSwitchOrg}
            />
          )}
        </main>
      </div>
    </div>
  );
}

export default function App() {
  const [surveyToken, setSurveyToken] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return new URLSearchParams(window.location.search).get('survey');
  });
  const [portalSlug, setPortalSlug] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return new URLSearchParams(window.location.search).get('portal');
  });

  if (surveyToken) {
    return (
      <PublicSurveyRunner
        token={surveyToken}
        onBack={() => {
          const url = new URL(window.location.href);
          url.searchParams.delete('survey');
          window.history.replaceState({}, '', url.toString());
          setSurveyToken(null);
        }}
      />
    );
  }

  if (portalSlug) {
    return (
      <PublicPortalView
        orgSlug={portalSlug}
        onBack={() => {
          const url = new URL(window.location.href);
          url.searchParams.delete('portal');
          window.history.replaceState({}, '', url.toString());
          setPortalSlug(null);
        }}
      />
    );
  }

  return (
    <AuthProvider>
      <WorkspaceShell />
    </AuthProvider>
  );
}
