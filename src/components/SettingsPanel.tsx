import { useState, useEffect } from "react";
import { GlobalConfig, BrandConfig } from "../types";
import { 
  Building2, 
  Activity, 
  Globe, 
  Cpu, 
  Loader2, 
  CheckCircle2, 
  XCircle,
  Zap,
  Phone,
  ChevronDown,
  ChevronUp,
  Sliders,
  Database,
  MessageCircle,
  Users,
  UserPlus,
  RefreshCcw
} from "lucide-react";
import ReactMarkdown from 'react-markdown';

interface SettingsPanelProps {
  config: GlobalConfig;
  onChange: (newConfig: GlobalConfig) => void;
  productsForSync?: any[]; // To send actual products to Site API
}

export default function SettingsPanel({ config: externalConfig, onChange, productsForSync = [] }: SettingsPanelProps) {
  const [config, setConfig] = useState<GlobalConfig>(externalConfig);
  const [isModified, setIsModified] = useState(false);
  const [showConfirmSave, setShowConfirmSave] = useState(false);

  const [siteLoading, setSiteLoading] = useState(false);
  const [siteStatus, setSiteStatus] = useState<{ success: boolean; message: string; details?: string } | null>(null);

  // Sync internal state with external config if external config changes (and not modified locally)
  useEffect(() => {
    if (!isModified) {
      setConfig(externalConfig);
    }
  }, [externalConfig]);

  // Accordion state to toggle sections - 'global', 'brands', 'sync'. Default with 'global' open.
  const [expandedSection, setExpandedSection] = useState<"global" | "brands" | "sync" | "meta" | "access" | null>("global");

  const [accessRequests, setAccessRequests] = useState<any[]>([]);

  useEffect(() => {
    const list = JSON.parse(localStorage.getItem('access_requests') || '[]');
    setAccessRequests(list);
  }, []);

  const handleApproveAccess = (email: string, role: 'user' | 'admin') => {
    const updatedUserEmails = config.userEmails ? [...config.userEmails] : [];
    const updatedAdminEmails = config.adminEmails ? [...config.adminEmails] : [];
    
    if (role === 'user' && !updatedUserEmails.includes(email)) updatedUserEmails.push(email);
    if (role === 'admin' && !updatedAdminEmails.includes(email)) updatedAdminEmails.push(email);
    
    const newConfig = { ...config, userEmails: updatedUserEmails, adminEmails: updatedAdminEmails };
    setConfig(newConfig);
    setIsModified(true);
    
    const newRequests = accessRequests.filter(r => r.email !== email);
    setAccessRequests(newRequests);
    localStorage.setItem('access_requests', JSON.stringify(newRequests));
  };

  const handleRejectAccess = (email: string) => {
    const newRequests = accessRequests.filter(r => r.email !== email);
    setAccessRequests(newRequests);
    localStorage.setItem('access_requests', JSON.stringify(newRequests));
  };

  // State inside API synchronization accordion to configure each brand's specific portal endpoint
  const [activeSyncBrand, setActiveSyncBrand] = useState<string>("direcional");

  const handleChange = (field: keyof GlobalConfig, value: any) => {
    setConfig({ ...config, [field]: value });
    setIsModified(true);
  };

  const handleBrandChange = (brandId: string, field: keyof BrandConfig, value: string) => {
    const updatedBrands = (config.brands || []).map((b) => {
      if (b.id === brandId) {
        return { ...b, [field]: value };
      }
      return b;
    });
    setConfig({ ...config, brands: updatedBrands });
    setIsModified(true);
  };

  const handleSaveConfig = () => {
    onChange(config);
    setIsModified(false);
    setShowConfirmSave(false);
    alert("Configurações aplicadas com sucesso!");
  };

  const handleResetLocally = () => {
    setConfig(externalConfig);
    setIsModified(false);
  };

  // Find the selected brand config model for current API synchronization selector
  const activeBrandConfig = config.brands?.find((b) => b.id === activeSyncBrand) || config.brands?.[0];

  // Filter products count matching the currently selected sync brand
  const filteredProductsForSync = productsForSync.filter(
    (p) => (p.brandId || p.brand || "direcional").toLowerCase() === activeSyncBrand.toLowerCase()
  );

  // Test Connection and Sync active brand catalog with respective Portal Site API url (Real Cosec through express proxy)
  const handleTestSiteSync = async () => {
    if (!activeBrandConfig) return;

    const targetUrl = activeBrandConfig.siteApiUrl || "";
    const targetToken = activeBrandConfig.siteAccessToken || "";

    if (!targetUrl.trim()) {
      setSiteStatus({
        success: false,
        message: "Configuração Incompleta",
        details: `Insira uma URL de API de sincronização válida para a marca "${activeBrandConfig.name}".`
      });
      return;
    }

    setSiteLoading(true);
    setSiteStatus(null);
    try {
      const response = await fetch("/api/integration/site/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siteApiUrl: targetUrl,
          siteAccessToken: targetToken,
          brandId: activeBrandConfig.id
        })
      });

      const data = await response.json();
      if (response.ok && data.success) {
        setSiteStatus({
          success: true,
          message: `O catálogo da marca ${activeBrandConfig.name} contatou a API e encontrou dados.`,
          details: `Conexão estabelecida com sucesso via API Aberta do WP. ${data.syncedProductsCount} empreendimentos encontrados.`
        });
      } else {
        setSiteStatus({
          success: false,
          message: data.error || "A API do site rejeitou a sincronização.",
          details: data.details ? JSON.stringify(data.details) : "Verifique as configurações de endpoint e autorização Bearer."
        });
      }
    } catch (err: any) {
      setSiteStatus({
        success: false,
        message: "Erro de Conexão com o Servidor Local de Proxy.",
        details: err.message || String(err)
      });
    } finally {
      setSiteLoading(false);
    }
  };

  const placeholders = [
    { tag: "{NOME_PRODUTO}", desc: "Nome do empreendimento." },
    { tag: "{CIDADE}", desc: "Cidade do empreendimento." },
    { tag: "{BAIRRO}", desc: "Bairro." },
    { tag: "{STATUS}", desc: "Status do WP (Ex: Lançamento)." },
    { tag: "{NOME_EMPRESA}", desc: "Nome da marca sendo usada (Ex: Direcional)." },
  ];

  const formatPhoneLabel = (num: string | undefined) => {
    if (!num) return "Não configurado";
    const cleaned = num.replace(/\D/g, "");
    if (cleaned.startsWith("55") && cleaned.length >= 10) {
      const rest = cleaned.substring(2);
      if (rest.length === 11) {
        return `(${rest.substring(0, 2)}) ${rest.substring(2, 7)}-${rest.substring(7)}`;
      } else if (rest.length === 10) {
        return `(${rest.substring(0, 2)}) ${rest.substring(2, 6)}-${rest.substring(6)}`;
      }
    }
    return num;
  };

  const toggleSection = (section: "global" | "brands" | "sync" | "meta") => {
    setExpandedSection(expandedSection === section ? null : section);
  };

  return (
    <div className="space-y-4" id="settings-accordion-panel">
      
      {/* SECTION 1: GLOBAL CONFIGURATION ACCORDION ITEM */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <button
          type="button"
          onClick={() => toggleSection("global")}
          className="w-full flex items-center justify-between p-5 bg-slate-50 hover:bg-slate-100/50 transition-colors text-left border-b border-slate-150 cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-50 rounded-xl">
              <Zap className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-800">
                1. Configuração Global de Mensagens
              </h3>
              <p className="text-slate-500 text-[11px] mt-0.5 font-medium">
                Defina os templates de texto wa.me padrão de backup para informações e simulação.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] bg-emerald-100 text-emerald-800 font-extrabold px-2.5 py-0.5 rounded-full uppercase">
              {config.companyName || "Direcional"}
            </span>
            {expandedSection === "global" ? (
              <ChevronUp className="w-4 h-4 text-slate-405" />
            ) : (
              <ChevronDown className="w-4 h-4 text-slate-405" />
            )}
          </div>
        </button>

        {expandedSection === "global" && (
          <div className="p-6 space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-2">
                  Nome da Empresa / Projeto
                </label>
                <input
                  type="text"
                  value={config.companyName}
                  onChange={(e) => handleChange("companyName", e.target.value)}
                  className="w-full pl-3 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-800 placeholder-slate-400 font-medium"
                  placeholder="Ex: Direcional"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-2">
                  Telefone Padrão de Backup (WhatsApp)
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <Phone className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    value={config.defaultPhone}
                    onChange={(e) => handleChange("defaultPhone", e.target.value)}
                    className="w-full pl-10 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-800 placeholder-slate-400 font-medium"
                    placeholder="Ex: 553140200400"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-2">
                  ID da Planilha Google (Opcional)
                </label>
                <input
                  type="text"
                  value={config.spreadsheetId || ""}
                  onChange={(e) => handleChange("spreadsheetId", e.target.value)}
                  className="w-full pl-3 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-800 placeholder-slate-400 font-medium font-mono"
                  placeholder="ID da Planilha..."
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-2">
                  Intervalo de Auto-Sincronização (Minutos)
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <RefreshCcw className="w-4 h-4" />
                  </div>
                  <input
                    type="number"
                    min="0"
                    value={config.sheetsSyncInterval || 0}
                    onChange={(e) => handleChange("sheetsSyncInterval", parseInt(e.target.value) || 0)}
                    className="w-full pl-10 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-800 placeholder-slate-400 font-medium"
                    placeholder="0 para desativar"
                  />
                </div>
                <p className="text-[9px] text-slate-400 mt-1">Defina 0 para desativar a sincronização automática.</p>
              </div>
            </div>

            {/* Template Card: Info */}
            <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/50">
              <div className="flex justify-between items-center mb-2">
                <label className="block text-xs font-bold text-slate-800">
                  Template Padrão: Pedido de Informações
                </label>
                <span className="text-[9px] text-emerald-700 bg-emerald-50 border border-emerald-150 px-2 py-0.5 rounded uppercase font-bold">
                  Informações Gerais
                </span>
              </div>
              <textarea
                value={config.defaultMessage}
                onChange={(e) => handleChange("defaultMessage", e.target.value)}
                className="w-full h-16 p-3 bg-white border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-700 resize-y leading-relaxed"
                placeholder="Exemplo para informações gerais..."
              ></textarea>
            </div>

            {/* Template Card: Financing Simulation */}
            <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/50">
              <div className="flex justify-between items-center mb-2">
                <label className="block text-xs font-bold text-slate-800">
                  Template Padrão: Simulação de Financiamento
                </label>
                <span className="text-[9px] text-blue-700 bg-blue-50 border border-blue-150 px-2 py-0.5 rounded uppercase font-bold">
                  Simulação Financeira
                </span>
              </div>
              <textarea
                value={config.defaultFinanceMessage}
                onChange={(e) => handleChange("defaultFinanceMessage", e.target.value)}
                className="w-full h-16 p-3 bg-white border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-700 resize-y leading-relaxed"
                placeholder="Exemplo para simulação de financiamento..."
              ></textarea>
            </div>

            <div className="flex flex-wrap gap-1.5 pt-1">
              <p className="text-[10px] font-bold text-slate-400 w-full mb-1">Tags Dinâmicas suportadas:</p>
              {placeholders.map((p, i) => (
                <span key={i} className="text-[10px] bg-white border border-slate-200 text-slate-600 px-2.5 py-1 rounded-lg" title={p.desc}>
                  <code className="text-emerald-700 font-extrabold font-mono">{p.tag}</code>: {p.desc}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* SECTION 2: TELEPHONES PER OPERATIONAL BRAND ACCORDION ITEM */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <button
          type="button"
          onClick={() => toggleSection("brands")}
          className="w-full flex items-center justify-between p-5 bg-slate-50 hover:bg-slate-100/50 transition-colors text-left border-b border-slate-150 cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-50 rounded-xl">
              <Building2 className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-800">
                2. Configuração Completa de Marcas (Telefones, APIs e Meta)
              </h3>
              <p className="text-slate-550 text-[11px] mt-0.5 font-medium">
                Configure os canais (GA/SDR), Endpoints de Site e IDs da Meta para cada marca.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] bg-emerald-100 text-emerald-800 font-extrabold px-2.5 py-0.5 rounded-full uppercase">
              {(config.brands || []).length} Marcas
            </span>
            {expandedSection === "brands" ? (
              <ChevronUp className="w-4 h-4 text-slate-405" />
            ) : (
              <ChevronDown className="w-4 h-4 text-slate-405" />
            )}
          </div>
        </button>

        {expandedSection === "brands" && (
          <div className="p-6">
            <div className="grid grid-cols-1 gap-6">
              {(config.brands || []).map((brand) => (
                <div key={brand.id} className="border border-slate-200 bg-slate-50/50 rounded-2xl p-6 space-y-6">
                  <div className="flex items-center justify-between pb-4 border-b border-slate-200">
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-6 bg-emerald-600 rounded"></div>
                      <h4 className="font-bold text-lg text-slate-800 tracking-tight">{brand.name}</h4>
                    </div>
                    <div className="text-[10px] bg-white border border-slate-200 text-slate-500 font-bold px-3 py-1 rounded-full uppercase">
                      ID Interno: {brand.id}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Column 1: Phones and Tracking */}
                    <div className="space-y-4">
                      <h5 className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-1 flex items-center gap-2">
                        <Phone className="w-3.5 h-3.5" />
                        Telefones e Rastreio
                      </h5>
                      <div className="space-y-3">
                        <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
                          <label className="block text-[9px] font-bold text-slate-500 uppercase mb-1">Telefone GA</label>
                          <input
                            type="text"
                            value={brand.phone}
                            onChange={(e) => handleBrandChange(brand.id, "phone", e.target.value)}
                            className="w-full px-2 py-1 bg-slate-50 border border-slate-100 rounded text-xs focus:ring-1 focus:ring-emerald-500 font-mono"
                          />
                        </div>
                        <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
                          <label className="block text-[9px] font-bold text-slate-500 uppercase mb-1">Telefone SDR</label>
                          <input
                            type="text"
                            value={brand.sdrPhone ?? ""}
                            onChange={(e) => handleBrandChange(brand.id, "sdrPhone" as any, e.target.value)}
                            className="w-full px-2 py-1 bg-slate-50 border border-slate-100 rounded text-xs focus:ring-1 focus:ring-emerald-500 font-mono"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Column 2: Site API Synchronization */}
                    <div className="space-y-4">
                      <h5 className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-1 flex items-center gap-2">
                        <Globe className="w-3.5 h-3.5" />
                        Sincronização do Site
                      </h5>
                      <div className="space-y-3">
                        <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
                          <label className="block text-[9px] font-bold text-slate-500 uppercase mb-1">URL da API (WP JSON)</label>
                          <input
                            type="text"
                            value={brand.siteApiUrl || ""}
                            onChange={(e) => handleBrandChange(brand.id, "siteApiUrl", e.target.value)}
                            className="w-full px-2 py-1 bg-slate-50 border border-slate-100 rounded text-xs focus:ring-1 focus:ring-emerald-500 font-mono overflow-ellipsis"
                            placeholder="https://..."
                          />
                        </div>
                        <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
                          <label className="block text-[9px] font-bold text-slate-500 uppercase mb-1">Token de Acesso (Bearer)</label>
                          <input
                            type="password"
                            value={brand.siteAccessToken || ""}
                            onChange={(e) => handleBrandChange(brand.id, "siteAccessToken", e.target.value)}
                            className="w-full px-2 py-1 bg-slate-50 border border-slate-100 rounded text-xs focus:ring-1 focus:ring-emerald-500 font-mono"
                            placeholder="••••••••"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Column 3: Meta IDs (GA and SDR) */}
                    <div className="space-y-4">
                      <h5 className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-1 flex items-center gap-2">
                        <MessageCircle className="w-3.5 h-3.5" />
                        Configurações Meta
                      </h5>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {/* GA Meta */}
                        <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
                          <div className="text-[8px] font-bold text-blue-600 mb-2 uppercase">Gestão Atend. (GA)</div>
                          <div className="space-y-2">
                            <div>
                              <label className="block text-[7px] font-bold text-slate-400 uppercase">WABA ID</label>
                              <input
                                type="text"
                                value={brand.metaGaWabaId || ""}
                                onChange={(e) => handleBrandChange(brand.id, "metaGaWabaId", e.target.value)}
                                className="w-full px-1.5 py-0.5 bg-slate-50 border border-slate-100 rounded text-[10px] font-mono"
                              />
                            </div>
                            <div>
                              <label className="block text-[7px] font-bold text-slate-400 uppercase">Phone ID</label>
                              <input
                                type="text"
                                value={brand.metaGaPhoneNumberId || ""}
                                onChange={(e) => handleBrandChange(brand.id, "metaGaPhoneNumberId", e.target.value)}
                                className="w-full px-1.5 py-0.5 bg-slate-50 border border-slate-100 rounded text-[10px] font-mono"
                              />
                            </div>
                          </div>
                        </div>
                        {/* SDR Meta */}
                        <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
                          <div className="text-[8px] font-bold text-indigo-600 mb-2 uppercase">Atend. Prior. (SDR)</div>
                          <div className="space-y-2">
                            <div>
                              <label className="block text-[7px] font-bold text-slate-400 uppercase">WABA ID</label>
                              <input
                                type="text"
                                value={brand.metaSdrWabaId || ""}
                                onChange={(e) => handleBrandChange(brand.id, "metaSdrWabaId", e.target.value)}
                                className="w-full px-1.5 py-0.5 bg-slate-50 border border-slate-100 rounded text-[10px] font-mono"
                              />
                            </div>
                            <div>
                              <label className="block text-[7px] font-bold text-slate-400 uppercase">Phone ID</label>
                              <input
                                type="text"
                                value={brand.metaSdrPhoneNumberId || ""}
                                onChange={(e) => handleBrandChange(brand.id, "metaSdrPhoneNumberId", e.target.value)}
                                className="w-full px-1.5 py-0.5 bg-slate-50 border border-slate-100 rounded text-[10px] font-mono"
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Floating Save Action Bar */}
      {isModified && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-slate-900 text-white px-6 py-4 rounded-2xl shadow-2xl border border-white/10 animate-in fade-in slide-in-from-bottom-4 duration-300">
          <div className="flex flex-col">
            <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-400">Alterações Detectadas</span>
            <span className="text-xs text-slate-300">Deseja aplicar as novas configurações?</span>
          </div>
          <div className="h-8 w-[1px] bg-white/20 mx-2"></div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleResetLocally}
              className="px-3 py-1.5 text-xs font-bold hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
            >
              Descartar
            </button>
            <button
              onClick={() => setShowConfirmSave(true)}
              className="bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-1.5 rounded-lg text-xs font-bold transition-all shadow-lg active:scale-95 cursor-pointer"
            >
              Confirmar Ajustes
            </button>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {showConfirmSave && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl w-full max-w-md p-8 shadow-2xl border border-slate-200">
            <div className="w-16 h-16 bg-emerald-100 rounded-2xl flex items-center justify-center mb-6 mx-auto">
              <Zap className="w-8 h-8 text-emerald-600" />
            </div>
            <h3 className="text-xl font-bold text-slate-800 text-center mb-2">Confirmar Atualização</h3>
            <p className="text-slate-500 text-center text-sm mb-8">
              Ao confirmar, as novas regras serão aplicadas instantaneamente e sobrescreverão as configurações anteriores no código. A aplicação será atualizada.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setShowConfirmSave(false)}
                className="py-3 px-4 rounded-xl text-sm font-bold text-slate-500 hover:bg-slate-50 border border-slate-200 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveConfig}
                className="py-3 px-4 rounded-xl text-sm font-bold bg-slate-900 text-white hover:bg-slate-800 transition-all shadow-md active:scale-95"
              >
                Publicar Alterações
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SECTION 3: SYSTEM SYNCHRONIZATION TOOLS */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <button
          type="button"
          onClick={() => toggleSection("sync")}
          className="w-full flex items-center justify-between p-5 bg-slate-50 hover:bg-slate-100/50 transition-colors text-left border-b border-slate-150 cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-50 rounded-xl">
              <Globe className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-800">
                3. Testes de Sincronização e Health-Check do Site
              </h3>
              <p className="text-slate-550 text-[11px] mt-0.5 font-medium">
                Valide se a conexão com os Endpoints do WordPress está funcionando corretamente.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] bg-indigo-100 text-indigo-800 font-extrabold px-2.5 py-0.5 rounded-full uppercase">
              Ferramentas
            </span>
            {expandedSection === "sync" ? (
              <ChevronUp className="w-4 h-4 text-slate-405" />
            ) : (
              <ChevronDown className="w-4 h-4 text-slate-405" />
            )}
          </div>
        </button>

        {expandedSection === "sync" && (
          <div className="p-6 space-y-6">
            
            {/* BRAND SELECTOR TABS FOR TESTING */}
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4.5 space-y-4">
              <div className="text-left">
                <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest block mb-1">
                  Selecione a Marca para Testar a Conexão
                </span>
              </div>

              <div className="grid grid-cols-3 bg-white p-1 rounded-xl border border-slate-200 shadow-inner">
                {(config.brands || []).map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => {
                      setActiveSyncBrand(b.id);
                      setSiteStatus(null);
                    }}
                    className={`py-2 text-xs font-bold rounded-lg transition-all cursor-pointer text-center ${
                      activeSyncBrand === b.id
                        ? "bg-slate-800 text-white shadow-xs"
                        : "text-slate-550 hover:bg-slate-50 hover:text-slate-800"
                    }`}
                  >
                    {b.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Test Action for Active Brand */}
            {activeBrandConfig && (
              <div className="border border-slate-200 rounded-2xl p-5 space-y-4 bg-white shadow-2xs relative">
                <div className="flex items-center justify-between pb-3 border-b border-slate-150">
                  <h4 className="font-bold text-xs text-slate-800 flex items-center gap-1.5 uppercase">
                    <Activity className="w-4 h-4 text-emerald-600" />
                    Health Check: {activeBrandConfig.name}
                  </h4>
                </div>

                <div className="bg-emerald-50/20 p-4 rounded-xl border border-emerald-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div className="text-left">
                    <p className="text-xs font-bold text-slate-700">Validar endpoint atual:</p>
                    <code className="text-[10px] text-emerald-700 break-all font-mono">
                      {activeBrandConfig.siteApiUrl || "Nenhuma URL configurada"}
                    </code>
                  </div>

                  <button
                    type="button"
                    onClick={handleTestSiteSync}
                    disabled={siteLoading || !activeBrandConfig.siteApiUrl}
                    className="bg-slate-900 hover:bg-slate-800 transition-colors text-white font-bold text-xs py-2 px-6 rounded-xl flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 shadow-md"
                  >
                    {siteLoading ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Validando...
                      </>
                    ) : (
                      <>
                        <RefreshCcw className="w-3.5 h-3.5" />
                        Testar Agora
                      </>
                    )}
                  </button>
                </div>

                {siteStatus && (
                  <div className={`p-4 rounded-xl border flex items-start gap-2.5 text-xs animate-in zoom-in-95 duration-200 ${siteStatus.success ? "bg-emerald-50 text-emerald-800 border-emerald-150" : "bg-rose-50 text-rose-800 border-rose-150"}`}>
                    {siteStatus.success ? <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" /> : <XCircle className="w-4 h-4 text-rose-600 mt-0.5 shrink-0" />}
                    <div className="space-y-0.5">
                      <p className="font-bold">{siteStatus.message}</p>
                      {siteStatus.details && <p className="text-[10px] opacity-85 font-semibold font-mono leading-tight mt-1">{siteStatus.details}</p>}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* SECTION 4: META BUSINESS SUITE API */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <button
          type="button"
          onClick={() => toggleSection("meta")}
          className="w-full flex items-center justify-between p-5 bg-slate-50 hover:bg-slate-100/50 transition-colors text-left border-b border-slate-150 cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-50 rounded-xl">
              <MessageCircle className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-800">
                4. Autenticação Global da Meta Business Suite
              </h3>
              <p className="text-slate-550 text-[11px] mt-0.5 font-medium">
                Configure o Token de Acesso de usuário de sistema para permitir envios via Cloud API.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] bg-blue-100 text-blue-800 font-extrabold px-2.5 py-0.5 rounded-full uppercase">
              Chave Mestre
            </span>
            {expandedSection === "meta" ? (
              <ChevronUp className="w-4 h-4 text-slate-405" />
            ) : (
              <ChevronDown className="w-4 h-4 text-slate-405" />
            )}
          </div>
        </button>

        {expandedSection === "meta" && (
          <div className="p-6">
            <div className="bg-blue-50/30 border border-blue-100 rounded-2xl p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Zap className="w-4 h-4 text-blue-600" />
                </div>
                <h4 className="text-xs font-bold text-blue-800 uppercase tracking-wider">Configuração de Autenticação Principal</h4>
              </div>
              
              <div>
                <label className="block text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-2">
                  System User Access Token (Meta Permanent Token)
                </label>
                <input
                  type="password"
                  value={config.metaAccessToken || ""}
                  onChange={(e) => handleChange("metaAccessToken", e.target.value)}
                  className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 font-mono shadow-sm"
                  placeholder="EAAGX... (Token que não expira)"
                />
                <div className="mt-2 flex items-start gap-2">
                  <Activity className="w-3 h-3 text-blue-500 mt-0.5" />
                  <p className="text-[10px] text-slate-500 leading-relaxed font-medium">
                    Este token é compartilhado por todas as marcas e permite que o sistema dispare mensagens templates aprovados na sua Business Account.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* SECTION 5: ACCESS MANAGEMENT */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <button
          type="button"
          onClick={() => setExpandedSection(expandedSection === "access" ? null : "access")}
          className="w-full flex items-center justify-between p-5 bg-slate-50 hover:bg-slate-100/50 transition-colors text-left cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-50 rounded-xl relative">
              <Users className="w-5 h-5 text-indigo-600" />
              {accessRequests.length > 0 && (
                <span className="absolute -top-1 -right-1 flex h-3 w-3 items-center justify-center rounded-full bg-red-500 text-[8px] font-bold text-white">
                  {accessRequests.length}
                </span>
              )}
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-800">
                Gestão de Acessos
              </h3>
              <p className="text-slate-500 text-[11px] mt-0.5 font-medium">
                Reveja e aprove solicitações de acesso de administradores e usuários.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {accessRequests.length > 0 && (
              <span className="text-[10px] bg-red-100 text-red-800 font-extrabold px-2 py-0.5 rounded-full uppercase">
                {accessRequests.length} Pendentes
              </span>
            )}
            {expandedSection === "access" ? (
              <ChevronUp className="w-4 h-4 text-slate-405" />
            ) : (
              <ChevronDown className="w-4 h-4 text-slate-405" />
            )}
          </div>
        </button>

        {expandedSection === "access" && (
          <div className="p-6 border-t border-slate-150">
            <h4 className="text-xs font-bold text-slate-800 mb-4 uppercase tracking-wide">Solicitações Pendentes</h4>
            {accessRequests.length === 0 ? (
              <div className="text-center p-6 bg-slate-50 border border-slate-100 rounded-xl">
                <CheckCircle2 className="w-6 h-6 text-slate-300 mx-auto mb-2" />
                <p className="text-sm font-medium text-slate-500">Nenhuma solicitação pendente.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {accessRequests.map((req, idx) => (
                  <div key={idx} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-white border border-slate-200 rounded-xl shadow-sm gap-4">
                    <div>
                      <div className="font-bold text-sm text-slate-800 flex items-center gap-2">
                        {req.name}
                        <span className="bg-slate-100 text-slate-500 text-[10px] px-2 py-0.5 rounded-full font-medium">Conta Google</span>
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">{req.email}</div>
                      <div className="text-[10px] text-slate-400 mt-1">Solicitado em: {new Date(req.date).toLocaleString()}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleRejectAccess(req.email)}
                        className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        Rejeitar
                      </button>
                      <button
                        onClick={() => handleApproveAccess(req.email, 'user')}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-lg transition-colors border border-indigo-200 shadow-sm"
                      >
                        <UserPlus className="w-3.5 h-3.5" />
                        Aprovar como Usuário
                      </button>
                      <button
                        onClick={() => handleApproveAccess(req.email, 'admin')}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-lg transition-colors border border-emerald-200 shadow-sm"
                      >
                        <Building2 className="w-3.5 h-3.5" />
                        Aprovar como Admin
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            
            <div className="mt-8">
              <h4 className="text-xs font-bold text-slate-800 mb-3 uppercase tracking-wide">Administradores Atuais</h4>
              <div className="flex flex-wrap gap-2 mb-6">
                {(config.adminEmails || []).map((email, idx) => (
                  <span key={idx} className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-medium px-2.5 py-1 rounded-lg">
                    {email}
                  </span>
                ))}
              </div>

              <h4 className="text-xs font-bold text-slate-800 mb-3 uppercase tracking-wide">Usuários Atuais</h4>
              <div className="flex flex-wrap gap-2">
                {(config.userEmails || []).map((email, idx) => (
                  <span key={idx} className="bg-indigo-50 border border-indigo-200 text-indigo-800 text-[11px] font-medium px-2.5 py-1 rounded-lg">
                    {email}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
