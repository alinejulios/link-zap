import React, { useState, useEffect } from "react";
import { Product, GlobalConfig, DEFAULT_GLOBAL_CONFIG, MessageTone, BRAND_DEFAULT_PHONES } from "./types";
import { generateWhatsAppLink, interpolateMessage } from "./utils/linkGenerator";
import { getTerms, syncDevelopments, optimizeCopy } from "./utils/apiClient";
import PhonePreview from "./components/PhonePreview";
import SettingsPanel from "./components/SettingsPanel";
import BulkManager from "./components/BulkManager";
import { LoginScreen } from "./components/LoginScreen";
import { initAppAuth, logout } from "./firebase";
import {
  Smartphone,
  Layers,
  Settings,
  Cpu,
  Database,
  Search,
  Plus,
  Trash2,
  Copy,
  Check,
  Sparkles,
  QrCode,
  ArrowUpRight,
  TrendingUp,
  FileSpreadsheet,
  Edit,
  ExternalLink,
  MessageCircle,
  RefreshCw,
  PhoneCall,
  Download,
  Loader2
} from "lucide-react";

// Initial state is empty as we want to use only official API info as requested
const INITIAL_PRODUCTS: Product[] = [];

const ADMIN_EMAILS = [
  "aline.silva@direcional.com.br",
  "lucas.spessoa@direcional.com.br",
  "sabrina.braga@direcional.com.br",
  "nucleodigital.grupodirecional@gmail.com"
];

const USER_EMAILS = [
  "aline.silva@direcional.com.br",
  "mayara.salomao@direcional.com.br",
  "evelin.rocha@direcional.com.br",
  "lucas.felipe@direcional.com.br",
  "lucas.spessoa@direcional.com.br",
  "sabrina.braga@direcional.com.br",
  "nucleodigital.grupodirecional@gmail.com"
];

export default function App() {
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | undefined>();
  const [userRole, setUserRole] = useState<"admin" | "user" | null>(null);

  // State for products and settings loaded from local storage
  const [products, setProducts] = useState<Product[]>(() => {
    const saved = localStorage.getItem("catalog_products");
    return saved ? JSON.parse(saved) : INITIAL_PRODUCTS;
  });

  const [config, setConfig] = useState<GlobalConfig>(() => {
    const saved = localStorage.getItem("catalog_config");
    let loaded: GlobalConfig = saved ? JSON.parse(saved) : { ...DEFAULT_GLOBAL_CONFIG };
    
    // Always guarantee that brands are standard array and populated with the three main brands (direcional, riva, abyta)
    if (!loaded.brands || !Array.isArray(loaded.brands) || loaded.brands.length === 0) {
      loaded.brands = JSON.parse(JSON.stringify(DEFAULT_GLOBAL_CONFIG.brands));
    } else {
      // If some brand is missing in the loaded array, merge or append them
      const defaultBrands = DEFAULT_GLOBAL_CONFIG.brands;
      defaultBrands.forEach(db => {
        const existing = loaded.brands.find(b => b.id === db.id);
        if (!existing) {
          loaded.brands.push({ ...db });
        }
      });
    }

    // Force initial settings if missing, allowing custom edits to persist
    loaded.brands = loaded.brands.map((brand: any) => {
      const defaultBrand = DEFAULT_GLOBAL_CONFIG.brands.find(b => b.id === brand.id);
      
      // Force official siteApiUrl if it looks like a placeholder or is missing
      const isPlaceholderUrl = !brand.siteApiUrl || 
                               brand.siteApiUrl.includes("exemplo.com") || 
                               brand.siteApiUrl.includes("marca.com.br") ||
                               brand.siteApiUrl.includes("api.direcional.com.br") ||
                               brand.siteApiUrl.includes("api.riva.com.br") ||
                               brand.siteApiUrl.includes("api.abyta.com.br") ||
                               (brand.id === "direcional" && !brand.siteApiUrl.includes("direcional.com.br")) ||
                               (brand.id === "riva" && !brand.siteApiUrl.includes("rivaincorporadora.com.br")) ||
                               (brand.id === "abyta" && !brand.siteApiUrl.includes("abyta.com.br"));

      return {
        ...brand,
        phone: brand.phone || defaultBrand?.phone || "",
        sdrPhone: brand.sdrPhone !== undefined ? brand.sdrPhone : (defaultBrand?.sdrPhone || ""),
        siteApiUrl: isPlaceholderUrl ? (defaultBrand?.siteApiUrl || "") : brand.siteApiUrl,
        siteAccessToken: brand.siteAccessToken !== undefined ? brand.siteAccessToken : (defaultBrand?.siteAccessToken || ""),
        metaGaPhoneNumberId: brand.metaGaPhoneNumberId || defaultBrand?.metaGaPhoneNumberId || "",
        metaGaWabaId: brand.metaGaWabaId || defaultBrand?.metaGaWabaId || "",
        metaSdrPhoneNumberId: brand.metaSdrPhoneNumberId || defaultBrand?.metaSdrPhoneNumberId || "",
        metaSdrWabaId: brand.metaSdrWabaId || defaultBrand?.metaSdrWabaId || ""
      };
    });

    // Ensure root siteApiUrl is set to official if missing or invalid
    if (!loaded.siteApiUrl || 
        loaded.siteApiUrl.includes("api.direcional.com.br") || 
        loaded.siteApiUrl.includes("marca.com.br") ||
        loaded.siteApiUrl.includes("exemplo.com")) {
      loaded.siteApiUrl = DEFAULT_GLOBAL_CONFIG.siteApiUrl;
    }

    // Sync admin and user emails with defaults if they are missing or if we want to force them
    loaded.adminEmails = Array.from(new Set([...(DEFAULT_GLOBAL_CONFIG.adminEmails || []), ...(loaded.adminEmails || [])]));
    loaded.userEmails = Array.from(new Set([...(DEFAULT_GLOBAL_CONFIG.userEmails || []), ...(loaded.userEmails || [])]));

    return loaded;
  });

  // Cleanup: Purge any remaining fictitious data from localStorage
  useEffect(() => {
    const fictitiousNames = ["Residencial Harmonia", "Residencial Gran Ville Vista", "Studio Flex Smart", "Vitta Club Pinheiros"];
    setProducts(prev => {
      const filtered = prev.filter(p => !fictitiousNames.some(name => p.name.includes(name)));
      if (filtered.length !== prev.length) {
        localStorage.setItem("catalog_products", JSON.stringify(filtered));
      }
      return filtered;
    });
  }, []);

  const [activeTab, setActiveTab] = useState<"catalog" | "bulk" | "settings" | "n8n">("catalog");

  useEffect(() => {
    const unsubscribe = initAppAuth(
      (user) => {
        const email = user.email?.toLowerCase() || "";
        
        // Read the latest config from local storage to have the current emails
        const savedConfig = localStorage.getItem("catalog_config");
        const currentConfig = savedConfig ? JSON.parse(savedConfig) : DEFAULT_GLOBAL_CONFIG;
        
        const admins = currentConfig.adminEmails || DEFAULT_GLOBAL_CONFIG.adminEmails || [];
        const users = currentConfig.userEmails || DEFAULT_GLOBAL_CONFIG.userEmails || [];

        if (admins.includes(email)) {
          setUserRole("admin");
          setCurrentUser(user);
          setAuthError(undefined);
        } else if (users.includes(email)) {
          setUserRole("user");
          setCurrentUser(user);
          setAuthError(undefined);
          setActiveTab((prev) => prev === "settings" ? "catalog" : prev);
        } else {
          setUserRole(null);
          setCurrentUser(null);
          
          // Log access request for admins to review
          const requests = JSON.parse(localStorage.getItem('access_requests') || '[]');
          if (!requests.some((r: any) => r.email === email)) {
            requests.push({ email, name: user.displayName || 'Sem Nome', date: new Date().toISOString(), status: 'pending' });
            localStorage.setItem('access_requests', JSON.stringify(requests));
          }

          setAuthError(`Acesso negado para o e-mail: ${email}. Sua solicitação de acesso foi registrada e será revista pelos administradores da plataforma.`);
        }
        setAuthLoading(false);
      },
      () => {
        setCurrentUser(null);
        setUserRole(null);
        setAuthError(undefined);
        setAuthLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  const [layoutMode, setLayoutMode] = useState<"tabs" | "accordion">("tabs");
  const [selectedProduct, setSelectedProduct] = useState<Product>(products[0] || INITIAL_PRODUCTS[0]);

  // Product CRUD Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"add" | "edit">("add");
  const [productForm, setProductForm] = useState<Omit<Product, "clicks" | "createdAt">>({
    id: "",
    name: "",
    cidade: "",
    bairro: "",
    category: "",
    description: "",
    customPhone: "",
    customMessage: "",
    customFinanceMessage: "",
    utmCampaign: "",
    brandId: "direcional"
  });

  // Active template simulation style
  const [activeTemplateType, setActiveTemplateType] = useState<"info" | "finance">("info");
  const [previewPhoneType, setPreviewPhoneType] = useState<"ga" | "sdr">("ga");

  // Keep preview phone type aligned if user switches selection to Abyta or has no SDR defined
  useEffect(() => {
    const brandId = selectedProduct?.brandId || "direcional";
    const brand = config.brands?.find(b => b.id === brandId);
    const hasSdr = brand && brand.sdrPhone && brand.sdrPhone.trim() !== "";
    if (brandId === "abyta" && !hasSdr && previewPhoneType === "sdr") {
      setPreviewPhoneType("ga");
    }
  }, [selectedProduct, previewPhoneType, config]);

  const activeBrandConfigForPreview = config.brands?.find((b) => b.id === (selectedProduct.brandId || "direcional")) || config.brands?.[0];
  const hasSdrConfigured = activeBrandConfigForPreview?.sdrPhone && activeBrandConfigForPreview.sdrPhone.trim() !== "";
  
  const formatPhoneLabelForApp = (num: string | undefined) => {
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

  // Client Filter & search states
  const [searchQuery, setSearchQuery] = useState("");
  const [wpStatusFilter, setWpStatusFilter] = useState("all");
  const [wpRegionalFilter, setWpRegionalFilter] = useState("all");
  const [brandFilterCatalog, setBrandFilterCatalog] = useState("direcional");

  // Interaction feedback states
  const [copiedStates, setCopiedStates] = useState<{ [key: string]: boolean }>({});
  const [showQRModal, setShowQRModal] = useState<string | null>(null);

  // Gemini AI Optimization states
  const [aiTone, setAiTone] = useState<MessageTone>("amigavel");
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiResponse, setAiResponse] = useState<{ suggestedMessage: string; justification: string } | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  // Save changes to localStorage on any state modification
  useEffect(() => {
    localStorage.setItem("catalog_products", JSON.stringify(products));
  }, [products]);

  useEffect(() => {
    localStorage.setItem("catalog_config", JSON.stringify(config));
  }, [config]);

  const updateConfig = (newVals: Partial<GlobalConfig>) => {
    setConfig(prev => ({ ...prev, ...newVals }));
  };

  // Handle opening product add/edit modes
  const openAddModal = () => {
    setModalMode("add");
    setProductForm({
      id: "",
      name: "",
      cidade: "",
      bairro: "",
      category: "",
      description: "",
      customPhone: "",
      customMessage: "",
      customFinanceMessage: "",
      utmCampaign: "",
      brandId: "direcional"
    });
    setIsModalOpen(true);
  };

  const openEditModal = (product: Product) => {
    setModalMode("edit");
    setProductForm({
      id: product.id,
      name: product.name,
      cidade: product.cidade || "",
      bairro: product.bairro || "",
      category: product.category || "",
      description: product.description || "",
      customPhone: product.customPhone || "",
      customMessage: product.customMessage || "",
      customFinanceMessage: product.customFinanceMessage || "",
      utmCampaign: product.utmCampaign || "",
      brandId: product.brandId || "direcional"
    });
    setIsModalOpen(true);
  };

  const handleSaveProduct = (e: React.FormEvent) => {
    e.preventDefault();
    if (!productForm.name) return;

    if (modalMode === "add") {
      const newProduct: Product = {
        ...productForm,
        id: crypto.randomUUID(),
        clicks: 0,
        createdAt: new Date().toISOString()
      };
      const updated = [newProduct, ...products];
      setProducts(updated);
      setSelectedProduct(newProduct);
    } else {
      const updated = products.map(p => 
        p.id === productForm.id 
          ? { ...p, ...productForm } 
          : p
      );
      setProducts(updated);
      const updatedSelf = updated.find(p => p.id === productForm.id);
      if (updatedSelf) setSelectedProduct(updatedSelf);
    }
    setIsModalOpen(false);
  };

  const handleDeleteProduct = (id: string) => {
    if (confirm("Tem certeza que deseja excluir este produto? Todos os links gerados para ele deixarão de funcionar.")) {
      const updated = products.filter(p => p.id !== id);
      setProducts(updated);
      if (selectedProduct.id === id && updated.length > 0) {
        setSelectedProduct(updated[0]);
      }
    }
  };

  // Import products from CSV / Bulk manager
  const handleBulkImport = (imported: Omit<Product, "clicks" | "createdAt" | "id">[]) => {
    const formatted: Product[] = imported.map(item => ({
      ...item,
      id: crypto.randomUUID(),
      clicks: 0,
      createdAt: new Date().toISOString()
    }));
    setProducts(prev => [...formatted, ...prev]);
    if (formatted.length > 0) {
      setSelectedProduct(formatted[0]);
    }
  };

  // Search and filter logic
  const [wpSyncing, setWpSyncing] = useState(false);
  const [availableWpStatuses, setAvailableWpStatuses] = useState<{id: number, name: string, slug: string}[]>([]);
  const [availableWpRegionals, setAvailableWpRegionals] = useState<{id: number, name: string, slug: string}[]>([]);

  // Fetch available filtros_top/status_tag and regional_comercial terms from WP
  useEffect(() => {
    const fetchStatusesAndRegionals = async () => {
      const activeBrandConfig = config.brands?.find(b => b.id === brandFilterCatalog);
      if (!activeBrandConfig || !activeBrandConfig.siteApiUrl) return;

      try {
        const [ftTerms, stTerms, regTerms] = await Promise.all([
          getTerms({
            siteApiUrl: activeBrandConfig.siteApiUrl,
            taxonomy: "filtros_top",
            siteAccessToken: activeBrandConfig.siteAccessToken || config.siteAccessToken,
          }),
          getTerms({
            siteApiUrl: activeBrandConfig.siteApiUrl,
            taxonomy: "status_tag",
            siteAccessToken: activeBrandConfig.siteAccessToken || config.siteAccessToken,
          }),
          getTerms({
            siteApiUrl: activeBrandConfig.siteApiUrl,
            taxonomy: "regional_comercial",
            siteAccessToken: activeBrandConfig.siteAccessToken || config.siteAccessToken,
          })
        ]);

        let combined: any[] = [];
        if (Array.isArray(ftTerms)) combined = [...combined, ...ftTerms];
        if (Array.isArray(stTerms)) combined = [...combined, ...stTerms];

        // Deduplicate and map
        const unique = Array.from(new Map(combined.map(item => [item.id, item])).values());
        setAvailableWpStatuses(unique.map(item => ({ id: item.id, name: item.name, slug: item.slug })));

        if (Array.isArray(regTerms)) {
          setAvailableWpRegionals(regTerms.map(item => ({ id: item.id, name: item.name, slug: item.slug })));
        } else {
          setAvailableWpRegionals([]);
        }
      } catch (e) {
        console.error("Erro ao buscar termos do WordPress:", e);
      }
    };
    fetchStatusesAndRegionals();
  }, [brandFilterCatalog, config.brands, config.siteAccessToken]);

  const handleFetchFromWP = async () => {
    if (brandFilterCatalog === "all") {
      alert("Por favor, selecione uma marca específica em vez de 'Todas as Marcas' para puxar do WordPress.");
      return;
    }
    setWpSyncing(true);
    try {
      const activeBrandConfig = config.brands?.find(b => b.id === brandFilterCatalog);
      if (!activeBrandConfig || !activeBrandConfig.siteApiUrl) {
        alert("A marca selecionada não possui API do WordPress configurada.");
        return;
      }

      const data = await syncDevelopments({
        siteApiUrl: activeBrandConfig.siteApiUrl,
        siteAccessToken: activeBrandConfig.siteAccessToken || config.siteAccessToken,
        brandId: brandFilterCatalog,
        wpStatus: wpStatusFilter,
        regionalComercial: wpRegionalFilter,
        bypassCache: true // When clicking the manual sync button, we bypass cache to get real-time results!
      });

      if (!data.success) {
        throw new Error(data.error || "Erro ao conectar com a API.");
      }

      const wpItems = Array.isArray(data.apiResponse) ? data.apiResponse : [];
      if (wpItems.length === 0) {
        alert("Nenhum empreendimento retornado pela API do WordPress.");
        return;
      }

      const newProducts: Product[] = wpItems
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
        .map((item: any) => {
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

          let cidadeText = "Ver Site";
          if (item._embedded?.["wp:term"]) {
            const cityTerms = item._embedded["wp:term"].flat().filter((t: any) => t.taxonomy === "cidade" || t.taxonomy === "cidades");
            if (cityTerms.length > 0) {
              cidadeText = cityTerms.map((t: any) => t.name).join(", ");
            }
          }
          
          if (cidadeText === "Ver Site" && item.cidade) {
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
            id: "wp-" + (item.id || crypto.randomUUID()),
            name: title,
            category: statusText,
            cidade: cidadeText, 
            bairro: item.bairro || item.meta?.bairro || "", 
            clicks: 0,
            createdAt: new Date().toISOString(),
            brandId: brandFilterCatalog,
            customPhone: "", 
            customMessage: "",
            regional: regionalText || ""
          };
        });

      setProducts(prev => {
        const merged = [...prev];
        let addedCount = 0;
        newProducts.forEach(newP => {
          const existing = merged.find(m => m.name === newP.name && m.brandId === newP.brandId);
          if (!existing) {
             merged.unshift(newP);
             addedCount++;
          }
        });
        
        // Notify
        setTimeout(() => alert(`Adicionados ${addedCount} novos empreendimentos de ${newProducts.length} recebidos via WordPress API.`), 100);
        
        return merged;
      });
      
    } catch (err: any) {
      alert("Falha na sincronização via API Aberta do WP: " + err.message);
    } finally {
      setWpSyncing(false);
    }
  };

  const categories = Array.from(new Set([
    "Breve Lançamento",
    "Lançamento",
    "Em obras",
    "Obras Avançadas",
    "Pronto para morar",
    ...products
      .filter(p => (p.brandId || "direcional") === brandFilterCatalog)
      .flatMap(p => (p.category || "").split(",").map(cat => cat.trim()))
      .filter(Boolean)
  ])).sort();

  const filteredProducts = products.filter(p => {
    const statusLower = (p.category || "").toLowerCase();
    const isExcluded = statusLower.includes("portfolio") || 
                       statusLower.includes("vendido") ||
                       statusLower.includes("vendida");

    if (isExcluded) return false;

    const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          (p.cidade && p.cidade.toLowerCase().includes(searchQuery.toLowerCase())) ||
                          (p.bairro && p.bairro.toLowerCase().includes(searchQuery.toLowerCase())) ||
                          (p.category && p.category.toLowerCase().includes(searchQuery.toLowerCase())) ||
                          (p.regional && p.regional.toLowerCase().includes(searchQuery.toLowerCase()));
    
    let matchesStatus = true;
    if (wpStatusFilter !== "all") {
      const selectedStatusTerm = availableWpStatuses.find(s => String(s.id) === wpStatusFilter);
      if (selectedStatusTerm) {
        matchesStatus = p.category ? p.category.toLowerCase().includes(selectedStatusTerm.name.toLowerCase()) : false;
      }
    }

    let matchesRegional = true;
    if (wpRegionalFilter !== "all") {
      const selectedRegTerm = availableWpRegionals.find(r => String(r.id) === wpRegionalFilter);
      if (selectedRegTerm) {
        matchesRegional = p.regional ? p.regional.toLowerCase().includes(selectedRegTerm.name.toLowerCase()) : false;
      }
    }
    
    const pBrand = p.brandId || "direcional";
    const matchesBrand = pBrand === brandFilterCatalog;
    
    return matchesSearch && matchesStatus && matchesRegional && matchesBrand;
  });

  // Simulated internal link clicking system
  const handleSimulateClick = (product: Product, forcedType?: "info" | "finance") => {
    const type = forcedType || activeTemplateType;
    // Increment local clicks counter
    const updated = products.map(p => 
      p.id === product.id ? { ...p, clicks: p.clicks + 1 } : p
    );
    setProducts(updated);
    const self = updated.find(p => p.id === product.id);
    if (self) setSelectedProduct(self);

    // Open link in a neat new window
    const finalLink = generateWhatsAppLink(product, config, type, previewPhoneType);
    window.open(finalLink, "_blank", "noopener,noreferrer");
  };

  // Copy helper
  const copyToClipboard = (text: string, typeKey: string) => {
    navigator.clipboard.writeText(text);
    setCopiedStates(prev => ({ ...prev, [typeKey]: true }));
    setTimeout(() => {
      setCopiedStates(prev => ({ ...prev, [typeKey]: false }));
    }, 2000);
  };

  // Gemini API integration to optimize and refine copywriting starters
  const handleOptimizeWithGemini = async () => {
    setIsAiLoading(true);
    setAiError(null);
    setAiResponse(null);

    try {
      const data = await optimizeCopy({
        productName: selectedProduct.name,
        productCategory: selectedProduct.category,
        productCidade: selectedProduct.cidade,
        productBairro: selectedProduct.bairro,
        productDescription: selectedProduct.description,
        globalTone: aiTone
      });

      setAiResponse(data);
    } catch (err: any) {
      console.error(err);
      setAiError(err.message || "Não foi possível conectar-se ao serviço do Gemini AI.");
    } finally {
      setIsAiLoading(false);
    }
  };

  const applyAiMessage = () => {
    if (!aiResponse) return;
    const updated = products.map(p => 
      p.id === selectedProduct.id 
        ? { 
            ...p, 
            customMessage: aiResponse.suggestedMessage,
            customFinanceMessage: (aiResponse as any).suggestedFinanceMessage 
          } 
        : p
    );
    setProducts(updated);
    const self = updated.find(p => p.id === selectedProduct.id);
    if (self) setSelectedProduct(self);
    setAiResponse(null);
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
      </div>
    );
  }

  if (!currentUser) {
    return <LoginScreen onLoginSuccess={() => {}} errorMsg={authError} />;
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-800 flex flex-col antialiased relative">
      
      {/* Visual Navigation Bar */}
      <header className="bg-slate-900 text-white py-3 px-6 shadow-sm border-b border-slate-800 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-emerald-500 rounded flex items-center justify-center font-bold text-slate-900 italic font-display select-none">
              Z
            </div>
            <div>
              <h1 className="text-base font-semibold tracking-tight leading-none flex items-center gap-1.5">
                LinkZap
                <span className="text-[10px] bg-emerald-400/20 text-emerald-400 font-bold px-2 py-0.5 rounded-full uppercase leading-none border border-emerald-500/20">
                  Pro
                </span>
              </h1>
              <p className="text-[10.5px] text-slate-400 font-medium leading-none mt-1">
                Automação Avançada de Links WhatsApp • {config.companyName || "Direcional"}
              </p>
            </div>
          </div>

          {/* Navigation Nav Tabs Selection */}
          <div className="flex flex-col sm:flex-row items-center gap-3 bg-slate-800 p-1 rounded-xl border border-slate-700/50">
            <nav className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={() => setActiveTab("catalog")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition-all cursor-pointer ${
                  activeTab === "catalog"
                    ? "bg-emerald-600 text-white shadow-xs"
                    : "text-slate-300 hover:bg-slate-750/80 hover:text-white"
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                Catálogo
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("bulk")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition-all cursor-pointer ${
                  activeTab === "bulk"
                    ? "bg-emerald-600 text-white shadow-xs"
                    : "text-slate-300 hover:bg-slate-750/80 hover:text-white"
                }`}
              >
                <Database className="w-3.5 h-3.5" />
                Lote / Excel
              </button>
              {userRole === "admin" && (
                <button
                  type="button"
                  onClick={() => setActiveTab("settings")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition-all cursor-pointer ${
                    activeTab === "settings"
                      ? "bg-emerald-600 text-white shadow-xs"
                      : "text-slate-300 hover:bg-slate-750/80 hover:text-white"
                  }`}
                >
                  <Settings className="w-3.5 h-3.5" />
                  Regras Globais
                </button>
              )}
            </nav>
            <div className="hidden sm:block w-px h-6 bg-slate-700/50 mx-1"></div>
            <button
              onClick={() => logout()}
              title={`Sair de ${currentUser?.email}`}
              className="flex font-medium items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-red-400 hover:bg-red-400/10 transition-colors"
            >
              Sair
            </button>
          </div>
        </div>
      </header>

      {/* Main body: split pane desktop */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Side Pane: Holds selected Tabs */}
        <div className={`${activeTab === "bulk" ? "lg:col-span-8" : "lg:col-span-12"} space-y-6`}>
          
          {activeTab === "catalog" && (
            <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm" id="catalog-card">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center pb-5 mb-5 border-b border-slate-150 gap-4">
                <div>
                  <h2 className="text-xl font-bold text-slate-800">Catálogo de Empreendimentos</h2>
                  <p className="text-slate-500 text-xs mt-0.5">Visualização de produtos e rotas de WhatsApp configuradas.</p>
                </div>
              </div>

              {/* Filters toolbar */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3 mb-5">
                <div className="md:col-span-2">
                  <select
                    value={brandFilterCatalog}
                    onChange={(e) => {
                      setBrandFilterCatalog(e.target.value);
                      setWpStatusFilter("all"); // Reset sync filter
                      setWpRegionalFilter("all"); // Reset regional filter
                    }}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
                  >
                    {(config.brands || []).map((b) => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>

                <div className="md:col-span-3">
                  <select
                    value={wpStatusFilter}
                    onChange={(e) => setWpStatusFilter(e.target.value)}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
                    title="Status de Lançamento do Empreendimento"
                  >
                    <option value="all">Status Lançamento: Todos</option>
                    {availableWpStatuses.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>

                <div className="md:col-span-3">
                  <select
                    value={wpRegionalFilter}
                    onChange={(e) => setWpRegionalFilter(e.target.value)}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
                    title="Regional Comercial do Empreendimento"
                  >
                    <option value="all">Regional Comercial: Todas</option>
                    {availableWpRegionals.map(r => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
                </div>

                <div className="md:col-span-4 flex gap-2">
                  <div className="relative flex-1">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                      <Search className="w-4 h-4" />
                    </div>
                    <input
                      type="text"
                      placeholder="Pesquisar..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  
                  <button 
                    type="button" 
                    onClick={handleFetchFromWP}
                    disabled={wpSyncing}
                    className="items-center justify-center bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50 px-3 py-2.5 rounded-xl border border-emerald-600 transition-colors hidden sm:flex shrink-0 shadow-sm"
                    title="Importar do WordPress (selecione a Marca)"
                  >
                    {wpSyncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
                    <span className="text-[10px] font-bold uppercase truncate">{wpSyncing ? "" : "Sincronizar"}</span>
                  </button>

                  <button 
                    onClick={() => {
                      if(confirm("Deseja apagar TODOS os empreendimentos do catálogo local?")) {
                        setProducts([]);
                        setSelectedProduct({} as Product);
                      }
                    }}
                    className="p-2.5 text-rose-600 hover:bg-rose-50 border border-rose-200 rounded-xl transition-colors shrink-0"
                    title="Limpar Catálogo Inteiro"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Products Catalog Table / grid */}
              {filteredProducts.length === 0 ? (
                <div className="text-center py-12 border border-dashed border-slate-200 rounded-xl bg-slate-50/50">
                  <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3">
                    <Database className="w-6 h-6 text-slate-400" />
                  </div>
                  <h4 className="font-semibold text-slate-800 text-sm">Nenhum empreendimento cadastrado ou encontrado</h4>
                  <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                    Insira seu primeiro empreendimento usando o botão acima ou copie uma planilha do Excel de lote na aba de importação.
                  </p>
                  <button 
                    onClick={() => {
                      setSearchQuery(""); 
                      setWpStatusFilter("all");
                      setWpRegionalFilter("all");
                    }}
                    className="mt-3 text-xs text-emerald-600 font-semibold hover:underline"
                  >
                    Limpar Filtros de Pesquisa
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                  {filteredProducts.map(p => {
                    const infoLink = generateWhatsAppLink(p, config, "info", "ga");
                    const financeLink = generateWhatsAppLink(p, config, "finance", "ga");
                    const pBrand = p.brandId || "direcional";

                    return (
                      <div 
                        key={p.id} 
                        className={`group relative bg-white border rounded-2xl overflow-hidden transition-all hover:shadow-md ${
                          selectedProduct.id === p.id 
                            ? "border-emerald-500 ring-1 ring-emerald-500" 
                            : "border-slate-200 hover:border-slate-300"
                        }`}
                        onClick={() => setSelectedProduct(p)}
                      >
                        <div className="p-4 space-y-3">
                          <div className="flex justify-between items-start gap-2">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                              pBrand === "riva" ? "bg-slate-100 text-slate-700" : 
                              pBrand === "abyta" ? "bg-indigo-50 text-indigo-700" : 
                              "bg-emerald-50 text-emerald-700"
                            }`}>
                              {pBrand}
                            </span>
                            <div className="flex items-center gap-1">
                              <button 
                                onClick={(e) => { e.stopPropagation(); openEditModal(p); }}
                                className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                              >
                                <Edit className="w-4 h-4" />
                              </button>
                              <button 
                                onClick={(e) => { e.stopPropagation(); handleDeleteProduct(p.id); }}
                                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>

                          <div>
                            <h3 className="font-bold text-sm text-slate-800 line-clamp-1 group-hover:text-emerald-700 transition-colors" title={p.name}>
                              {p.name}
                            </h3>
                            <div className="flex items-center gap-1.5 mt-1 text-slate-500 text-[11px]">
                              <span className="font-medium">{p.bairro}</span>
                              <span className="text-slate-300">•</span>
                              <span>{p.cidade}</span>
                              {p.regional && (
                                <>
                                  <span className="text-slate-300">•</span>
                                  <span className="text-slate-400 font-medium">{p.regional}</span>
                                </>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-3 pt-1 border-t border-slate-100">
                             <span className="text-[10px] font-bold text-slate-400 flex items-center gap-1">
                               <RefreshCw className="w-3 h-3" /> {p.clicks} cliques
                             </span>
                             <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                               p.category?.toLowerCase().includes("venda") || p.category?.toLowerCase().includes("vendido") ? "bg-rose-100 text-rose-700" :
                               p.category?.toLowerCase().includes("lançamento") && !p.category?.toLowerCase().includes("breve") ? "bg-orange-100 text-orange-700" :
                               p.category?.toLowerCase().includes("breve") ? "bg-amber-100 text-amber-700" :
                               p.category?.toLowerCase().includes("obras") || p.category?.toLowerCase().includes("construção") ? "bg-blue-100 text-blue-700" :
                               p.category?.toLowerCase().includes("pronto") || p.category?.toLowerCase().includes("entregue") ? "bg-emerald-100 text-emerald-700" :
                               "bg-slate-100 text-slate-600"
                             }`}>
                               {p.category}
                             </span>
                          </div>

                          <div className="grid grid-cols-2 gap-2 pt-1">
                            <button
                              onClick={(e) => { e.stopPropagation(); handleSimulateClick(p, "info"); }}
                              className="flex items-center justify-center gap-1.5 py-2 px-3 bg-emerald-50 text-emerald-800 text-[10px] font-bold rounded-xl hover:bg-emerald-100 border border-emerald-100 transition-all active:scale-95"
                            >
                              <MessageCircle className="w-3.5 h-3.5" />
                              Info
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleSimulateClick(p, "finance"); }}
                              className="flex items-center justify-center gap-1.5 py-2 px-3 bg-slate-900 text-white text-[10px] font-bold rounded-xl hover:bg-slate-800 border border-slate-800 transition-all active:scale-95 shadow-sm"
                            >
                              <TrendingUp className="w-3.5 h-3.5" />
                              Simulação
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* BULK IMPORT EXPORT TAB */}
          {activeTab === "bulk" && (
            <BulkManager 
              products={products} 
              config={config} 
              onImport={handleBulkImport} 
            />
          )}

          {/* GLOBAL CONFIGURATION TAB */}
          {activeTab === "settings" && (
            <SettingsPanel 
              config={config} 
              onChange={setConfig} 
              productsForSync={products.map((p) => {
                const b = config.brands?.find((brand) => brand.id === (p.brandId || "direcional")) || config.brands?.[0];
                return {
                  id: p.id,
                  name: p.name,
                  cidade: p.cidade,
                  bairro: p.bairro,
                  category: p.category,
                  brand: b?.name || "Direcional",
                  links: {
                    info: generateWhatsAppLink(p, config, "info", previewPhoneType),
                    finance: generateWhatsAppLink(p, config, "finance", previewPhoneType)
                  }
                };
              })}
            />
          )}

          {activeTab === "n8n" && (
            <div className="bg-white rounded-2xl p-8 border border-slate-200 text-center">
              <Cpu className="w-12 h-12 text-slate-300 mx-auto mb-4" />
              <h3 className="text-lg font-bold text-slate-800">Módulo de Automação (n8n)</h3>
              <p className="text-slate-500 text-sm">Este módulo está em desenvolvimento e será disponibilizado em breve para automações avançadas.</p>
            </div>
          )}
        </div>

        {/* ************************************************************ */}
        {/* RIGHT SIDE PANE: LIVE PREVIEW & INTERACTIVE TESTING CONTEXT */}
        {/* ************************************************************ */}
        {activeTab === "bulk" && (
          <div className="lg:col-span-4 lg:sticky lg:top-24 h-fit space-y-6">
          
          <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center justify-between pb-3.5 border-b border-slate-150">
              <h3 className="font-bold text-sm text-slate-800 flex items-center gap-1.5 uppercase tracking-wide">
                <Smartphone className="w-4 h-4 text-slate-500" />
                Painel do Vendedor e Simulador
              </h3>
              
              <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-100 px-2 py-0.5 rounded-full font-bold">
                PRODUTO SELECIONADO
              </span>
            </div>

            {/* Smart Phone Shell Frame View with active segment */}
            <PhonePreview product={selectedProduct} config={config} templateType={activeTemplateType} phoneType={previewPhoneType} />
          </div>
        </div>
        )}
      </main>

      {/* ************************************************************ */}
      {/* ADD/EDIT INLINE PRODUCT DIALOG MODAL */}
      {/* ************************************************************ */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center p-4 z-50 overflow-y-auto" onClick={() => setIsModalOpen(false)}>
          <div 
            className="bg-white rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl border border-slate-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-gradient-to-r from-[#075e54] to-[#128c7e] text-white px-6 py-4 flex items-center justify-between">
              <h3 className="font-bold text-sm tracking-wide uppercase">
                {modalMode === "add" ? "Cadastrar Novo Produto" : "Editar Produto Catalogo"}
              </h3>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="text-teal-100 hover:text-white transition-colors cursor-pointer text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveProduct} className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-650 uppercase tracking-wider mb-1.5">
                    Nome do Empreendimento/Produto *
                  </label>
                  <input
                    type="text"
                    required
                    value={productForm.name}
                    onChange={(e) => setProductForm({ ...productForm, name: e.target.value })}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#128c7e]"
                    placeholder="Ex: Reserva Lagoa"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-650 uppercase tracking-wider mb-1.5">
                    Cidade *
                  </label>
                  <input
                    type="text"
                    required
                    value={productForm.cidade || ""}
                    onChange={(e) => setProductForm({ ...productForm, cidade: e.target.value })}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#128c7e]"
                    placeholder="Ex: Contagem"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-650 uppercase tracking-wider mb-1.5">
                    Bairro *
                  </label>
                  <input
                    type="text"
                    required
                    value={productForm.bairro || ""}
                    onChange={(e) => setProductForm({ ...productForm, bairro: e.target.value })}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#128c7e]"
                    placeholder="Ex: Centro"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-650 uppercase tracking-wider mb-1.5">
                    Categoria do Produto
                  </label>
                  <input
                    type="text"
                    value={productForm.category || ""}
                    onChange={(e) => setProductForm({ ...productForm, category: e.target.value })}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#128c7e]"
                    placeholder="Ex: Breve Lançamento, Pronto para Morar"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-650 uppercase tracking-wider mb-1.5">
                  Marca do Produto / Empreendimento *
                </label>
                <select
                  value={productForm.brandId || "direcional"}
                  onChange={(e) => setProductForm({ ...productForm, brandId: e.target.value })}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-705 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#128c7e] font-semibold"
                >
                  <option value="direcional">Direcional Engenharia</option>
                  <option value="riva">Riva Incorporadora</option>
                  <option value="abyta">Abytá Incorporadora</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-650 uppercase tracking-wider mb-1.5">
                  Descrição (Ajuda o Copiloto IA a sugerir mensagens de venda!)
                </label>
                <textarea
                  value={productForm.description || ""}
                  onChange={(e) => setProductForm({ ...productForm, description: e.target.value })}
                  className="w-full h-16 p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-750 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#128c7e] resize-none"
                  placeholder="Ex: 2 quartos em condomínio fechado com varanda e garagem à beira do lago."
                ></textarea>
              </div>

              <div className="border-t border-slate-100 pt-4 mt-2">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide block mb-3">Rotas Customizadas de Alta Escala (Sobrescritas Opcionais)</span>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-600 mb-1">
                      WhatsApp Destino Específico (Telefone)
                    </label>
                    <input
                      type="text"
                      value={productForm.customPhone || ""}
                      onChange={(e) => setProductForm({ ...productForm, customPhone: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#128c7e] font-mono"
                      placeholder="Ex: 5511977778888"
                    />
                    <span className="text-[9px] text-slate-400 block mt-1">
                      Deixe vazio para herdar o Telefone Padrão Global.
                    </span>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-600 mb-1">
                      Campanha UTM Customizada
                    </label>
                    <input
                      type="text"
                      value={productForm.utmCampaign || ""}
                      onChange={(e) => setProductForm({ ...productForm, utmCampaign: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#128c7e]"
                      placeholder="Ex: lancamento-apartamento-sul"
                    />
                    <span className="text-[9px] text-slate-400 block mt-1">
                      Deixe vazio para usar a UTM Global padrão.
                    </span>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-1 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-600 mb-1">
                      Mensagem Especial de Informações (Sobrescrita)
                    </label>
                    <textarea
                      value={productForm.customMessage || ""}
                      onChange={(e) => setProductForm({ ...productForm, customMessage: e.target.value })}
                      className="w-full h-12 p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-755 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#128c7e]"
                      placeholder="Use para substituir a mensagem padrão de informações do produto."
                    ></textarea>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-600 mb-1">
                      Mensagem Especial de Simulação de Financiamento (Sobrescrita)
                    </label>
                    <textarea
                      value={productForm.customFinanceMessage || ""}
                      onChange={(e) => setProductForm({ ...productForm, customFinanceMessage: e.target.value })}
                      className="w-full h-12 p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-755 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#128c7e]"
                      placeholder="Use para substituir a mensagem padrão de simulação de financiamento deste produto."
                    ></textarea>
                  </div>
                </div>
              </div>

              <div className="flex gap-3 justify-end pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-500 hover:text-slate-800 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-[#075e54] text-white font-bold text-xs rounded-xl hover:bg-teal-850 cursor-pointer shadow-sm transition-all"
                >
                  Salvar Empreendimento
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ************************************************************ */}
      {/* QR CODE OVERLAY MODAL */}
      {/* ************************************************************ */}
      {showQRModal && (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center p-4 z-50" onClick={() => setShowQRModal(null)}>
          <div 
            className="bg-white rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl border border-slate-250 p-6 flex flex-col items-center relative text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <button 
              onClick={() => setShowQRModal(null)}
              className="absolute top-3 right-4 text-slate-400 hover:text-slate-800 transition-colors cursor-pointer text-sm font-bold"
            >
              ✕
            </button>

            <div className="w-12 h-12 rounded-full bg-teal-50 flex items-center justify-center mb-3 text-[#075e54]">
              <QrCode className="w-6 h-6" />
            </div>

            <h3 className="font-bold text-sm text-slate-800">QR Code do WhatsApp</h3>
            <p className="text-xs text-slate-550 mt-1 max-w-[280px]">
              Aponte a câmera do celular para este código para iniciar a conversa simulada instantaneamente com a mensagem parametrizada do produto.
            </p>

            <div className="bg-slate-50 p-4 rounded-xl border border-slate-150 my-5 flex items-center justify-center shadow-inner">
              <img 
                src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(showQRModal)}`} 
                alt="QR Code WhatsApp" 
                className="w-48 h-48 block rounded shadow-md pointer-events-none"
                referrerPolicy="no-referrer"
              />
            </div>

            <div className="flex gap-3.5 w-full">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(showQRModal);
                }}
                className="flex-1 py-2 bg-slate-100 hover:bg-emerald-50 hover:text-emerald-800 transition-colors border border-slate-200 text-slate-700 font-semibold text-xs rounded-xl cursor-pointer"
              >
                Copiar Link ✔
              </button>
              <button
                onClick={() => setShowQRModal(null)}
                className="flex-1 py-2 bg-[#075e54] text-white font-bold text-xs rounded-xl hover:bg-teal-850 transition-colors cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FOOTER */}
      <footer className="bg-slate-800 text-slate-400 border-t border-slate-700/50 py-5 text-center text-xs px-6 mt-auto">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-4">
          <p className="font-semibold text-slate-450">&copy; {new Date().getFullYear()} LinkZap Automador — Todos os direitos reservados.</p>
          <p className="text-[11px] text-slate-500">Desenvolvido em conformidade avançada com diretrizes de canais integrados Meta e metrificação de leads.</p>
        </div>
      </footer>

    </div>
  );
}
