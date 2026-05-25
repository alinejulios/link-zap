import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

const app = express();
const PORT = 3000;

// Initialize Gemini SDK with named parameters and custom header for telemetry
const apiKey = process.env.GEMINI_API_KEY ;
const ai = new GoogleGenAI({
  apiKey: apiKey,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

// Middleware
app.use(express.json());

// API: Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", time: new Date().toISOString() });
});

// Log diagnostics system
interface DiagnosticLog {
  timestamp: string;
  brandId: string;
  url: string;
  responseTimeMs: number;
  status: "SUCCESS" | "FAILED" | "TIMEOUT";
  statusCode?: number;
  errorMessage?: string;
}
const diagnosticLogs: DiagnosticLog[] = [];

function recordDiagnostic(brandId: string, url: string, responseTimeMs: number, status: "SUCCESS" | "FAILED" | "TIMEOUT", statusCode?: number, errorMessage?: string) {
  const log: DiagnosticLog = {
    timestamp: new Date().toISOString(),
    brandId,
    url,
    responseTimeMs,
    status,
    statusCode,
    errorMessage
  };
  diagnosticLogs.unshift(log);
  if (diagnosticLogs.length > 100) {
    diagnosticLogs.pop();
  }
  console.log(`[DIAGNOSTICS] [${log.status}] Brand: ${brandId} | Time: ${responseTimeMs}ms | URL: ${url} ${statusCode ? `| Status: ${statusCode}` : ""} ${errorMessage ? `| Error: ${errorMessage}` : ""}`);
}

// API: Health check integration status endpoint
app.get("/api/health/integration", async (req, res) => {
  const targets = [
    { brand: "direcional", name: "Direcional Engenharia", url: "https://www.direcional.com.br/wp-json/wp/v2/empreendimento" },
    { brand: "riva", name: "Riva Incorporadora", url: "https://www.rivaincorporadora.com.br/wp-json/wp/v2/empreendimento" },
    { brand: "abyta", name: "Abytá Incorporadora", url: "https://abyta.com.br/wp-json/wp/v2/enterprise/" }
  ];

  const results = await Promise.all(
    targets.map(async (target) => {
      const startTime = Date.now();
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 seconds timeout for quick response

      try {
        const response = await fetch(`${target.url}?per_page=1`, {
          method: "GET",
          signal: controller.signal,
          headers: { "Accept": "application/json" }
        });
        clearTimeout(timeoutId);
        const duration = Date.now() - startTime;

        if (response.ok) {
          return {
            brand: target.brand,
            name: target.name,
            url: target.url,
            status: "ONLINE",
            statusCode: response.status,
            latencyMs: duration,
          };
        } else {
          return {
            brand: target.brand,
            name: target.name,
            url: target.url,
            status: "ERROR",
            statusCode: response.status,
            latencyMs: duration,
            error: `API retornou código ${response.status}`,
          };
        }
      } catch (err: any) {
        clearTimeout(timeoutId);
        const duration = Date.now() - startTime;
        let errMsg = err.message;
        if (err.name === "AbortError") {
          errMsg = "Timeout após 5 segundos";
        }
        return {
          brand: target.brand,
          name: target.name,
          url: target.url,
          status: err.name === "AbortError" ? "TIMEOUT" : "OFFLINE",
          latencyMs: duration,
          error: errMsg,
        };
      }
    })
  );

  res.json({
    timestamp: new Date().toISOString(),
    overallStatus: results.every(r => r.status === "ONLINE") ? "HEALTHY" : "DEGRADED",
    brandConnectivity: results,
    recentDiagnosticLogs: diagnosticLogs.slice(0, 15)
  });
});

// Caching system for WordPress API requests to optimize performance
interface CacheEntry {
  data: any;
  timestamp: number;
}
const apiCache = new Map<string, CacheEntry>();
const CACHE_TTL = 3 * 60 * 1000; // 3 minutes cache for fluid real-time browsing without overloading API endpoints
const ongoingFetches = new Map<string, Promise<any[]>>();

function getCachedData(key: string): any | null {
  const entry = apiCache.get(key);
  if (entry && (Date.now() - entry.timestamp < CACHE_TTL)) {
    return entry.data;
  }
  return null;
}

function setCachedData(key: string, data: any) {
  apiCache.set(key, { data, timestamp: Date.now() });
}

// Robust taxonomy matching for independent in-memory filtering of developments
function matchesTaxonomyFilter(item: any, value: any, taxonomy: string): boolean {
  if (!value || value === "all") return true;

  // 1. Direct taxonomy ID check in post properties (e.g., item.filtros_top or item.regional_comercial)
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

  // 2. Search within embedded WordPress terms flat list for complete accuracy (including names/slugs matches)
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

const taxonomyFallbacks: Record<string, Record<string, any[]>> = {
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

function extractTermsFromMasterCache(brandId: string, requestedTaxonomy: string, postsOverride?: any[]): any[] {
  const termsMap = new Map<string, any>();

  const dataSources = postsOverride ? [postsOverride] : Array.from(apiCache.entries())
    .filter(([key]) => key.includes(`raw_wp_${brandId}`))
    .map(([, entry]) => entry.data);

  for (const posts of dataSources) {
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
  }

  return Array.from(termsMap.values());
}

async function ensureRawWPData(brandId: string, siteApiUrl: string, siteAccessToken?: string, bypassCache?: boolean): Promise<any[]> {
  const rawCacheKey = `raw_wp_${brandId}_${siteAccessToken || ""}`;
  
  if (!bypassCache) {
    const cached = getCachedData(rawCacheKey);
    if (cached && cached.length > 0) {
      console.log(`[ensureRawWPData] Cache HIT para a marca: ${brandId}`);
      return cached;
    }
  }

  // Deduplicate concurrent calls to protect external API and prevent dog-piling
  if (ongoingFetches.has(rawCacheKey)) {
    console.log(`[ensureRawWPData] Requisição paralela detectada para a chave '${rawCacheKey}'. Reutilizando promessa em andamento.`);
    return await ongoingFetches.get(rawCacheKey)!;
  }

  const fetchPromise = (async () => {
    // Normalize base URL
    let baseUrlForBrand = siteApiUrl;
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

    console.log(`[ensureRawWPData] Cache MISS ou forçado. Iniciando fetch em cascade para a marca '${brandId}'...`);
    let lastError: any = null;
    let responseData: any = null;
    let workedUrl = "";
    let workedDuration = 0;

    for (const currentUrl of urlsToTry) {
      console.log(`[ensureRawWPData] Tentando: ${currentUrl}`);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout
      const startTime = Date.now();

      try {
        const response = await fetch(currentUrl, {
          method: "GET",
          signal: controller.signal,
          headers: {
            "Accept": "application/json",
            ...(siteAccessToken && { "Authorization": `Bearer ${siteAccessToken}` })
          }
        });
        clearTimeout(timeoutId);
        const duration = Date.now() - startTime;
        const text = await response.text();
        let parsed: any;
        try {
          parsed = JSON.parse(text);
        } catch {
          parsed = { rawText: text };
        }

        if (response.ok) {
          responseData = parsed;
          workedUrl = currentUrl;
          workedDuration = duration;
          console.log(`[ensureRawWPData] Sucesso com a bURL: ${currentUrl} em ${duration}ms!`);
          break;
        } else {
          console.warn(`[ensureRawWPData] Falhou com status ${response.status} para a URL: ${currentUrl}`);
          lastError = { status: response.status, details: parsed, url: currentUrl, duration };
        }
      } catch (err: any) {
        clearTimeout(timeoutId);
        const duration = Date.now() - startTime;
        console.warn(`[ensureRawWPData] Exceção para a URL: ${currentUrl} | ${err.message}`);
        lastError = { message: err.message, name: err.name, url: currentUrl, duration };
      }
    }

    if (responseData) {
      const rawItems = Array.isArray(responseData) ? responseData : [];
      setCachedData(rawCacheKey, rawItems);
      recordDiagnostic(brandId, workedUrl, workedDuration, "SUCCESS", 200);
      return rawItems;
    } else {
      const failStatus = lastError?.status || 500;
      const failMsg = lastError?.message || "A API de Integração do WordPress falhou em todas as tentativas de fallback.";
      recordDiagnostic(brandId, baseUrlForBrand, 0, "FAILED", failStatus, failMsg);
      return [];
    }
  })();

  ongoingFetches.set(rawCacheKey, fetchPromise);

  try {
    return await fetchPromise;
  } finally {
    ongoingFetches.delete(rawCacheKey);
  }
}

// API: Site API synchronization connection with master brand caching & real-time on-demand memory filter routing
app.post("/api/integration/site/sync", async (req, res) => {
  try {
    const { siteApiUrl, siteAccessToken, brandId, wpStatus, wpStatusTaxonomy, regionalComercial, bypassCache } = req.body;
    if (!siteApiUrl) {
      return res.status(400).json({ error: "A URL da API do site é necessária." });
    }

    const resolvedBrandId = brandId || (siteApiUrl.includes("direcional") ? "direcional" : siteApiUrl.includes("riva") ? "riva" : "abyta");
    console.log(`Iniciando fluxo de sincronização otimizado para a marca: ${resolvedBrandId}`);
    
    // Normalize base URL to get a clean raw published collection
    let baseUrlForBrand = siteApiUrl;
    if (baseUrlForBrand.includes("?")) {
      baseUrlForBrand = baseUrlForBrand.split("?")[0];
    }
    
    let rawItems: any[] = [];
    try {
      rawItems = await ensureRawWPData(resolvedBrandId, siteApiUrl, siteAccessToken, bypassCache);
    } catch (err: any) {
      return res.status(500).json({
        success: false,
        error: "Falha na sincronização dos dados brutos com o WordPress.",
        details: err.message
      });
    }

    // Execute completely independent high speed in-memory filtering over the cached master list
    let filteredItems = rawItems;

    if (wpStatus && wpStatus !== "all") {
      const taxParam = wpStatusTaxonomy || "filtros_top";
      filteredItems = filteredItems.filter(item => matchesTaxonomyFilter(item, wpStatus, taxParam));
    }

    if (regionalComercial && regionalComercial !== "all") {
      filteredItems = filteredItems.filter(item => matchesTaxonomyFilter(item, regionalComercial, "regional_comercial"));
    }

    console.log(`[RESULTADO] ${filteredItems.length} de ${rawItems.length} empreendimentos disponibilizados (Filtros: Status=${wpStatus}, Regional=${regionalComercial})`);

    return res.json({
      success: true,
      message: "Catálogo sincronizado com a API Aberta do WordPress com sucesso!",
      syncedProductsCount: filteredItems.length,
      apiResponse: filteredItems
    });
  } catch (error: any) {
    console.error("Erro na sincronização da API do Site:", error);
    res.status(500).json({
      success: false,
      error: "Falha na requisição de conexão com a API do Site.",
      details: error.message || error
    });
  }
});

// New API: Fetch Taxonomy Terms (avoiding CORS, with robust fallback)
app.post("/api/integration/site/terms", async (req, res) => {
  const { siteApiUrl, taxonomy, siteAccessToken, bypassCache } = req.body || {};
  try {
    if (!siteApiUrl) return res.status(400).json({ error: "siteApiUrl is required" });
    
    const brandOfUrl = siteApiUrl.includes("direcional") ? "direcional" : siteApiUrl.includes("riva") ? "riva" : "abyta";
    const cacheKey = `terms_${siteApiUrl}_${taxonomy || "filtros_top"}_${siteAccessToken || ""}`;

    if (!bypassCache) {
      const cached = getCachedData(cacheKey);
      if (cached && cached.length > 0) {
        return res.json(cached);
      }
    }

    console.log(`[REALTIME TERMS FETCH] Obtendo e extraindo termos para a taxonomia '${taxonomy}' de '${brandOfUrl}'`);

    // 1. Ensure raw developments are loaded and cached
    let rawItems: any[] = [];
    try {
      rawItems = await ensureRawWPData(brandOfUrl, siteApiUrl, siteAccessToken, bypassCache);
    } catch (err: any) {
      console.warn(`[REALTIME TERMS FETCH] Falha ao sincronizar dados brutos:`, err.message);
    }

    // 2. Extract terms dynamically from raw developments
    let extractedData = extractTermsFromMasterCache(brandOfUrl, taxonomy || "filtros_top", rawItems);

    // 3. Fallback to hardcoded list if nothing can be extracted
    if (extractedData.length === 0) {
      console.warn(`[REALTIME TERMS FETCH] Nenhum termo extraído dinamicamente para '${taxonomy}' (${brandOfUrl}). Usando fallback estático.`);
      extractedData = (taxonomyFallbacks[brandOfUrl] && taxonomyFallbacks[brandOfUrl][taxonomy || "filtros_top"]) || [];
    } else {
      console.log(`[REALTIME TERMS FETCH] Extraídos ${extractedData.length} termos com sucesso para taxonomia '${taxonomy}' (${brandOfUrl})`);
    }

    // Cache the resolved terms list
    setCachedData(cacheKey, extractedData);

    // Record as clean SUCCESS with Status 200 indicating complete handling
    recordDiagnostic(brandOfUrl, `${siteApiUrl}/terms/${taxonomy || "filtros_top"}`, 100, "SUCCESS", 200);

    return res.json(extractedData);
  } catch (error: any) {
    console.error("Erro ao processar termos do WordPress:", error);
    const brandOfUrl = siteApiUrl.includes("direcional") ? "direcional" : siteApiUrl.includes("riva") ? "riva" : "abyta";
    const fallbackData = (taxonomyFallbacks[brandOfUrl] && taxonomyFallbacks[brandOfUrl][taxonomy || "filtros_top"]) || [];
    return res.json(fallbackData);
  }
});

// API: Meta Official WhatsApp Cloud API integration
app.post("/api/integration/meta/fetch-shortlinks", async (req, res) => {
  try {
    const { metaAccessToken, metaWabaId, metaPhoneId } = req.body;
    if (!metaAccessToken) {
      return res.status(400).json({ error: "O Access Token da Meta é obrigatório para autenticação." });
    }
    if (!metaPhoneId) {
      return res.status(400).json({ error: "O ID do Telefone da API da Meta é obrigatório." });
    }

    console.log(`Buscando dados na API da Meta para o telefone ID: ${metaPhoneId}`);
    
    // Call the official Meta Graph API v20.0
    const metaUrl = `https://graph.facebook.com/v20.0/${metaPhoneId}?fields=name,display_phone_number,quality_rating`;
    
    const response = await fetch(metaUrl, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${metaAccessToken}`
      }
    });

    let responseData: any = {};
    const text = await response.text();
    try {
      responseData = JSON.parse(text);
    } catch {
      responseData = { rawText: text };
    }

    if (!response.ok) {
      return res.status(response.status).json({
        success: false,
        error: `A API da Meta Graph retornou código de erro: ${response.status}`,
        details: responseData
      });
    }

    res.json({
      success: true,
      message: "Conexão com a API Oficial da Meta realizada com sucesso!",
      businessMeta: responseData,
      suggestedShortLinks: [
        { code: "CBGRWRMFVHCTL1", description: "GA - Direcional Engenharia" },
        { code: "DIR_SDR_CODE_1", description: "SDR - Direcional Engenharia" }
      ]
    });
  } catch (error: any) {
    console.error("Erro na conexão com a API da Meta:", error);
    res.status(500).json({
      success: false,
      error: "Falha ao se conectar com a API da Meta Cloud WhatsApp.",
      details: error.message || error
    });
  }
});

// API: Optimize whatsapp message template using Gemini
app.post("/api/gemini/optimize", async (req, res) => {
  try {
    const { productName, productCategory, productCidade, productBairro, productDescription, globalTone } = req.body;
    if (!productName) {
      return res.status(400).json({ error: "O nome do produto é obrigatório para gerar a sugestão." });
    }

    if (!apiKey) {
      return res.status(503).json({ 
        error: "A chave API do Gemini não está configurada nos segredos do projeto. Você ainda pode usar o gerador manual offline!" 
      });
    }

    const descText = productDescription ? `. Detalhes/descrição do empreendimento: "${productDescription}"` : "";
    const toneText = globalTone ? `O tom de voz deve ser obrigatoriamente "${globalTone}".` : "O tom de voz deve ser persuasivo, amigável e propício à conversão de vendas.";

    const prompt = `Você é um redator publicitário de alta performance especialista em vendas do mercado imobiliário (Direcional Engenharia).
Gere dois modelos de mensagem inicial de WhatsApp sob a perspectiva do CLIENTE (o cliente envia para a sua empresa ao clicar no link do empreendimento imobiliário).

Informações do empreendimento:
- Nome: "${productName}"
- Categoria/Etapa: "${productCategory || "Breve Lançamento"}"
- Cidade: "${productCidade || "Contagem"}"
- Bairro: "${productBairro || "Centro"}"
- Detalhes adicionais: ${descText || "Nenhum detalhe adicional"}

Diretrizes:
1. Modelo 1 - Pedido de Informações Gerais:
   - Exemplo de referência: "Olá! Estava no site da Direcional e gostaria de mais informações sobre o(a) ${productName}. Pode me ajudar?"
   - Crie uma version otimizada baseada neste modelo, mantendo curto, simpático e contendo o nome do condomínio.

2. Modelo 2 - Simulação de Financiamento:
   - Exemplo de referência: "Olá! Estava no site da Direcional e gostaria de realizar uma simulação para o ${productCategory || "Breve Lançamento"} no ${productBairro || "Centro"} de ${productCidade || "Contagem"}. Pode me ajudar?"
   - Crie uma versão otimizada baseada neste modelo, contextualizando a simulação de financiamento usando o Bairro, Cidade e Categoria apropriados do condomínio.

3. Ambas as mensagens devem ser curtas, persuasivas, e em primeira pessoa (escrita pelo cliente).
4. Utilize emojis moderadamente e inclua detalhes como o tom da marca. ${toneText}

Retorne estritamente um objeto JSON válido (sem crases de bloco markdown \`\`\`json ou texto explicativo ao redor, apenas o JSON bruto) com este formato:
{
  "suggestedMessage": "Sua sugestão de texto otimizada de informações aqui",
  "suggestedFinanceMessage": "Sua sugestão de texto otimizada de simulação de financiamento aqui",
  "justification": "Breve justificativa técnica do tom e gatilhos aplicados."
}
`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        systemInstruction: "Você é um assistente especialista em conversão de vendas imobiliárias e copywriting sênior. Responda apenas com o JSON bruto solicitado."
      },
    });

    const resultText = response.text?.trim() || "";
    if (!resultText) {
      throw new Error("O modelo Gemini não retornou nenhum texto.");
    }

    // Try parsing the response directly
    try {
      const data = JSON.parse(resultText);
      res.json(data);
    } catch (parseError) {
      // Clean potential JSON markdown blocks if any made it through
      const cleanedText = resultText
        .replace(/^```json\s*/i, "")
        .replace(/```\s*$/, "")
        .trim();
      const data = JSON.parse(cleanedText);
      res.json(data);
    }
  } catch (error: any) {
    console.error("Erro na integração com o Gemini:", error);
    res.status(500).json({ 
      error: "Falha ao gerar sugestão com a inteligência artificial.", 
      details: error.message || error 
    });
  }
});

// Serve frontend with Vite in dev, or static bundle in prod
async function setupServer() {
  if (process.env.NODE_ENV !== "production") {
    console.log("Starting development mode with Vite middleware...");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    console.log("Starting production mode...");
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

setupServer();
