import { Product } from "../types";

// Client-side cache to minimize API overload and keep browsing fluid
const clientCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 3 * 60 * 1000; // 3 minutes cache TTL

function getCache(key: string): any | null {
  const cached = clientCache.get(key);
  if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
    return cached.data;
  }
  return null;
}

function setCache(key: string, data: any) {
  clientCache.set(key, { data, timestamp: Date.now() });
}

// Hardcoded taxonomy fallbacks (matches server-side lists perfectly)
export const clientTaxonomyFallbacks: Record<string, Record<string, any[]>> = {
  direcional: {
    filtros_top: [
      { id: 48, name: "Pronto para Morar", slug: "pronto-para-morar" },
      { id: 5440, name: "Em Construção", slug: "em-construcao" },
      { id: 45, name: "Lançamento", slug: "lancamento" },
      { id: 46, name: "Breve Lançamento", slug: "breve-lancamento" },
      { id: 5441, name: "Pré-lançamento", slug: "pre-lancamento" }
    ],
    status_tag: [
      { id: 48, name: "Pronto para Morar", slug: "pronto-para-morar" },
      { id: 5440, name: "Em Construção", slug: "em-construcao" },
      { id: 45, name: "Lançamento", slug: "lancamento" },
      { id: 46, name: "Breve Lançamento", slug: "breve-lancamento" }
    ],
    regional_comercial: [
      { id: 101, name: "Belo Horizonte / MG", slug: "belo-horizonte" },
      { id: 102, name: "São Paulo / SP", slug: "sao-paulo" },
      { id: 103, name: "Rio de Janeiro / RJ", slug: "rio-de-janeiro" },
      { id: 104, name: "Campinas / SP", slug: "campinas" },
      { id: 105, name: "Manaus / AM", slug: "manaus" },
      { id: 107, name: "Brasília / DF", slug: "brasilia" }
    ]
  },
  riva: {
    filtros_top: [
      { id: 48, name: "Pronto para Morar", slug: "pronto-para-morar" },
      { id: 5440, name: "Em Construção", slug: "em-construcao" },
      { id: 45, name: "Lançamento", slug: "lancamento" },
      { id: 46, name: "Breve Lançamento", slug: "breve-lancamento" }
    ],
    status_tag: [
      { id: 48, name: "Pronto para Morar", slug: "pronto-para-morar" },
      { id: 5440, name: "Em Construção", slug: "em-construcao" },
      { id: 45, name: "Lançamento", slug: "lancamento" },
      { id: 46, name: "Breve Lançamento", slug: "breve-lancamento" }
    ],
    regional_comercial: [
      { id: 102, name: "São Paulo / SP", slug: "sao-paulo" },
      { id: 103, name: "Rio de Janeiro / RJ", slug: "rio-de-janeiro" },
      { id: 101, name: "Belo Horizonte / MG", slug: "belo-horizonte" }
    ]
  },
  abyta: {
    filtros_top: [
      { id: 48, name: "Pronto p/ Morar", slug: "pronto-para-morar" },
      { id: 5440, name: "Em Construção", slug: "em-construcao" },
      { id: 45, name: "Lançamento", slug: "lancamento" }
    ],
    status_tag: [
      { id: 48, name: "Pronto p/ Morar", slug: "pronto-para-morar" },
      { id: 5440, name: "Em Construção", slug: "em-construcao" }
    ],
    regional_comercial: [
      { id: 301, name: "São Paulo / SP", slug: "sao-paulo" }
    ]
  }
};

// WordPress Term structure helper
function matchesTaxonomyFilter(item: any, value: any, taxonomy: string): boolean {
  if (!value || value === "all") return true;

  const taxProp = item[taxonomy];
  if (taxProp !== undefined && taxProp !== null) {
    if (Array.isArray(taxProp)) {
      const match = taxProp.some(val => {
        if (typeof val === "object" && val !== null) {
          return String(val.id) === String(value) || String(val.slug) === String(value) || String(val.slug).toLowerCase() === String(value).toLowerCase();
        }
        return String(val) === String(value);
      });
      if (match) return true;
    } else {
      if (typeof taxProp === "object" && taxProp !== null) {
        if (String(taxProp.id) === String(value) || String(taxProp.slug) === String(value) || String(taxProp.slug).toLowerCase() === String(value).toLowerCase()) return true;
      } else if (String(taxProp) === String(value)) {
        return true;
      }
    }
  }

  if (item._embedded && Array.isArray(item._embedded["wp:term"])) {
    const termFlat = item._embedded["wp:term"].flat();
    const foundTerm = termFlat.find((t: any) => 
      t && 
      t.taxonomy === taxonomy && 
      (String(t.id) === String(value) || String(t.slug) === String(value) || String(t.slug).toLowerCase() === String(value).toLowerCase())
    );
    if (foundTerm) return true;
  }

  return false;
}

// Dynamic term extractor
function extractTermsFromPosts(brandId: string, requestedTaxonomy: string, posts: any[]): any[] {
  const termsMap = new Map<string, any>();

  if (Array.isArray(posts)) {
    for (const post of posts) {
      if (post._embedded && Array.isArray(post._embedded["wp:term"])) {
        const termFlat = post._embedded["wp:term"].flat();
        for (const t of termFlat) {
          if (t && t.taxonomy === requestedTaxonomy && t.slug) {
            const uniqueKey = String(t.id || t.slug);
            if (!termsMap.has(uniqueKey)) {
              termsMap.set(uniqueKey, {
                id: t.id,
                name: t.name,
                slug: t.slug
              });
            }
          }
        }
      }
      const directProp = post[requestedTaxonomy];
      if (directProp !== undefined && directProp !== null) {
        const arr = Array.isArray(directProp) ? directProp : [directProp];
        for (const t of arr) {
          if (typeof t === "object" && t !== null && t.slug) {
            const uniqueKey = String(t.id || t.slug);
            if (!termsMap.has(uniqueKey)) {
              termsMap.set(uniqueKey, {
                id: t.id,
                name: t.name,
                slug: t.slug
              });
            }
          } else if (typeof t === "string" || typeof t === "number") {
            const uniqueKey = String(t);
            if (!termsMap.has(uniqueKey)) {
              termsMap.set(uniqueKey, {
                id: t,
                name: String(t),
                slug: String(t).toLowerCase()
              });
            }
          }
        }
      }
    }
  }

  return Array.from(termsMap.values());
}

// Cascade direct WP fetch
async function directBrowserWPFetch(baseUrl: string, siteAccessToken?: string): Promise<any[]> {
  let baseUrlForBrand = baseUrl;
  if (baseUrlForBrand.includes("?")) {
    baseUrlForBrand = baseUrlForBrand.split("?")[0];
  }

  const separator = baseUrlForBrand.includes("?") ? "&" : "?";
  const urlsToTry = [
    `${baseUrlForBrand}${separator}per_page=100&_embed=1&status=publish`,
    `${baseUrlForBrand}${separator}per_page=100&_embed=1`,
    `${baseUrlForBrand}${separator}per_page=50&_embed=1`,
    `${baseUrlForBrand}${separator}per_page=20&_embed=1`,
    baseUrlForBrand
  ];

  for (const currentUrl of urlsToTry) {
    try {
      const response = await fetch(currentUrl, {
        method: "GET",
        headers: {
          "Accept": "application/json",
          ...(siteAccessToken && { "Authorization": `Bearer ${siteAccessToken}` })
        }
      });
      if (response.ok) {
        const parsed = await response.json();
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (err) {
      console.warn(`[Client Direct Fetch] Error fetching ${currentUrl}:`, err);
    }
  }

  throw new Error("Não foi possível acessar a API do WordPress diretamento pelo navegador.");
}

/**
 * 1. Fetch available custom terms for Status / Regional
 */
export async function getTerms(params: {
  siteApiUrl: string;
  taxonomy: string;
  siteAccessToken?: string;
  bypassCache?: boolean;
}): Promise<any[]> {
  const { siteApiUrl, taxonomy, siteAccessToken, bypassCache } = params;
  const brandId = siteApiUrl.includes("direcional") ? "direcional" : siteApiUrl.includes("riva") ? "riva" : "abyta";
  const localCacheKey = `terms_${siteApiUrl}_${taxonomy}_${siteAccessToken || ""}`;

  if (!bypassCache) {
    const cached = getCache(localCacheKey);
    if (cached) return cached;
  }

  // A. First try to fetch from Express server API
  try {
    const response = await fetch("/api/integration/site/terms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ siteApiUrl, taxonomy, siteAccessToken, bypassCache })
    });
    if (response.ok) {
      const data = await response.json();
      if (Array.isArray(data)) {
        setCache(localCacheKey, data);
        return data;
      }
    }
  } catch (err) {
    console.warn("[apiClient] Servidor Express não disponível para termos. Executando motor estático local.");
  }

  // B. Fallback to client-side direct request and extraction
  try {
    const rawPosts = await directBrowserWPFetch(siteApiUrl, siteAccessToken);
    const extracted = extractTermsFromPosts(brandId, taxonomy, rawPosts);
    if (extracted.length > 0) {
      setCache(localCacheKey, extracted);
      return extracted;
    }
  } catch (err) {
    console.warn(`[apiClient] CORS ou falha de rede ao requisitar termos de '${siteApiUrl}':`, err);
  }

  // C. Fallback to static lists
  const staticList = (clientTaxonomyFallbacks[brandId] && clientTaxonomyFallbacks[brandId][taxonomy]) || [];
  setCache(localCacheKey, staticList);
  return staticList;
}

/**
 * 2. Fetch developments and synchronize with API Filter
 */
export async function syncDevelopments(params: {
  siteApiUrl: string;
  siteAccessToken?: string;
  brandId: string;
  wpStatus?: string;
  wpStatusTaxonomy?: string;
  regionalComercial?: string;
  bypassCache?: boolean;
}): Promise<{ success: boolean; apiResponse: any[]; error?: string }> {
  const { siteApiUrl, siteAccessToken, brandId, wpStatus, wpStatusTaxonomy, regionalComercial, bypassCache } = params;
  const localCacheKey = `sync_${brandId}_${siteApiUrl}_${wpStatus || "all"}_${regionalComercial || "all"}_${bypassCache ? "bypass" : "cache"}`;

  if (!bypassCache) {
    const cached = getCache(localCacheKey);
    if (cached) return cached;
  }

  // A. Try backend server API
  try {
    const response = await fetch("/api/integration/site/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        siteApiUrl,
        siteAccessToken,
        brandId,
        wpStatus,
        wpStatusTaxonomy,
        regionalComercial,
        bypassCache
      })
    });
    if (response.ok) {
      const data = await response.json();
      if (data && data.success) {
        setCache(localCacheKey, data);
        return data;
      }
    }
  } catch (err) {
    console.warn("[apiClient] Servidor Express não disponível para sincronizar. Executando motor estático local.");
  }

  // B. Browser direct query & manual filter
  try {
    const rawItems = await directBrowserWPFetch(siteApiUrl, siteAccessToken);
    
    // In-memory filter equivalent to server-side filter
    let filtered = [...rawItems];

    if (wpStatus && wpStatus !== "all") {
      const activeTax = wpStatusTaxonomy || "filtros_top";
      filtered = filtered.filter(item => matchesTaxonomyFilter(item, wpStatus, activeTax));
    }

    if (regionalComercial && regionalComercial !== "all") {
      filtered = filtered.filter(item => matchesTaxonomyFilter(item, regionalComercial, "regional_comercial"));
    }

    const res = { success: true, apiResponse: filtered };
    setCache(localCacheKey, res);
    return res;
  } catch (err: any) {
    console.error("[apiClient] Falha fatal no fetch de sincronização direta:", err.message);
    return {
      success: false,
      error: `Erro ao conectar com a API pela máquina local: ${err.message || err}. Verifique os cabeçalhos de segurança CORS ou use o servidor proxy.`,
      apiResponse: []
    };
  }
}

/**
 * 3. Copy optimizer using Gemini if available, or highly crafted local rule-based engine
 */
export async function optimizeCopy(params: {
  productName: string;
  productCategory?: string;
  productCidade?: string;
  productBairro?: string;
  productDescription?: string;
  globalTone: string;
}): Promise<{ suggestedMessage: string; suggestedFinanceMessage: string; justification: string }> {
  const { productName, productCategory, productCidade, productBairro, productDescription, globalTone } = params;

  // A. First attempt with backend Gemini proxy
  try {
    const response = await fetch("/api/gemini/optimize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params)
    });
    if (response.ok) {
      const data = await response.json();
      if (data && data.suggestedMessage) {
        return data;
      }
    }
  } catch (err) {
    console.warn("[apiClient] Express offline ou Gemini indisponível. Usando gerador estático local de alta performance.");
  }

  // B. High fidelity local copywriter rules engine
  const cat = productCategory || "Empreendimento Completo";
  const bneighborhood = productBairro || "Excelente Localização";
  const city = productCidade || "sua região";
  const toneLabel = globalTone || "amigavel";

  let greeting = "Olá!";
  let callToAction = "Poderia compartilhar os detalhes, valores e condições especiais?";
  let financeGreeting = "Gostaria de agendar uma simulação de financiamento bancário.";
  let justification = "Aplicação de copywriting contextualizada localmente de forma offline.";

  switch (toneLabel) {
    case "formal":
      greeting = "Prezados, tudo bem?";
      callToAction = `Gostaria de obter informações detalhadas sobre a disponibilidade de unidades no empreendimento ${productName}. Poderia me enviar o portfólio de vendas?`;
      financeGreeting = `Estou avaliando opções de aquisição para o ${productName} no bairro ${bneighborhood} de ${city}. Gostaria de solicitar simulações com base na tabela atualizada de custos de financiamento.`;
      justification = "Linguagem culta, uso de pronomes formais e foco em credibilidade imobiliária.";
      break;
    case "urgente":
      greeting = "Olá! Tenho urgência:";
      callToAction = `Vi o lançamento ${productName} em ${city} e quero reservar meu atendimento! Ainda restam unidades comerciais com descontos vigentes?`;
      financeGreeting = `Quero realizar uma simulação urgente para o ${cat} no condomínio ${productName} em ${city} para aproveitar a taxa promocional ativa!`;
      justification = "Injeção de gatilhos mentais fortes de escassez (restam poucas unidades) e urgência imediata do consumidor.";
      break;
    case "casual":
      greeting = "Eai, tudo bem?";
      callToAction = `Achei o ${productName} super legal! Quero saber mais sobre as opções de lazer e quando fica pronto. Quem pode me ajudar por aqui? 🚀`;
      financeGreeting = `Gostaria muito de simular o valor de entrada e parcelas para esse apartamento em ${bneighborhood}. Pode me repassar as tabelas práticas? Valeu!`;
      justification = "Uso de termos cotidianos, linguajar descontraído de chats comuns de WhatsApp e inserção de emojis positivos.";
      break;
    case "consultivo":
      greeting = "Olá, bom dia/tarde.";
      callToAction = `Estou analisando as opções de moradia no ${productName} em ${city}. Vocês poderiam me apresentar as plantas construtivas e os diferenciais técnicos do bairro ${bneighborhood}?`;
      financeGreeting = `Pretendo financiar minha casa própria através do programa associativo para o ${productName}. Qual o fluxo ideal de poupança/entrada recomendado para esse perfil?`;
      justification = "Abordagem focada em assessoria imobiliária personalizada, consultoria financeira e validação técnica estrutural.";
      break;
    case "amigavel":
    default:
      greeting = "Olá! Tudo bem?";
      callToAction = `Estava navegando e achei o projeto do ${productName} no site. Achei sensacional! Gostaria de bater um papo para tirar algumas dúvidas. Pode me ajudar?`;
      financeGreeting = `Olá! Quero muito comprar uma unidade no ${productName} localizado no bairro ${bneighborhood}. Poderíamos fazer uma simulação rápida do melhor plano de financiamento bancário para mim?`;
      justification = "Abordagem acolhedora, tom receptivo, foco em construir empatia imediata e facilidade de diálogo no primeiro contato.";
      break;
  }

  const suggestedMessage = `${greeting} Vi o empreendimento *${productName}* (${cat}) localizado em *${bneighborhood} na cidade de ${city}* e amei os diferenciais. ${callToAction}`;
  const suggestedFinanceMessage = `${greeting} Vi o *${productName}* no site e gostaria muito de realizar uma simulação prática de crédito direcionada ao projeto em *${bneighborhood} (${city})*. ${financeGreeting}`;

  return { suggestedMessage, suggestedFinanceMessage, justification };
}
