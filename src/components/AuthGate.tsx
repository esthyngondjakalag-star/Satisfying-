import React, { useEffect, useState } from 'react';
import {
  ShieldCheck,
  ArrowRight,
  Globe,
  BarChart3,
  Clock,
  Layers,
  ExternalLink,
  Building2,
  UserCheck,
  KeyRound,
  Crown,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { OrgPlan, OrgRole } from '../types/workspace';

export function AuthGate({
  onOpenPublicPortal,
  darkMode,
  onToggleDark,
}: {
  onOpenPublicPortal: () => void;
  darkMode: boolean;
  onToggleDark: () => void;
}) {
  const {
    signInWithGoogle,
    loginWithEmail,
    activateFounder,
    activateInvite,
    registerOrganization,
    loginDemoRole,
    clearError,
    signingIn,
    error,
  } = useAuth();

  const [authTab, setAuthTab] = useState<'demo' | 'login' | 'register'>('login');
  const [loginMode, setLoginMode] = useState<'standard' | 'founder' | 'invite'>('standard');
  const [founderStatus, setFounderStatus] = useState<{ founderEmail: string; isActivated: boolean }>({
    founderEmail: 'esthyngondjakalag@gmail.com',
    isActivated: false,
  });

  // Login form
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Founder activation form
  const [founderEmail, setFounderEmail] = useState('esthyngondjakalag@gmail.com');
  const [founderName, setFounderName] = useState('Direction ClientPulse 360');
  const [founderPassword, setFounderPassword] = useState('');

  // Invite activation form
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [invitePassword, setInvitePassword] = useState('');

  // Register Org form
  const [orgName, setOrgName] = useState('');
  const [industry, setIndustry] = useState('Services B2B');
  const [plan, setPlan] = useState<OrgPlan>('BUSINESS');
  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');

  useEffect(() => {
    fetch('/api/auth/founder-status')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.founderEmail) {
          setFounderStatus(data);
          setFounderEmail(data.founderEmail);
        }
      })
      .catch(() => {
        // Ignore network errors on initial check
      });
  }, []);

  const switchTab = (tab: 'demo' | 'login' | 'register') => {
    clearError();
    setAuthTab(tab);
  };

  const demoRoles: Array<{ role: OrgRole; label: string; scope: string }> = [
    {
      role: 'ORG_ADMIN',
      label: 'Administrateur Entreprise',
      scope: 'Gestion complète organisation, agences, SLA, plans & utilisateurs',
    },
    {
      role: 'CS_MANAGER',
      label: 'Responsable Service Client',
      scope: 'Pilotage équipes, escalades, règles SLA, automatisations & rapports',
    },
    {
      role: 'AGENT',
      label: 'Agent Support SAV',
      scope: 'Traitement tickets, réponses clients, notes internes & Copilote IA',
    },
    {
      role: 'ANALYST',
      label: 'Analyste Lecture Seule',
      scope: 'Consultation KPI, CSAT/NPS/CES, causes racines & exports',
    },
    {
      role: 'SUPER_ADMIN',
      label: 'Super Administrateur SaaS',
      scope: 'Console multi-entreprises, encaissements, MRR global & provisionnement',
    },
  ];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col">
      {/* Top Bar Contract: 3 zones */}
      <header className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-6 lg:px-10 h-16 flex items-center justify-between gap-8">
        <span className="font-display text-lg font-bold tracking-tight whitespace-nowrap shrink-0">
          ClientPulse 360
        </span>
        <nav className="hidden md:flex items-center gap-6 text-sm text-slate-600 dark:text-slate-400">
          <a
            href="#auth-panel"
            onClick={() => switchTab('login')}
            className="hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0"
          >
            Connexion
          </a>
          <a
            href="#auth-panel"
            onClick={() => switchTab('register')}
            className="hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0"
          >
            Créer Entreprise
          </a>
          <a
            href="#auth-panel"
            onClick={() => switchTab('demo')}
            className="hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0"
          >
            Accès Démo
          </a>
          <button
            onClick={onOpenPublicPortal}
            className="hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Portail Client
          </button>
        </nav>
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={onToggleDark}
            className="px-3 py-1.5 text-xs font-medium border border-slate-200 dark:border-slate-700 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {darkMode ? 'Mode clair' : 'Mode sombre'}
          </button>
          <button
            onClick={() => loginDemoRole('ORG_ADMIN')}
            disabled={signingIn}
            className="px-4 py-2 text-xs font-semibold bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {signingIn ? 'Connexion...' : 'Entrer en Démo'}
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-10 lg:py-16 grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
        {/* Left Pitch & Architecture */}
        <div className="lg:col-span-6 space-y-6 pt-2">
          <p className="text-xs font-medium text-blue-600 dark:text-blue-400 tracking-wide">
            Plateforme B2B · Multi-Tenant PostgreSQL · Isolation & Facturation SaaS
          </p>
          <h1
            className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-slate-950 dark:text-white leading-tight"
            style={{ textWrap: 'balance' }}
          >
            Pilotez la qualité de service, vos SLA et la satisfaction client sur une base unifiée.
          </h1>
          <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed">
            ClientPulse 360 sépare strictement chaque entreprise locataire, gère vos agences et équipes,
            automatise les SLA, encaisse vos abonnements et mesure CSAT, NPS et CES.
          </p>

          <div className="divide-y divide-slate-200 dark:divide-slate-800 border-t border-b border-slate-200 dark:border-slate-800">
            <div className="py-3.5 flex items-start gap-3">
              <Layers className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium">Architecture Multi-Tenant & Accès Fondateur</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Console Super Admin dédiée au fondateur, espaces clients isolés et gestion de licences par plan.
                </p>
              </div>
            </div>
            <div className="py-3.5 flex items-start gap-3">
              <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium">Moteur SLA, Certifications & Automatisations</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Compte à rebours en direct, escalades automatiques et dossiers SAV par domaine.
                </p>
              </div>
            </div>
            <div className="py-3.5 flex items-start gap-3">
              <BarChart3 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium">Portail Client Marque Blanche & Sondages</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Dépôt et suivi client externe, questionnaires personnalisés et facturation TVA automatique.
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={onOpenPublicPortal}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-medium border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Globe className="w-4 h-4" />
              Ouvrir le Portail Client Public
            </button>
            <a
              href={typeof window !== 'undefined' ? window.location.href : '#'}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white whitespace-nowrap shrink-0"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Ouvrir dans un nouvel onglet
            </a>
          </div>
        </div>

        {/* Right Interactive Access Panel */}
        <div
          id="auth-panel"
          className="lg:col-span-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-5"
        >
          {/* Segmented Tab Control */}
          <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg text-xs">
            <button
              onClick={() => switchTab('login')}
              className={`py-2 px-2 font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                authTab === 'login'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Connexion Compte
            </button>
            <button
              onClick={() => switchTab('register')}
              className={`py-2 px-2 font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                authTab === 'register'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Créer Entreprise
            </button>
            <button
              onClick={() => switchTab('demo')}
              className={`py-2 px-2 font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                authTab === 'demo'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Démo par Rôle
            </button>
          </div>

          {error && (
            <div className="p-3 text-xs border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 rounded-lg">
              {error}
            </div>
          )}

          {authTab === 'login' && (
            <div className="space-y-4">
              {/* Sub-mode selector */}
              <div className="flex flex-wrap gap-2 text-[11px]">
                <button
                  type="button"
                  onClick={() => {
                    clearError();
                    setLoginMode('standard');
                  }}
                  className={`px-2.5 py-1 rounded-md border cursor-pointer transition-colors ${
                    loginMode === 'standard'
                      ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 font-semibold'
                      : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  Compte Entreprise / Client
                </button>
                <button
                  type="button"
                  onClick={() => {
                    clearError();
                    setLoginMode('founder');
                  }}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md border cursor-pointer transition-colors ${
                    loginMode === 'founder'
                      ? 'border-amber-600 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 font-semibold'
                      : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  <Crown className="w-3 h-3" />
                  Accès Fondateur (Super Admin)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    clearError();
                    setLoginMode('invite');
                  }}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md border cursor-pointer transition-colors ${
                    loginMode === 'invite'
                      ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300 font-semibold'
                      : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  <KeyRound className="w-3 h-3" />
                  Collaborateur invité
                </button>
              </div>

              {loginMode === 'standard' && (
                <>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      loginWithEmail(loginEmail, loginPassword);
                    }}
                    className="space-y-3 text-xs"
                  >
                    <div>
                      <label className="block font-medium text-slate-600 dark:text-slate-400 mb-1">
                        Email professionnel
                      </label>
                      <input
                        required
                        type="email"
                        value={loginEmail}
                        onChange={(e) => setLoginEmail(e.target.value)}
                        placeholder="nom@entreprise.fr"
                        className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block font-medium text-slate-600 dark:text-slate-400 mb-1">
                        Mot de passe
                      </label>
                      <input
                        required
                        type="password"
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={signingIn}
                      className="w-full py-2.5 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg cursor-pointer disabled:opacity-60"
                    >
                      {signingIn ? 'Connexion...' : 'Se connecter à mon espace'}
                    </button>
                  </form>

                  <div className="relative flex py-1 items-center">
                    <div className="flex-grow border-t border-slate-200 dark:border-slate-800" />
                    <span className="shrink mx-3 text-[11px] text-slate-400">ou SSO</span>
                    <div className="flex-grow border-t border-slate-200 dark:border-slate-800" />
                  </div>

                  <button
                    type="button"
                    onClick={signInWithGoogle}
                    disabled={signingIn}
                    className="w-full inline-flex items-center justify-center gap-2 py-2.5 text-xs font-semibold border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg cursor-pointer disabled:opacity-60"
                  >
                    <ShieldCheck className="w-4 h-4 text-blue-600" />
                    Continuer avec Google
                  </button>
                </>
              )}

              {loginMode === 'founder' && (
                <div className="space-y-3 text-xs">
                  <div className="p-3 bg-amber-50/70 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 rounded-lg space-y-1">
                    <p className="font-semibold text-amber-900 dark:text-amber-200">
                      Espace Fondateur & Super Administrateur SaaS
                    </p>
                    <p className="text-amber-800/90 dark:text-amber-300/90">
                      Identifiant propriétaire : <span className="font-mono font-semibold">{founderStatus.founderEmail}</span>.
                      {founderStatus.isActivated
                        ? ' Votre mot de passe fondateur est actif : connectez-vous directement ci-dessous.'
                        : ' Première connexion : définissez votre mot de passe Super Admin sécurisé (sans dépendre des pop-ups Google).'}
                    </p>
                  </div>

                  {founderStatus.isActivated ? (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        loginWithEmail(founderEmail, founderPassword);
                      }}
                      className="space-y-3"
                    >
                      <div>
                        <label className="block font-medium text-slate-600 dark:text-slate-400 mb-1">
                          Email Fondateur
                        </label>
                        <input
                          required
                          type="email"
                          value={founderEmail}
                          onChange={(e) => setFounderEmail(e.target.value)}
                          className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg font-mono"
                        />
                      </div>
                      <div>
                        <label className="block font-medium text-slate-600 dark:text-slate-400 mb-1">
                          Mot de passe Fondateur
                        </label>
                        <input
                          required
                          type="password"
                          value={founderPassword}
                          onChange={(e) => setFounderPassword(e.target.value)}
                          placeholder="••••••••"
                          className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg"
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={signingIn}
                        className="w-full py-2.5 text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white rounded-lg cursor-pointer disabled:opacity-60"
                      >
                        {signingIn ? 'Connexion Super Admin...' : 'Ouvrir la console Super Admin SaaS'}
                      </button>
                    </form>
                  ) : (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        activateFounder({
                          email: founderEmail,
                          fullName: founderName,
                          password: founderPassword,
                        });
                      }}
                      className="space-y-3"
                    >
                      <div>
                        <label className="block font-medium text-slate-600 dark:text-slate-400 mb-1">
                          Email Fondateur autorisé
                        </label>
                        <input
                          required
                          type="email"
                          value={founderEmail}
                          onChange={(e) => setFounderEmail(e.target.value)}
                          className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg font-mono"
                        />
                      </div>
                      <div>
                        <label className="block font-medium text-slate-600 dark:text-slate-400 mb-1">
                          Nom affiché (Super Admin)
                        </label>
                        <input
                          required
                          value={founderName}
                          onChange={(e) => setFounderName(e.target.value)}
                          className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg"
                        />
                      </div>
                      <div>
                        <label className="block font-medium text-slate-600 dark:text-slate-400 mb-1">
                          Définir votre mot de passe Super Admin (6+ car.)
                        </label>
                        <input
                          required
                          type="password"
                          minLength={6}
                          value={founderPassword}
                          onChange={(e) => setFounderPassword(e.target.value)}
                          placeholder="Choisissez un mot de passe robuste"
                          className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg"
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={signingIn}
                        className="w-full py-2.5 text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white rounded-lg cursor-pointer disabled:opacity-60"
                      >
                        {signingIn ? 'Activation...' : 'Activer mon compte Fondateur Super Admin'}
                      </button>
                    </form>
                  )}
                </div>
              )}

              {loginMode === 'invite' && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    activateInvite({
                      email: inviteEmail,
                      fullName: inviteName,
                      password: invitePassword,
                    });
                  }}
                  className="space-y-3 text-xs"
                >
                  <p className="text-slate-500 dark:text-slate-400">
                    Vous avez été invité par votre administrateur ? Saisissez votre email pour définir votre mot de passe et rejoindre votre entreprise.
                  </p>
                  <div>
                    <label className="block font-medium text-slate-600 dark:text-slate-400 mb-1">
                      Email invité *
                    </label>
                    <input
                      required
                      type="email"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      placeholder="collaborateur@entreprise.fr"
                      className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-600 dark:text-slate-400 mb-1">
                      Nom complet
                    </label>
                    <input
                      value={inviteName}
                      onChange={(e) => setInviteName(e.target.value)}
                      placeholder="Prénom Nom"
                      className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-600 dark:text-slate-400 mb-1">
                      Mot de passe (6+ car.) *
                    </label>
                    <input
                      required
                      type="password"
                      minLength={6}
                      value={invitePassword}
                      onChange={(e) => setInvitePassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={signingIn}
                    className="w-full py-2.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg cursor-pointer disabled:opacity-60"
                  >
                    {signingIn ? 'Activation...' : 'Activer mon accès collaborateur'}
                  </button>
                </form>
              )}
            </div>
          )}

          {authTab === 'register' && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                registerOrganization({
                  organizationName: orgName,
                  industry,
                  plan,
                  fullName: adminName,
                  email: adminEmail,
                  password: adminPassword,
                });
              }}
              className="space-y-3 text-xs"
            >
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-blue-600" />
                <h2 className="font-display text-sm font-semibold">
                  Provisionner un nouvel espace entreprise isolé
                </h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-500 mb-1">Nom de l’entreprise *</label>
                  <input
                    required
                    value={orgName}
                    onChange={(e) => setOrgName(e.target.value)}
                    placeholder="Ex. Nova Industrie"
                    className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-slate-500 mb-1">Secteur</label>
                  <input
                    value={industry}
                    onChange={(e) => setIndustry(e.target.value)}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-500 mb-1">Offre (Essai gratuit 14j)</label>
                  <select
                    value={plan}
                    onChange={(e) => setPlan(e.target.value as OrgPlan)}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg"
                  >
                    <option value="STARTER">STARTER (65 €/mois)</option>
                    <option value="BUSINESS">BUSINESS (199 €/mois)</option>
                    <option value="ENTERPRISE">ENTERPRISE (499 €/mois)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-500 mb-1">Nom de l’administrateur *</label>
                  <input
                    required
                    value={adminName}
                    onChange={(e) => setAdminName(e.target.value)}
                    placeholder="Prénom Nom"
                    className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-500 mb-1">Email professionnel *</label>
                  <input
                    required
                    type="email"
                    value={adminEmail}
                    onChange={(e) => setAdminEmail(e.target.value)}
                    placeholder="admin@entreprise.fr"
                    className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-slate-500 mb-1">Mot de passe (6+ car.) *</label>
                  <input
                    required
                    type="password"
                    minLength={6}
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={signingIn}
                className="w-full py-2.5 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg cursor-pointer disabled:opacity-60"
              >
                {signingIn ? 'Création de l’espace...' : 'Créer mon espace ClientPulse 360'}
              </button>
            </form>
          )}

          {authTab === 'demo' && (
            <div className="space-y-3">
              <div>
                <h2 className="font-display text-base font-semibold">
                  Explorer l’environnement de démonstration
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Choisissez un rôle pour tester l’espace <strong className="text-slate-700 dark:text-slate-300">Horizon Distribution & SAV [DÉMO]</strong> en conditions réelles.
                </p>
              </div>

              <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
                {demoRoles.map((item) => (
                  <button
                    key={item.role}
                    disabled={signingIn}
                    onClick={() => loginDemoRole(item.role)}
                    className="w-full p-3.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors flex items-center justify-between gap-3 cursor-pointer disabled:opacity-60"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                        <UserCheck className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                        {item.label}
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{item.scope}</p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-slate-400 shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
