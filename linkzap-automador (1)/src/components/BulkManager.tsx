import { useState, useEffect, useRef } from "react";
import { Product, GlobalConfig, BRAND_DEFAULT_PHONES } from "../types";
import { generateWhatsAppLink } from "../utils/linkGenerator";
import { getTerms, syncDevelopments } from "../utils/apiClient";
import { 
  FileDown, 
  Check, 
  AlertCircle, 
  RefreshCw, 
  Cpu, 
  Layers, 
  Copy, 
  ExternalLink, 
  Globe, 
  PhoneCall,
  FileSpreadsheet,
  Trash2
} from "lucide-react";

// Official API configuration
interface BulkManagerProps {
  products: Product[];
  config: GlobalConfig;
  onImport: (importedProducts: Omit<Product, "clicks" | "createdAt" | "id">[]) => void;
}

export default function BulkManager({ products, config, onImport }: BulkManagerProps) {
  // 1. Core definitions
  const [selectedBrand, setSelectedBrand] = useState<string>("direcional");
  const [phoneType, setPhoneType] = useState<"ga" | "sdr">("ga");
  const [sourceMode, setSourceMode] = useState<"api" | "excel">("api");
  const [scopeMode, setScopeMode] = useState<"all" | "selected">("all");
  const [refreshTrigger, setRefreshTrigger] = useState<number>(0);
  const bypassNextFetchRef = useRef<boolean>(false);
  
  // 2. Mock API request lifecycle
  const [apiProducts, setApiProducts] = useState<any[]>([]);
  const [isApiLoading, setIsApiLoading] = useState<boolean>(false);
  
  // 3. Excel paste inputs state
  const [excelInputText, setExcelInputText] = useState<string>("");
  const [excelProducts, setExcelProducts] = useState<any[]>([]);
  
  // 4. Combined selection checklist state
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  
  // 5. Generation Output State
  const [generatedResults, setGeneratedResults] = useState<any[]>([]);
  const [copiedStates, setCopiedStates] = useState<{ [key: string]: boolean }>({});
  const [statusMsg, setStatusMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  // Identify active brand config and corresponding phone dynamically
  const brandConfig = config.brands?.find(b => b.id === selectedBrand) || config.brands?.[0];
  const activePhone = brandConfig
    ? (phoneType === "ga" ? brandConfig.phone : brandConfig.sdrPhone || brandConfig.phone)
    : (phoneType === "ga" ? "553140200400" : "553198396041");

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

  const siteApiUrl = brandConfig?.siteApiUrl || (
    selectedBrand === "direcional" ? "https://www.direcional.com.br/wp-json/wp/v2/empreendimento" :
    selectedBrand === "riva" ? "https://www.rivaincorporadora.com.br/wp-json/wp/v2/empreendimento" :
    "https://abyta.com.br/wp-json/wp/v2/enterprise/"
  );

  const [wpStatusFilter, setWpStatusFilter] = useState<{id: string | number, taxonomy: string}>({id: "all", taxonomy: "filtros_top"});
  const [availableWpStatuses, setAvailableWpStatuses] = useState<{id: number, name: string, slug: string, taxonomy: string}[]>([]);
  const [wpRegionalFilter, setWpRegionalFilter] = useState<string>("all");
  const [availableWpRegionals, setAvailableWpRegionals] = useState<{id: number, name: string, slug: string}[]>([]);
  const [activeMessageType, setActiveMessageType] = useState<"info" | "finance">("info");

  // Fetch available filtros_top and regional_comercial terms from WP
  useEffect(() => {
    const fetchTermsForBulk = async () => {
      if (!siteApiUrl) return;

      const bypass = bypassNextFetchRef.current;
      try {
        const [ftTerms, stTerms, regTerms] = await Promise.all([
          getTerms({
            siteApiUrl: siteApiUrl,
            taxonomy: "filtros_top",
            siteAccessToken: brandConfig?.siteAccessToken || config.siteAccessToken,
            bypassCache: bypass
          }),
          getTerms({
            siteApiUrl: siteApiUrl,
            taxonomy: "status_tag",
            siteAccessToken: brandConfig?.siteAccessToken || config.siteAccessToken,
            bypassCache: bypass
          }),
          getTerms({
            siteApiUrl: siteApiUrl,
            taxonomy: "regional_comercial",
            siteAccessToken: brandConfig?.siteAccessToken || config.siteAccessToken,
            bypassCache: bypass
          })
        ]);

        let combined: any[] = [];
        if (Array.isArray(ftTerms)) combined = [...combined, ...ftTerms.map(item => ({ ...item, taxonomy: "filtros_top" }))];
        if (Array.isArray(stTerms)) combined = [...combined, ...stTerms.map(item => ({ ...item, taxonomy: "status_tag" }))];

        // Deduplicate and map statuses
        const uniqueStatuses = Array.from(new Map(combined.map(item => [item.id, item])).values());
        setAvailableWpStatuses(uniqueStatuses.map(item => ({ id: item.id, name: item.name, slug: item.slug, taxonomy: item.taxonomy })));

        // Handle Regionals
        if (Array.isArray(regTerms)) {
          setAvailableWpRegionals(regTerms.map(item => ({ id: item.id, name: item.name, slug: item.slug })));
        } else {
          setAvailableWpRegionals([]);
        }
      } catch (e) {
        console.error("Erro ao buscar termos:", e);
      }
    };
    if (sourceMode === "api") fetchTermsForBulk();
  }, [selectedBrand, sourceMode, siteApiUrl, config.siteAccessToken, brandConfig, refreshTrigger]);

  // Ensure that Abytá cannot use SDR if it's not configured in settings
  useEffect(() => {
    const brand = config.brands?.find(b => b.id === "abyta");
    const hasAbytaSdr = brand && brand.sdrPhone && brand.sdrPhone.trim() !== "";
    if (selectedBrand === "abyta" && !hasAbytaSdr && phoneType === "sdr") {
      setPhoneType("ga");
    }
  }, [selectedBrand, phoneType, config]);

  // Fetch/load developments from designated API
  useEffect(() => {
    if (sourceMode === "api") {
      setIsApiLoading(true);
      setGeneratedResults([]); 
      
      const fetchOfficialData = async () => {
        const bypass = bypassNextFetchRef.current;
        try {
          const data = await syncDevelopments({
            siteApiUrl: siteApiUrl,
            siteAccessToken: brandConfig?.siteAccessToken || config.siteAccessToken,
            brandId: selectedBrand,
            wpStatus: String(wpStatusFilter.id),
            wpStatusTaxonomy: wpStatusFilter.taxonomy,
            regionalComercial: wpRegionalFilter,
            bypassCache: bypass
          });

          if (data && data.success && Array.isArray(data.apiResponse)) {
            const formatted = data.apiResponse
              .filter((item: any) => {
                const ftRaw = item.filtros_top;
                let ftName = "";
                
                if (Array.isArray(ftRaw)) {
                  const embeddedTerms = item._embedded?.["wp:term"];
                  if (Array.isArray(embeddedTerms)) {
                    const ftTerms = embeddedTerms.flat().filter((t: any) => 
                      t.taxonomy === "filtros_top" || 
                      t.taxonomy === "status_tag" || 
                      t.taxonomy === "tipo_venda" || 
                      t.taxonomy === "etapa_obra"
                    );
                    if (ftTerms.length > 0) {
                      ftName = ftTerms.map((t: any) => t.name).join(" ");
                    }
                  }
                  if (!ftName) {
                    ftName = ftRaw.map((t: any) => (typeof t === "object" ? (t.name || "") : t)).join(" ");
                  }
                } else {
                  ftName = String(ftRaw || "");
                }

                const ftLower = ftName.toLowerCase();
                return !ftLower.includes("portfolio") && !ftLower.includes("vendido") && !ftLower.includes("vendida");
              })
              .map((item: any, idx: number) => {
                const title = item.title?.rendered && typeof item.title.rendered === "string" 
                  ? item.title.rendered.replace(/&#8211;/g, "-").replace(/&#8217;/g, "'").replace(/&amp;/g, "&")
                  : (item.title || "Empreendimento");

                let statusText = "Em breve";
                const ftRaw = item.filtros_top;
                
                const embeddedTerms = item._embedded?.["wp:term"];
                if (Array.isArray(embeddedTerms)) {
                  const ftTerms = embeddedTerms.flat().filter((t: any) => 
                    t.taxonomy === "filtros_top" || 
                    t.taxonomy === "status_tag" || 
                    t.taxonomy === "tipo_venda" || 
                    t.taxonomy === "etapa_obra"
                  );
                  if (ftTerms.length > 0) {
                    statusText = ftTerms.map((t: any) => t.name).join(", ");
                  }
                }

                if (statusText === "Em breve" && ftRaw) {
                  if (Array.isArray(ftRaw)) {
                    const names = ftRaw.map((t: any) => typeof t === "object" ? (t.name || "") : (typeof t === "string" ? t : "")).filter(Boolean);
                    if (names.length > 0) statusText = names.join(", ");
                  } else if (typeof ftRaw === "string" && ftRaw.length > 1) {
                     statusText = ftRaw;
                  }
                }

                let cidadeText = "Não informado";
                if (item._embedded?.["wp:term"]) {
                  const cityTerms = item._embedded["wp:term"].flat().filter((t: any) => t.taxonomy === "cidade" || t.taxonomy === "cidades");
                  if (cityTerms.length > 0) {
                    cidadeText = cityTerms.map((t: any) => t.name).join(", ");
                  }
                }

                if (cidadeText === "Não informado" && item.cidade) {
                  if (Array.isArray(item.cidade)) {
                    cidadeText = item.cidade.map((t: any) => typeof t === "object" ? (t.name || "") : t).join(", ");
                  } else {
                    cidadeText = String(item.cidade);
                  }
                }

                let regionalText = "";
                if (item._embedded?.["wp:term"]) {
                  const regTerms = item._embedded["wp:term"].flat().filter((t: any) => t.taxonomy === "regional_comercial");
                  if (regTerms.length > 0) {
                    regionalText = regTerms.map((t: any) => t.name).join(", ");
                  }
                }

                return {
                  id: `site-api-${item.id || idx}`,
                  name: title,
                  cidade: cidadeText,
                  bairro: item.bairro || "",
                  category: statusText,
                  description: `Sincronizado oficialmente via API do WordPress.`,
                  brandId: selectedBrand,
                  regional: regionalText || ""
                };
              });
            setApiProducts(formatted);
            setSelectedProductIds(formatted.map((p: any) => p.id));
          } else {
            setApiProducts([]);
          }
        } catch (error) {
          console.error("Erro ao buscar API no BulkManager:", error);
          setApiProducts([]);
        } finally {
          setIsApiLoading(false);
          bypassNextFetchRef.current = false;
        }
      };

      fetchOfficialData();
    }
  }, [selectedBrand, sourceMode, siteApiUrl, config.siteAccessToken, brandConfig, wpStatusFilter, wpRegionalFilter, refreshTrigger]);

  // Handle excel text parsing
  const handleParseExcel = () => {
    if (!excelInputText.trim()) {
      setStatusMsg({ type: "error", text: "Cole os dados copiados de uma planilha Excel ou Google Sheets primeiro!" });
      return;
    }

    try {
      const lines = excelInputText.split(/\r?\n/).filter(line => line.trim() !== "");
      if (lines.length === 0) {
        setStatusMsg({ type: "error", text: "Nenhuma linha válida encontrada no texto colado!" });
        return;
      }

      const parsed: any[] = [];
      lines.forEach((line, index) => {
        // Detect headers and skip them if matched
        if (index === 0 && (
          line.toLowerCase().includes("empreendimento") || 
          line.toLowerCase().includes("nome") || 
          line.toLowerCase().includes("produto")
        )) {
          return;
        }

        let cols = line.split("\t");
        if (cols.length <= 1) {
          cols = line.split(";");
        }
        if (cols.length <= 1) {
          cols = line.split(",");
        }

        const name = cols[0]?.trim() || `Empreendimento ${index + 1}`;
        const cidade = cols[1]?.trim() || "Belo Horizonte";
        const bairro = cols[2]?.trim() || "Centro";
        const category = cols[3]?.trim() || "Residencial";

        parsed.push({
          id: `excel-row-${index}-${Date.now()}`,
          name,
          cidade,
          bairro,
          category,
          description: `Importado de planilha em lote o respectivo condomínio ${name}.`,
          brandId: selectedBrand
        });
      });

      if (parsed.length === 0) {
        setStatusMsg({ type: "error", text: "Não foi possível extrair colunas válidas. Certifique-se de copiar as células corretamente do Excel." });
        return;
      }

      setExcelProducts(parsed);
      setSelectedProductIds(parsed.map(p => p.id));
      setGeneratedResults([]); // Clear output
      setStatusMsg({ type: "success", text: `${parsed.length} empreendimentos processados do Excel! Defina o canal acima e clique em Calcular e Gerar.` });
      setTimeout(() => setStatusMsg(null), 5000);
    } catch (e: any) {
      setStatusMsg({ type: "error", text: `Falha ao processar planilha: ${e.message || e}` });
    }
  };

  // Clear parsed excel inputs
  const handleClearExcelData = () => {
    setExcelInputText("");
    setExcelProducts([]);
    setSelectedProductIds([]);
    setGeneratedResults([]);
  };

  // Handle toggling single checkbox for a development
  const handleToggleProduct = (id: string) => {
    setSelectedProductIds(prev => 
      prev.includes(id) ? prev.filter(pId => pId !== id) : [...prev, id]
    );
  };

  const activeProductsList = sourceMode === "api" ? apiProducts : excelProducts;

  const handleSelectAll = () => {
    setSelectedProductIds(activeProductsList.map(p => p.id));
  };

  const handleClearSelection = () => {
    setSelectedProductIds([]);
  };

  // Perform bulk calculation of links
  const handleGenerateBatch = () => {
    try {
      const targetList = scopeMode === "all" 
        ? activeProductsList 
        : activeProductsList.filter(p => selectedProductIds.includes(p.id));

      if (targetList.length === 0) {
        setStatusMsg({ type: "error", text: "Nenhum empreendimento selecionado para gerar os links de WhatsApp!" });
        return;
      }

      if (!activePhone || !activePhone.trim()) {
        setStatusMsg({ type: "error", text: "O número de telefone correspondente ao canal selecionado não está configurado!" });
        return;
      }

      const results = targetList.map(item => {
        // Find if this product already exists in local catalog to get real clicks and createdAt
        const existingProduct = products?.find(p => p.id === item.id || p.name.toLowerCase() === item.name.toLowerCase());

        // Build simulated temporary Product context
        const tempProduct: Product = {
          id: item.id,
          name: item.name,
          cidade: item.cidade,
          bairro: item.bairro,
          category: item.category,
          description: item.description,
          clicks: existingProduct ? existingProduct.clicks : 0,
          brandId: selectedBrand,
          customPhone: activePhone,
          createdAt: existingProduct ? existingProduct.createdAt : new Date().toISOString()
        };

        const linkInfo = generateWhatsAppLink(tempProduct, config, "info", phoneType);
        const linkFinance = generateWhatsAppLink(tempProduct, config, "finance", phoneType);

        return {
          product: tempProduct,
          linkInfo,
          linkFinance
        };
      });

      setGeneratedResults(results);
      setStatusMsg({ type: "success", text: `Links em Lote gerados! Exibindo ${results.length} pacotes de contatos prontos para copiar.` });
      setTimeout(() => setStatusMsg(null), 5000);
    } catch (e: any) {
      setStatusMsg({ type: "error", text: `Erro na geração em lote: ${e.message || e}` });
    }
  };

  // Helper inside sheet to copy and trigger analytics if needed
  const copyToClipboard = (text: string, keyId: string, eventObj: { product: Product, type: "info" | "finance" }) => {
    navigator.clipboard.writeText(text);
    setCopiedStates(prev => ({ ...prev, [keyId]: true }));
    
    setTimeout(() => {
      setCopiedStates(prev => ({ ...prev, [keyId]: false }));
    }, 2000);
  };

  // Helper to open link in a new tab (simulate user click test)
  const testLinkDirectly = (url: string, eventObj: { product: Product, type: "info" | "finance" }) => {
    window.open(url, "_blank", "noopener,noreferrer");
  };

  // Format dates elegantly for reports in PT-BR style
  const formatDateForReport = (dateStr: string | undefined) => {
    if (!dateStr) return "";
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear();
      const hours = String(d.getHours()).padStart(2, '0');
      const minutes = String(d.getMinutes()).padStart(2, '0');
      const seconds = String(d.getSeconds()).padStart(2, '0');
      return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
    } catch {
      return dateStr;
    }
  };

  // Export calculated batch links list directly to standard UTF-8 CSV
  const handleExportBatchCSV = () => {
    try {
      if (generatedResults.length === 0) return;

      const csvHeaders = [
        "Nome do Empreendimento",
        "Cidade",
        "Bairro",
        "Marca",
        "Canal de Atendimento",
        "Telefone Configurado",
        "Link Atendimento (Informações)",
        "Link Simulação (Financeiro)",
        "Data de Criação",
        "Cliques Simulados"
      ];

      const csvRows = generatedResults.map(res => {
        return [
          res.product.name,
          res.product.cidade,
          res.product.bairro,
          selectedBrand.toUpperCase(),
          phoneType === "ga" ? "Gestão de Atendimento (GA)" : "Venda Direta (SDR)",
          activePhone,
          res.linkInfo,
          res.linkFinance,
          formatDateForReport(res.product.createdAt),
          String(res.product.clicks || 0)
        ].map(val => `"${(val || "").replace(/"/g, '""')}"`).join(";"); // Semicolon is the best delimitator for Portuguese regional Excel/Sheets imports
      });

      const csvContent = "\ufeff" + [csvHeaders.join(";"), ...csvRows].join("\n");
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `lote_reporte_sheets_${selectedBrand}_${phoneType}_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      setStatusMsg({ type: "success", text: "Relatório CSV em lote para Google Sheets exportado com sucesso!" });
      setTimeout(() => setStatusMsg(null), 5500);
    } catch (e: any) {
      alert(`Falha ao exportar lote: ${e.message}`);
    }
  };

  // Copy batch rows in direct TSV format, which is the absolute gold standard for pasting directly into an active Google Sheet or Excel
  const [copiedBatchState, setCopiedBatchState] = useState<boolean>(false);
  const handleCopyBatchToClipboard = () => {
    try {
      if (generatedResults.length === 0) return;

      const headers = [
        "Nome do Empreendimento",
        "Cidade",
        "Bairro",
        "Marca",
        "Canal de Atendimento",
        "Telefone Configurado",
        "Link Atendimento (Informações)",
        "Link Simulação (Financeiro)",
        "Data de Criação",
        "Cliques Simulados"
      ];

      const rows = generatedResults.map(res => {
        return [
          res.product.name,
          res.product.cidade,
          res.product.bairro,
          selectedBrand.toUpperCase(),
          phoneType === "ga" ? "Gestão de Atendimento (GA)" : "Venda Direta (SDR)",
          activePhone,
          res.linkInfo,
          res.linkFinance,
          formatDateForReport(res.product.createdAt),
          String(res.product.clicks || 0)
        ].join("\t"); // Tab separation translates directly to cell blocks on Ctrl+V
      });

      const fullText = [headers.join("\t"), ...rows].join("\n");
      navigator.clipboard.writeText(fullText);
      setCopiedBatchState(true);
      setStatusMsg({ type: "success", text: "Tabela em lote de reporte copiada! Vá ao seu Google Sheets e utilize Ctrl+V para colar perfeitamente." });
      setTimeout(() => {
        setCopiedBatchState(false);
        setStatusMsg(null);
      }, 5500);
    } catch (e: any) {
      alert(`Falha ao copiar lote para a área de transferência: ${e.message}`);
    }
  };

  return (
    <div className="space-y-6" id="bulk-manager-panel">
      {/* Introduction Banner header */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between pb-4 mb-4 border-b border-slate-150 gap-4">
          <div>
            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <Layers className="w-5 h-5 text-emerald-600" />
              Geração de Links - Catálogo de Empreendimentos
            </h2>
            <p className="text-slate-500 text-xs mt-0.5">
              Defina as regras unificadas de telefones GA/SDR por marca e gere múltiplos links wa.me limpos e parametrizados de uma só vez.
            </p>
          </div>
        </div>

        {/* 1. CONFIGURATION STEPS GRID */}
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3 gap-5 lg:gap-6">
          
          {/* Step 1: Select Brand/Enterprise */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3.5">
            <div className="flex items-center gap-2 mb-1">
              <span className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center text-[10px] font-bold text-emerald-800">
                1
              </span>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">Selecione a Marca</h3>
            </div>
            
            <p className="text-[10px] text-slate-500">
              Escolha a empresa para herdar as configurações de telefones padrões:
            </p>

            <div className="space-y-2">
              {(config.brands || []).map(brand => (
                <button
                  key={brand.id}
                  type="button"
                  onClick={() => setSelectedBrand(brand.id)}
                  className={`w-full text-left p-3 rounded-lg border text-xs font-bold transition-all flex items-center justify-between cursor-pointer ${
                    selectedBrand === brand.id
                      ? "bg-emerald-50 text-emerald-900 border-emerald-300 shadow-2xs"
                      : "bg-white hover:bg-slate-50 text-slate-600 border-slate-200"
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    <Globe className={`w-3.5 h-3.5 ${selectedBrand === brand.id ? "text-emerald-600" : "text-slate-400"}`} />
                    {brand.name}
                  </span>
                  {selectedBrand === brand.id && <span className="text-[9px] font-mono text-emerald-600 font-extrabold flex items-center gap-1">✓ Ativa</span>}
                </button>
              ))}
            </div>

            <div className="bg-white/80 p-2.5 rounded-lg border border-slate-150 text-[10.5px] space-y-1">
              <div>
                <span className="text-slate-400 font-semibold uppercase text-[9px]">API do Site:</span>
                <span className="block font-mono text-[9px] text-slate-650 truncate" title={siteApiUrl}>{siteApiUrl}</span>
              </div>
            </div>
          </div>

          {/* Step 2: TARGET PHONE ROUTING SELECTOR */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3.5">
            <div className="flex items-center gap-2 mb-1">
              <span className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center text-[10px] font-bold text-emerald-800">
                2
              </span>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">Seletor de Canal de Atendimento</h3>
            </div>
            
            <p className="text-[10px] text-slate-500">
              Escolha para qual canal direcionar os links em lote (GA ou SDR):
            </p>

            <div className="bg-white p-1 rounded-lg flex flex-col gap-1.5 border border-slate-205 shadow-inner">
              <button
                type="button"
                onClick={() => setPhoneType("ga")}
                className={`w-full py-2 text-[11px] font-bold rounded-md text-center transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                  phoneType === "ga"
                    ? "bg-emerald-600 text-white shadow-xs"
                    : "text-slate-600 hover:text-slate-800 hover:bg-slate-50"
                }`}
              >
                <span>📞 Geral / GA</span>
                <span className="font-mono text-[10px] font-semibold opacity-90">({brandConfig ? formatPhoneLabel(brandConfig.phone) : ""})</span>
              </button>
              
              <button
                type="button"
                disabled={selectedBrand === "abyta" && (!brandConfig?.sdrPhone || brandConfig.sdrPhone.trim() === "")}
                onClick={() => setPhoneType("sdr")}
                className={`w-full py-2 text-[11px] font-bold rounded-md text-center transition-all flex items-center justify-center gap-1.5 ${
                  selectedBrand === "abyta" && (!brandConfig?.sdrPhone || brandConfig.sdrPhone.trim() === "")
                    ? "opacity-40 cursor-not-allowed text-slate-400 bg-slate-50"
                    : phoneType === "sdr"
                    ? "bg-slate-800 text-white shadow-xs"
                    : "text-slate-650 hover:text-slate-850 hover:bg-slate-55 cursor-pointer"
                }`}
                title={selectedBrand === "abyta" && (!brandConfig?.sdrPhone || brandConfig.sdrPhone.trim() === "") ? "SDR indisponível para Abytá" : ""}
              >
                <span>💬 Vendedor / SDR</span>
                <span>
                  {selectedBrand === "abyta" && (!brandConfig?.sdrPhone || brandConfig.sdrPhone.trim() === "")
                    ? "🚫 Indisponível"
                    : `(${brandConfig?.sdrPhone ? formatPhoneLabel(brandConfig.sdrPhone) : "Vazio"})`}
                </span>
              </button>
            </div>

            <div className="space-y-1.5 pt-1">
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide">
                Número do Lote Ativo
              </label>
              
              <div className="bg-white border border-slate-200 rounded-lg p-2.5 flex items-center justify-between shadow-xs">
                <div className="flex items-center gap-2">
                  <PhoneCall className="w-3.5 h-3.5 text-emerald-600 animate-pulse" />
                  <span className="font-mono text-xs font-bold text-slate-800">
                    {formatPhoneLabel(activePhone)}
                  </span>
                </div>
                <span className="text-[8px] font-extrabold uppercase bg-emerald-50 text-emerald-700 border border-emerald-150 px-1.5 py-0.5 rounded">
                  ATUAL
                </span>
              </div>
            </div>
          </div>

          {/* Step 3: CHOOSE DATA SOURCE & ENTERPRISES */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3.5">
            <div className="flex items-center gap-2 mb-1">
              <span className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center text-[10px] font-bold text-emerald-800">
                3
              </span>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">Origem dos Imóveis</h3>
            </div>
            
            <p className="text-[10px] text-slate-500">
              Escolha se prefere ler da API do portal ou colar diretamente de uma planilha do Excel:
            </p>

            {/* Segmented controls of data source */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-1 bg-white p-1 rounded-xl border border-slate-150">
              <button
                type="button"
                onClick={() => { setSourceMode("api"); setScopeMode("all"); }}
                className={`py-1 text-[10.5px] font-bold rounded-lg transition-all cursor-pointer text-center ${
                  sourceMode === "api"
                    ? "bg-emerald-50 text-emerald-800 border border-emerald-100"
                    : "text-slate-500 hover:text-slate-850"
                }`}
              >
                🌐 Sincronizar API
              </button>
              <button
                type="button"
                onClick={() => { setSourceMode("excel"); setScopeMode("all"); }}
                className={`py-1 text-[10.5px] font-bold rounded-lg transition-all cursor-pointer text-center ${
                  sourceMode === "excel"
                    ? "bg-slate-800 text-white border border-slate-700"
                    : "text-slate-500 hover:text-slate-850"
                }`}
              >
                📋 Excel / Sheets
              </button>
            </div>

            {/* Sub-panels for each mode */}
            {sourceMode === "api" ? (
              <div className="space-y-2">
                <div className="space-y-3">
                  <div className="flex items-center justify-between px-1" id="bulk-filter-header">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Filtros da API</span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        id="bulk-clear-selection-btn"
                        onClick={() => {
                          setWpStatusFilter({ id: "all", taxonomy: "filtros_top" });
                          setWpRegionalFilter("all");
                        }}
                        className="text-[10.5px] font-bold text-rose-600 hover:text-rose-800 flex items-center gap-0.5 cursor-pointer bg-transparent border-0 p-0 hover:underline"
                        title="Reseta os filtros de status e regional comercial para todos"
                      >
                        <Trash2 className="w-3 h-3 text-rose-500" />
                        Limpar Filtros
                      </button>
                      <span className="text-slate-200">|</span>
                      <button
                        type="button"
                        id="bulk-force-refresh-btn"
                        onClick={() => {
                          bypassNextFetchRef.current = true;
                          setRefreshTrigger(prev => prev + 1);
                          setStatusMsg({ type: "success", text: "Solicitando dados atualizados diretamente à API do WordPress..." });
                          setTimeout(() => setStatusMsg(null), 3500);
                        }}
                        className="text-[10.5px] font-bold text-emerald-650 hover:text-emerald-800 flex items-center gap-0.5 cursor-pointer bg-transparent border-0 p-0 hover:underline"
                        title="Forçar recarregamento completo ignorando o cache temporário"
                      >
                        <RefreshCw className={`w-3 h-3 text-emerald-500 ${isApiLoading ? 'animate-spin' : ''}`} />
                        Atualizar API
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-2">
                    <select
                      value={wpStatusFilter.id}
                      onChange={(e) => {
                        const selectedId = e.target.value;
                        if (selectedId === "all") {
                          setWpStatusFilter({ id: "all", taxonomy: "filtros_top" });
                        } else {
                          const term = availableWpStatuses.find(s => String(s.id) === selectedId);
                          if (term) setWpStatusFilter({ id: term.id, taxonomy: term.taxonomy });
                        }
                      }}
                      className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-[10.5px] text-slate-700 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-medium w-full"
                      title="Filtrar por Status de Lançamento"
                    >
                      <option value="all">Status Lançamento: Todos</option>
                      {availableWpStatuses.map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                    <select
                      value={wpRegionalFilter}
                      onChange={(e) => setWpRegionalFilter(e.target.value)}
                      className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-xl text-[10.5px] text-slate-700 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-medium w-full"
                      title="Filtrar por Regional Comercial"
                    >
                      <option value="all">Regional Comercial: Todas</option>
                      {availableWpRegionals.map(r => (
                        <option key={r.id} value={r.id}>{r.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="bg-white p-2 rounded-lg border border-slate-200">
                    <label className="block text-[9px] font-bold text-slate-500 uppercase mb-1.5 px-1">Validar Tipo de Mensagem</label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 bg-slate-50 p-1 rounded-md border border-slate-150">
                    <button
                      type="button"
                      onClick={() => setActiveMessageType("info")}
                      className={`py-1 text-[10px] font-bold rounded transition-all text-center ${
                         activeMessageType === "info" ? "bg-white text-emerald-700 shadow-sm border border-slate-200" : "text-slate-500"
                      }`}
                    >
                      ℹ️ Informações
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveMessageType("finance")}
                      className={`py-1 text-[10px] font-bold rounded transition-all text-center ${
                         activeMessageType === "finance" ? "bg-white text-emerald-700 shadow-sm border border-slate-200" : "text-slate-500"
                      }`}
                    >
                      📊 Simulação
                    </button>
                  </div>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setScopeMode("all")}
                    className={`py-1.5 px-2 border rounded-lg text-[10px] font-bold text-center transition-all ${
                      scopeMode === "all"
                        ? "bg-slate-800 text-white border-slate-800"
                        : "bg-white hover:bg-slate-50 text-slate-650 border-slate-150"
                    }`}
                  >
                    Mapear Todos
                  </button>
                  <button
                    type="button"
                    onClick={() => setScopeMode("selected")}
                    className={`py-1.5 px-2 border rounded-lg text-[10px] font-bold text-center transition-all ${
                      scopeMode === "selected"
                        ? "bg-slate-800 text-white border-slate-800"
                        : "bg-white hover:bg-slate-50 text-slate-650 border-slate-155"
                    }`}
                  >
                    Escolher Itens
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setScopeMode("all")}
                    className={`py-1.5 px-2 border rounded-lg text-[10px] font-bold text-center transition-all ${
                      scopeMode === "all"
                        ? "bg-slate-805 text-white border-slate-805"
                        : "bg-white hover:bg-slate-55 text-slate-600 border-slate-150"
                    }`}
                  >
                    Pasted Todos
                  </button>
                  <button
                    type="button"
                    onClick={() => setScopeMode("selected")}
                    className={`py-1.5 px-2 border rounded-lg text-[10px] font-bold text-center transition-all ${
                      scopeMode === "selected"
                        ? "bg-slate-805 text-white border-slate-805"
                        : "bg-white hover:bg-slate-55 text-slate-600 border-slate-150"
                    }`}
                  >
                    Filtrar Itens
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 1.5. EXCEL COPY PASTE ZONE DETAILS */}
        {sourceMode === "excel" && (
          <div className="mt-5 p-4 border border-slate-200 bg-slate-50 rounded-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-150">
              <h4 className="font-bold text-xs text-slate-800 flex items-center gap-1.5">
                <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                Copiar Células do Excel e Colar no Campo Abaixo
              </h4>
              {excelProducts.length > 0 && (
                <button
                  onClick={handleClearExcelData}
                  className="text-[10px] text-rose-600 font-bold hover:underline flex items-center gap-1"
                >
                  <Trash2 className="w-3 h-3" /> Limpar Dados
                </button>
              )}
            </div>

            <p className="text-[10.5px] text-slate-500 leading-normal">
              Copie as colunas desejadas diretamente da sua planilha (ex: <strong>Coluna 1: Nome do Empreendimento</strong>, <strong>Coluna 2: Cidade</strong>, <strong>Coluna 3: Bairro</strong>) e cole no campo de texto abaixo. O sistema separará as linhas automaticamente.
            </p>

            <textarea
              className="w-full h-24 p-3 bg-white border border-slate-200 rounded-xl text-[11px] font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-700"
              placeholder="Exemplo de Conteúdo:&#10;Residencial Harmonia 2	Contagem	Centro&#10;Residencial Gran Ville Cobertura	Belo Horizonte	Buritis"
              value={excelInputText}
              onChange={(e) => setExcelInputText(e.target.value)}
            ></textarea>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleParseExcel}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white font-bold text-[10.5px] rounded-lg cursor-pointer flex items-center gap-1.5 transition-colors"
              >
                <Cpu className="w-3.5 h-3.5" />
                Processar Tabela Colada
              </button>

              {excelProducts.length > 0 && (
                <span className="text-[11px] text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-150 font-semibold">
                  ✓ {excelProducts.length} empreendimentos carregados com sucesso!
                </span>
              )}
            </div>
          </div>
        )}

        {/* 1.6. INTERACTIVE SELECTOR / INTERPRETED CHECKLIST VIEW */}
        <div className="mt-5 bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">Lista de Empreendimentos</span>
              <span className="text-slate-700 text-xs font-bold font-sans">
                {sourceMode === "api" ? "Sincronizado da API Oficial" : "Extraído da Planilha Excel Colada"} • ({activeProductsList.length} itens)
              </span>
            </div>
            
            {scopeMode === "selected" && (
              <div className="flex gap-2">
                <button onClick={handleSelectAll} className="text-[11.5px] text-emerald-700 font-bold hover:underline">Selecionar Todos</button>
                <span className="text-slate-300">|</span>
                <button onClick={handleClearSelection} className="text-[11.5px] text-rose-600 font-bold hover:underline">Deselecionar Todos</button>
              </div>
            )}
          </div>

          <div className="max-h-[170px] overflow-y-auto p-3.5 space-y-2.5 min-h-[110px] bg-slate-50/20">
            {isApiLoading ? (
              <div className="flex flex-col items-center justify-center py-6 space-y-2">
                <RefreshCw className="w-6 h-6 text-emerald-600 animate-spin" />
                <span className="text-xs font-mono font-medium text-slate-500">Buscando do site: {siteApiUrl}...</span>
              </div>
            ) : activeProductsList.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-6 text-center">
                <AlertCircle className="w-6 h-6 text-slate-400 mb-1" />
                <p className="text-xs font-bold text-slate-600">Nenhum empreendimento disponível nesta origem</p>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  {sourceMode === "api" ? "Aguardando sincronização da API" : "Cole as células e clique em Processar Tabela para carregar."}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {activeProductsList.map((prod, idx) => {
                  const isChecked = selectedProductIds.includes(prod.id);
                  const isSelectionDisabled = scopeMode === "all";

                  return (
                    <label
                      key={prod.id || idx}
                      className={`flex items-start gap-3 p-2.5 bg-white rounded-xl border transition-all cursor-pointer select-none text-[11px] ${
                        isSelectionDisabled 
                          ? "border-slate-150 hover:bg-slate-50/50" 
                          : isChecked 
                          ? "border-emerald-300 bg-emerald-50/25 shadow-2xs" 
                          : "border-slate-200 hover:bg-slate-50"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isSelectionDisabled ? true : isChecked}
                        disabled={isSelectionDisabled}
                        onChange={() => handleToggleProduct(prod.id)}
                        className="mt-0.5 rounded text-emerald-600 border-slate-300 focus:ring-emerald-500 h-4 w-4 shrink-0 transition-all"
                      />
                      <div className="truncate flex-1">
                        <div className="font-bold text-slate-800 truncate leading-tight flex items-center justify-between">
                          <span>{prod.name}</span>
                          <span className="text-[8px] bg-emerald-50 text-emerald-700 px-1 rounded border border-emerald-100 uppercase font-extrabold ml-2">{prod.category}</span>
                        </div>
                        <div className="text-[9px] text-slate-500 font-mono mt-0.5 flex items-center gap-1.5">
                          <span>Bairro: {prod.bairro}</span>
                          <span>•</span>
                          <span>{prod.cidade}</span>
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Start generate trigger */}
        <div className="mt-6 pt-5 border-t border-slate-150 flex flex-col sm:flex-row items-center justify-between gap-4 bg-gradient-to-r from-emerald-500/5 to-slate-900/5 p-4 rounded-xl border border-slate-200">
          <div className="text-left space-y-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[9px] bg-slate-800 text-white font-mono font-bold px-2 py-0.5 rounded uppercase">Roteador em Lote</span>
              <span className="text-[10px] text-emerald-800 font-bold uppercase bg-emerald-100/55 border border-emerald-250 px-1.5 rounded">
                Canal Selecionado: {phoneType.toUpperCase()}
              </span>
            </div>
            <p className="text-xs font-bold text-slate-800 font-sans">
              Gerar links para {scopeMode === "all" ? activeProductsList.length : selectedProductIds.length} imóveis apontando para {formatPhoneLabel(activePhone)}
            </p>
          </div>

          <button
            onClick={handleGenerateBatch}
            disabled={isApiLoading || activeProductsList.length === 0}
            className="w-full sm:w-auto px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 cursor-pointer shadow-sm transition-all disabled:opacity-50"
          >
            <Cpu className="w-4 h-4 animate-spin-slow" />
            Calcular e Gerar Links em Lote
          </button>
        </div>

        {statusMsg && (
          <div className={`mt-4 p-3.5 rounded-xl border flex items-start gap-2.5 text-xs ${
            statusMsg.type === "success" 
              ? "bg-emerald-50 border-emerald-100 text-emerald-800" 
              : "bg-rose-50 border-rose-100 text-rose-800"
          }`}>
            {statusMsg.type === "success" ? <Check className="w-4 h-4 mt-0.5 shrink-0" /> : <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />}
            <span className="font-semibold">{statusMsg.text}</span>
          </div>
        )}
      </div>

      {/* 2. BATCH OUTPUT CONTAINER MODULE */}
      {generatedResults.length > 0 && (
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-3.5 border-b border-slate-150 gap-4">
            <div>
              <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                <Check className="w-5 h-5 text-emerald-500 bg-emerald-50 rounded-full p-0.5" />
                Planilha e Roteamentos de Links Calculados
              </h3>
              <p className="text-xs text-slate-450 mt-0.5">
                Utilize as ações rápidas de cópia ou teste individual.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleCopyBatchToClipboard}
                className="flex items-center justify-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition-all cursor-pointer shadow-sm active:scale-95"
                title="Formata o lote atual como string TSV (tab-separated values) para colagem perfeita direta com Ctrl+V no Google Sheets"
              >
                {copiedBatchState ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copiedBatchState ? "TSV Copiado!" : "Copiar em Formato TSV (Google Sheets)"}
              </button>

              <button
                type="button"
                onClick={handleExportBatchCSV}
                className="flex items-center justify-center gap-1.5 px-3.5 py-2 bg-slate-800 hover:bg-slate-900 border border-slate-700 text-white text-xs font-bold rounded-xl transition-all cursor-pointer shadow-xs"
                title="Fazer download de planilha CSV formatada para o Google Sheets"
              >
                <FileDown className="w-4 h-4" />
                Exportar CSV p/ Google Sheets
              </button>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200 uppercase tracking-wider text-[10px]">
                  <th className="p-3">Empreendimento</th>
                  <th className="p-3">Cidade / Bairro</th>
                  <th className="p-3">Telefone</th>
                  <th className="p-3">Link {activeMessageType === "info" ? "ℹ️ Informações" : "📊 Simulação"} (wa.me)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-150 bg-white">
                {generatedResults.map((res, index) => {
                  const resultKey = `link-${index}`;
                  const activeLink = activeMessageType === "info" ? res.linkInfo : res.linkFinance;
                  
                  return (
                    <tr key={index} className="hover:bg-slate-50/50 transition-colors">
                      <td className="p-3 font-semibold text-slate-800">{res.product.name}</td>
                      <td className="p-3 text-slate-550 truncate max-w-[150px]">{res.product.cidade} / {res.product.bairro}</td>
                      <td className="p-3 font-mono text-[10px] font-bold text-slate-600">{formatPhoneLabel(res.product.customPhone)}</td>
                      
                      <td className="p-3">
                        <div className="flex bg-slate-50 rounded-lg border border-slate-200 overflow-hidden w-full max-w-[320px]">
                          <span className="p-1.5 font-mono text-[9px] text-slate-450 truncate flex-grow block">
                            {activeLink}
                          </span>
                          
                          <button
                            type="button"
                            onClick={() => copyToClipboard(activeLink, resultKey, { product: res.product, type: activeMessageType })}
                            className="p-1.5 px-3 border-l border-slate-200 text-slate-500 hover:text-emerald-600 hover:bg-slate-100 shrink-0 transition-all cursor-pointer"
                            title="Copiar link"
                          >
                            {copiedStates[resultKey] ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                          
                          <button
                            type="button"
                            onClick={() => testLinkDirectly(activeLink, { product: res.product, type: activeMessageType })}
                            className="p-1.5 px-3 border-l border-slate-200 text-slate-500 hover:text-blue-600 hover:bg-slate-100 shrink-0 transition-all cursor-pointer"
                            title="Testar Link"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
