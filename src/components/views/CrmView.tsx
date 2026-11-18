import React, { useMemo, useState } from 'react';
import { Plus, Search, Building2, Mail, Phone, ShoppingBag } from 'lucide-react';
import {
  Customer,
  STATUS_LABELS,
  WorkspaceBootstrap,
  formatCurrencyEUR,
} from '../../types/workspace';
import { useAuth } from '../../contexts/AuthContext';
import { apiRequest } from '../../lib/apiClient';

export function CrmView({
  data,
  onRefresh,
  onSelectTicket,
}: {
  data: WorkspaceBootstrap;
  onRefresh: () => Promise<void>;
  onSelectTicket: (ticketId: number) => void;
}) {
  const { getToken } = useAuth();
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<number>(data.customers[0]?.id || 0);
  const [showCreate, setShowCreate] = useState(false);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [customerType, setCustomerType] = useState<'VIP' | 'ENTERPRISE' | 'PME' | 'PARTICULIER'>('PME');
  const [internalNotes, setInternalNotes] = useState('');

  const [editingNotes, setEditingNotes] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return data.customers.filter(
      (c) =>
        c.fullName.toLowerCase().includes(q) ||
        c.companyName.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        c.externalCode.toLowerCase().includes(q)
    );
  }, [data.customers, search]);

  const selectedCustomer: Customer | undefined =
    data.customers.find((c) => c.id === selectedId) || filtered[0];

  const customerTickets = useMemo(() => {
    if (!selectedCustomer) return [];
    return data.tickets.filter((t) => t.customerId === selectedCustomer.id);
  }, [data.tickets, selectedCustomer]);

  const customerSurveys = useMemo(() => {
    if (!selectedCustomer) return [];
    return data.surveys.filter((s) => s.customerId === selectedCustomer.id);
  }, [data.surveys, selectedCustomer]);

  const avgCsat = customerSurveys.length
    ? (customerSurveys.reduce((a, s) => a + s.csatScore, 0) / customerSurveys.length).toFixed(1)
    : '—';

  const handleCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = await getToken();
    if (!token) return;
    const created = await apiRequest<Customer>('/api/customers', {
      method: 'POST',
      token,
      orgId: data.activeOrganization.id,
      body: { fullName, email, phone, companyName, customerType, internalNotes },
    });
    setShowCreate(false);
    setFullName('');
    setEmail('');
    setPhone('');
    setCompanyName('');
    setInternalNotes('');
    await onRefresh();
    setSelectedId(created.id);
  };

  const handleSaveNotes = async () => {
    if (!selectedCustomer || editingNotes === null) return;
    const token = await getToken();
    if (!token) return;
    await apiRequest(`/api/customers/${selectedCustomer.id}`, {
      method: 'PATCH',
      token,
      orgId: data.activeOrganization.id,
      body: { internalNotes: editingNotes },
    });
    setEditingNotes(null);
    await onRefresh();
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-bold">CRM & Historique Client 360</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Fiches comptes, achats, réclamations passées et satisfaction moyenne
          </p>
        </div>

        <button
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg cursor-pointer whitespace-nowrap shrink-0"
        >
          <Plus className="w-4 h-4" />
          Nouveau client
        </button>
      </div>

      {showCreate && (
        <form
          onSubmit={handleCreateCustomer}
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4"
        >
          <h2 className="font-display text-sm font-semibold">Créer une fiche client</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <input
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Nom complet *"
              className="px-3 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg"
            />
            <input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email *"
              className="px-3 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg"
            />
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Téléphone"
              className="px-3 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg"
            />
            <input
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="Entreprise"
              className="px-3 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg"
            />
            <select
              value={customerType}
              onChange={(e) => setCustomerType(e.target.value as any)}
              className="px-3 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg"
            >
              <option value="VIP">VIP</option>
              <option value="ENTERPRISE">Grand Compte</option>
              <option value="PME">PME</option>
              <option value="PARTICULIER">Particulier</option>
            </select>
          </div>
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="px-3 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-lg cursor-pointer"
            >
              Annuler
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 text-xs font-semibold bg-blue-600 text-white rounded-lg cursor-pointer"
            >
              Enregistrer
            </button>
          </div>
        </form>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Directory */}
        <div className="lg:col-span-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden flex flex-col">
          <div className="p-3 border-b border-slate-100 dark:border-slate-800">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher nom, société, code..."
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg"
              />
            </div>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-[600px] overflow-y-auto">
            {filtered.map((c) => {
              const active = selectedCustomer?.id === c.id;
              return (
                <button
                  key={c.id}
                  onClick={() => {
                    setSelectedId(c.id);
                    setEditingNotes(null);
                  }}
                  className={`w-full text-left p-3.5 transition-colors cursor-pointer ${
                    active
                      ? 'bg-blue-50/70 dark:bg-blue-950/30'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                    <span className="font-mono tabular-nums">{c.externalCode}</span>
                    <span className="font-medium text-slate-700 dark:text-slate-300">{c.customerType}</span>
                  </div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white mt-0.5">{c.fullName}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                    {c.companyName || c.email}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Customer 360 Detail */}
        <div className="lg:col-span-8 space-y-5">
          {selectedCustomer ? (
            <>
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                      {selectedCustomer.externalCode} · {selectedCustomer.customerType} · Inscrit le{' '}
                      {new Date(selectedCustomer.registeredAt).toLocaleDateString('fr-FR')}
                    </p>
                    <h2 className="font-display text-xl font-bold mt-1">{selectedCustomer.fullName}</h2>
                    <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600 dark:text-slate-400 mt-2">
                      <span className="inline-flex items-center gap-1.5">
                        <Building2 className="w-3.5 h-3.5" />
                        {selectedCustomer.companyName || 'Particulier'}
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <Mail className="w-3.5 h-3.5" />
                        {selectedCustomer.email}
                      </span>
                      {selectedCustomer.phone && (
                        <span className="inline-flex items-center gap-1.5 font-mono tabular-nums">
                          <Phone className="w-3.5 h-3.5" />
                          {selectedCustomer.phone}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-6 text-right font-mono tabular-nums">
                    <div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">CA cumulé</p>
                      <p className="text-base font-bold">
                        {formatCurrencyEUR(selectedCustomer.totalSpentCents)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">CSAT moyen</p>
                      <p className="text-base font-bold">{avgCsat} / 5</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">Tickets</p>
                      <p className="text-base font-bold">{customerTickets.length}</p>
                    </div>
                  </div>
                </div>

                {/* Tags & Notes */}
                <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Notes internes & Contexte compte
                    </span>
                    {editingNotes === null ? (
                      <button
                        onClick={() => setEditingNotes(selectedCustomer.internalNotes || '')}
                        className="text-xs text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                      >
                        Modifier note
                      </button>
                    ) : (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setEditingNotes(null)}
                          className="text-xs text-slate-500 cursor-pointer"
                        >
                          Annuler
                        </button>
                        <button
                          onClick={handleSaveNotes}
                          className="text-xs font-semibold text-blue-600 dark:text-blue-400 cursor-pointer"
                        >
                          Enregistrer
                        </button>
                      </div>
                    )}
                  </div>
                  {editingNotes !== null ? (
                    <textarea
                      rows={2}
                      value={editingNotes}
                      onChange={(e) => setEditingNotes(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg"
                    />
                  ) : (
                    <p className="text-xs text-slate-600 dark:text-slate-400">
                      {selectedCustomer.internalNotes || 'Aucune note interne enregistrée.'}
                    </p>
                  )}
                  {selectedCustomer.tags.length > 0 && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 pt-1">
                      Tags : {selectedCustomer.tags.join(' · ')}
                    </p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* Purchases */}
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
                  <h3 className="font-display text-sm font-semibold mb-3 flex items-center gap-2">
                    <ShoppingBag className="w-4 h-4 text-slate-400" />
                    Historique des achats & contrats
                  </h3>
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {selectedCustomer.purchases.map((p) => (
                      <div key={p.ref} className="py-2.5 flex items-center justify-between text-xs gap-2">
                        <div className="min-w-0">
                          <p className="font-medium text-slate-900 dark:text-white truncate">{p.item}</p>
                          <p className="font-mono tabular-nums text-slate-500 dark:text-slate-400">
                            {p.ref} · {p.date}
                          </p>
                        </div>
                        <span className="font-mono tabular-nums font-semibold shrink-0">
                          {formatCurrencyEUR(p.amountCents)}
                        </span>
                      </div>
                    ))}
                    {selectedCustomer.purchases.length === 0 && (
                      <p className="py-4 text-xs text-slate-500">Aucun achat enregistré.</p>
                    )}
                  </div>
                </div>

                {/* Customer Tickets */}
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
                  <h3 className="font-display text-sm font-semibold mb-3">
                    Historique complet des tickets
                  </h3>
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {customerTickets.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => onSelectTicket(t.id)}
                        className="w-full py-2.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50 px-2 rounded-md transition-colors cursor-pointer"
                      >
                        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                          <span className="font-mono tabular-nums">{t.ticketNumber}</span>
                          <span>{STATUS_LABELS[t.status]}</span>
                        </div>
                        <p className="text-xs font-medium text-slate-900 dark:text-white truncate mt-0.5">
                          {t.subject}
                        </p>
                      </button>
                    ))}
                    {customerTickets.length === 0 && (
                      <p className="py-4 text-xs text-slate-500">Aucun ticket pour ce client.</p>
                    )}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-10 text-center text-sm text-slate-500">
              Sélectionnez un client dans l’annuaire.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
