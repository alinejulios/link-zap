var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// server.ts
var import_express = __toESM(require("express"), 1);
var import_path = __toESM(require("path"), 1);
var import_vite = require("vite");
var import_genai = require("@google/genai");
var import_dotenv = __toESM(require("dotenv"), 1);
import_dotenv.default.config();
var app = (0, import_express.default)();
var PORT = 3e3;
var apiKey = process.env.GEMINI_API_KEY;
var ai = new import_genai.GoogleGenAI({
  apiKey,
  httpOptions: {
    headers: {
      "User-Agent": "aistudio-build"
    }
  }
});
app.use(import_express.default.json());
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", time: (/* @__PURE__ */ new Date()).toISOString() });
});
var diagnosticLogs = [];
function recordDiagnostic(brandId, url, responseTimeMs, status, statusCode, errorMessage) {
  const log = {
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
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
app.get("/api/health/integration", async (req, res) => {
  const targets = [
    { brand: "direcional", name: "Direcional Engenharia", url: "https://www.direcional.com.br/wp-json/wp/v2/empreendimento" },
    { brand: "riva", name: "Riva Incorporadora", url: "https://www.rivaincorporadora.com.br/wp-json/wp/v2/empreendimento" },
    { brand: "abyta", name: "Abyt\xE1 Incorporadora", url: "https://abyta.com.br/wp-json/wp/v2/enterprise/" }
  ];
  const results = await Promise.all(
    targets.map(async (target) => {
      const startTime = Date.now();
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5e3);
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
            latencyMs: duration
          };
        } else {
          return {
            brand: target.brand,
            name: target.name,
            url: target.url,
            status: "ERROR",
            statusCode: response.status,
            latencyMs: duration,
            error: `API retornou c\xF3digo ${response.status}`
          };
        }
      } catch (err) {
        clearTimeout(timeoutId);
        const duration = Date.now() - startTime;
        let errMsg = err.message;
        if (err.name === "AbortError") {
          errMsg = "Timeout ap\xF3s 5 segundos";
        }
        return {
          brand: target.brand,
          name: target.name,
          url: target.url,
          status: err.name === "AbortError" ? "TIMEOUT" : "OFFLINE",
          latencyMs: duration,
          error: errMsg
        };
      }
    })
  );
  res.json({
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    overallStatus: results.every((r) => r.status === "ONLINE") ? "HEALTHY" : "DEGRADED",
    brandConnectivity: results,
    recentDiagnosticLogs: diagnosticLogs.slice(0, 15)
  });
});
var apiCache = /* @__PURE__ */ new Map();
var CACHE_TTL = 3 * 60 * 1e3;
var ongoingFetches = /* @__PURE__ */ new Map();
function getCachedData(key) {
  const entry = apiCache.get(key);
  if (entry && Date.now() - entry.timestamp < CACHE_TTL) {
    return entry.data;
  }
  return null;
}
function setCachedData(key, data) {
  apiCache.set(key, { data, timestamp: Date.now() });
}
function matchesTaxonomyFilter(item, value, taxonomy) {
  if (!value || value === "all") return true;
  const taxProp = item[taxonomy];
  if (taxProp !== void 0 && taxProp !== null) {
    if (Array.isArray(taxProp)) {
      const match = taxProp.some((val) => {
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
    const foundTerm = termFlat.find(
      (t) => t && t.taxonomy === taxonomy && (String(t.id) === String(value) || String(t.slug) === String(value) || String(t.slug).toLowerCase() === String(value).toLowerCase())
    );
    if (foundTerm) return true;
  }
  return false;
}
var taxonomyFallbacks = {
  direcional: {
    filtros_top: [
      { id: 48, name: "Pronto para Morar", slug: "pronto-para-morar" },
      { id: 5440, name: "Em Constru\xE7\xE3o", slug: "em-construcao" },
      { id: 45, name: "Lan\xE7amento", slug: "lancamento" },
      { id: 46, name: "Breve Lan\xE7amento", slug: "breve-lancamento" },
      { id: 5441, name: "Pr\xE9-lan\xE7amento", slug: "pre-lancamento" }
    ],
    status_tag: [
      { id: 48, name: "Pronto para Morar", slug: "pronto-para-morar" },
      { id: 5440, name: "Em Constru\xE7\xE3o", slug: "em-construcao" },
      { id: 45, name: "Lan\xE7amento", slug: "lancamento" },
      { id: 46, name: "Breve Lan\xE7amento", slug: "breve-lancamento" }
    ],
    regional_comercial: [
      { id: 101, name: "Belo Horizonte / MG", slug: "belo-horizonte" },
      { id: 102, name: "S\xE3o Paulo / SP", slug: "sao-paulo" },
      { id: 103, name: "Rio de Janeiro / RJ", slug: "rio-de-janeiro" },
      { id: 104, name: "Campinas / SP", slug: "campinas" },
      { id: 105, name: "Manaus / AM", slug: "manaus" },
      { id: 107, name: "Bras\xEDlia / DF", slug: "brasilia" }
    ]
  },
  riva: {
    filtros_top: [
      { id: 48, name: "Pronto para Morar", slug: "pronto-para-morar" },
      { id: 5440, name: "Em Constru\xE7\xE3o", slug: "em-construcao" },
      { id: 45, name: "Lan\xE7amento", slug: "lancamento" },
      { id: 46, name: "Breve Lan\xE7amento", slug: "breve-lancamento" }
    ],
    status_tag: [
      { id: 48, name: "Pronto para Morar", slug: "pronto-para-morar" },
      { id: 5440, name: "Em Constru\xE7\xE3o", slug: "em-construcao" },
      { id: 45, name: "Lan\xE7amento", slug: "lancamento" },
      { id: 46, name: "Breve Lan\xE7amento", slug: "breve-lancamento" }
    ],
    regional_comercial: [
      { id: 102, name: "S\xE3o Paulo / SP", slug: "sao-paulo" },
      { id: 103, name: "Rio de Janeiro / RJ", slug: "rio-de-janeiro" },
      { id: 101, name: "Belo Horizonte / MG", slug: "belo-horizonte" }
    ]
  },
  abyta: {
    filtros_top: [
      { id: 48, name: "Pronto p/ Morar", slug: "pronto-para-morar" },
      { id: 5440, name: "Em Constru\xE7\xE3o", slug: "em-construcao" },
      { id: 45, name: "Lan\xE7amento", slug: "lancamento" }
    ],
    status_tag: [
      { id: 48, name: "Pronto p/ Morar", slug: "pronto-para-morar" },
      { id: 5440, name: "Em Constru\xE7\xE3o", slug: "em-construcao" }
    ],
    regional_comercial: [
      { id: 301, name: "S\xE3o Paulo / SP", slug: "sao-paulo" }
    ]
  }
};
function extractTermsFromMasterCache(brandId, requestedTaxonomy, postsOverride) {
  const termsMap = /* @__PURE__ */ new Map();
  const dataSources = postsOverride ? [postsOverride] : Array.from(apiCache.entries()).filter(([key]) => key.includes(`raw_wp_${brandId}`)).map(([, entry]) => entry.data);
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
        if (directProp !== void 0 && directProp !== null) {
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
async function ensureRawWPData(brandId, siteApiUrl, siteAccessToken, bypassCache) {
  const rawCacheKey = `raw_wp_${brandId}_${siteAccessToken || ""}`;
  if (!bypassCache) {
    const cached = getCachedData(rawCacheKey);
    if (cached && cached.length > 0) {
      console.log(`[ensureRawWPData] Cache HIT para a marca: ${brandId}`);
      return cached;
    }
  }
  if (ongoingFetches.has(rawCacheKey)) {
    console.log(`[ensureRawWPData] Requisi\xE7\xE3o paralela detectada para a chave '${rawCacheKey}'. Reutilizando promessa em andamento.`);
    return await ongoingFetches.get(rawCacheKey);
  }
  const fetchPromise = (async () => {
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
    console.log(`[ensureRawWPData] Cache MISS ou for\xE7ado. Iniciando fetch em cascade para a marca '${brandId}'...`);
    let lastError = null;
    let responseData = null;
    let workedUrl = "";
    let workedDuration = 0;
    for (const currentUrl of urlsToTry) {
      console.log(`[ensureRawWPData] Tentando: ${currentUrl}`);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1e4);
      const startTime = Date.now();
      try {
        const response = await fetch(currentUrl, {
          method: "GET",
          signal: controller.signal,
          headers: {
            "Accept": "application/json",
            ...siteAccessToken && { "Authorization": `Bearer ${siteAccessToken}` }
          }
        });
        clearTimeout(timeoutId);
        const duration = Date.now() - startTime;
        const text = await response.text();
        let parsed;
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
      } catch (err) {
        clearTimeout(timeoutId);
        const duration = Date.now() - startTime;
        console.warn(`[ensureRawWPData] Exce\xE7\xE3o para a URL: ${currentUrl} | ${err.message}`);
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
      const failMsg = lastError?.message || "A API de Integra\xE7\xE3o do WordPress falhou em todas as tentativas de fallback.";
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
app.post("/api/integration/site/sync", async (req, res) => {
  try {
    const { siteApiUrl, siteAccessToken, brandId, wpStatus, wpStatusTaxonomy, regionalComercial, bypassCache } = req.body;
    if (!siteApiUrl) {
      return res.status(400).json({ error: "A URL da API do site \xE9 necess\xE1ria." });
    }
    const resolvedBrandId = brandId || (siteApiUrl.includes("direcional") ? "direcional" : siteApiUrl.includes("riva") ? "riva" : "abyta");
    console.log(`Iniciando fluxo de sincroniza\xE7\xE3o otimizado para a marca: ${resolvedBrandId}`);
    let baseUrlForBrand = siteApiUrl;
    if (baseUrlForBrand.includes("?")) {
      baseUrlForBrand = baseUrlForBrand.split("?")[0];
    }
    let rawItems = [];
    try {
      rawItems = await ensureRawWPData(resolvedBrandId, siteApiUrl, siteAccessToken, bypassCache);
    } catch (err) {
      return res.status(500).json({
        success: false,
        error: "Falha na sincroniza\xE7\xE3o dos dados brutos com o WordPress.",
        details: err.message
      });
    }
    let filteredItems = rawItems;
    if (wpStatus && wpStatus !== "all") {
      const taxParam = wpStatusTaxonomy || "filtros_top";
      filteredItems = filteredItems.filter((item) => matchesTaxonomyFilter(item, wpStatus, taxParam));
    }
    if (regionalComercial && regionalComercial !== "all") {
      filteredItems = filteredItems.filter((item) => matchesTaxonomyFilter(item, regionalComercial, "regional_comercial"));
    }
    console.log(`[RESULTADO] ${filteredItems.length} de ${rawItems.length} empreendimentos disponibilizados (Filtros: Status=${wpStatus}, Regional=${regionalComercial})`);
    return res.json({
      success: true,
      message: "Cat\xE1logo sincronizado com a API Aberta do WordPress com sucesso!",
      syncedProductsCount: filteredItems.length,
      apiResponse: filteredItems
    });
  } catch (error) {
    console.error("Erro na sincroniza\xE7\xE3o da API do Site:", error);
    res.status(500).json({
      success: false,
      error: "Falha na requisi\xE7\xE3o de conex\xE3o com a API do Site.",
      details: error.message || error
    });
  }
});
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
    let rawItems = [];
    try {
      rawItems = await ensureRawWPData(brandOfUrl, siteApiUrl, siteAccessToken, bypassCache);
    } catch (err) {
      console.warn(`[REALTIME TERMS FETCH] Falha ao sincronizar dados brutos:`, err.message);
    }
    let extractedData = extractTermsFromMasterCache(brandOfUrl, taxonomy || "filtros_top", rawItems);
    if (extractedData.length === 0) {
      console.warn(`[REALTIME TERMS FETCH] Nenhum termo extra\xEDdo dinamicamente para '${taxonomy}' (${brandOfUrl}). Usando fallback est\xE1tico.`);
      extractedData = taxonomyFallbacks[brandOfUrl] && taxonomyFallbacks[brandOfUrl][taxonomy || "filtros_top"] || [];
    } else {
      console.log(`[REALTIME TERMS FETCH] Extra\xEDdos ${extractedData.length} termos com sucesso para taxonomia '${taxonomy}' (${brandOfUrl})`);
    }
    setCachedData(cacheKey, extractedData);
    recordDiagnostic(brandOfUrl, `${siteApiUrl}/terms/${taxonomy || "filtros_top"}`, 100, "SUCCESS", 200);
    return res.json(extractedData);
  } catch (error) {
    console.error("Erro ao processar termos do WordPress:", error);
    const brandOfUrl = siteApiUrl.includes("direcional") ? "direcional" : siteApiUrl.includes("riva") ? "riva" : "abyta";
    const fallbackData = taxonomyFallbacks[brandOfUrl] && taxonomyFallbacks[brandOfUrl][taxonomy || "filtros_top"] || [];
    return res.json(fallbackData);
  }
});
app.post("/api/integration/meta/fetch-shortlinks", async (req, res) => {
  try {
    const { metaAccessToken, metaWabaId, metaPhoneId } = req.body;
    if (!metaAccessToken) {
      return res.status(400).json({ error: "O Access Token da Meta \xE9 obrigat\xF3rio para autentica\xE7\xE3o." });
    }
    if (!metaPhoneId) {
      return res.status(400).json({ error: "O ID do Telefone da API da Meta \xE9 obrigat\xF3rio." });
    }
    console.log(`Buscando dados na API da Meta para o telefone ID: ${metaPhoneId}`);
    const metaUrl = `https://graph.facebook.com/v20.0/${metaPhoneId}?fields=name,display_phone_number,quality_rating`;
    const response = await fetch(metaUrl, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${metaAccessToken}`
      }
    });
    let responseData = {};
    const text = await response.text();
    try {
      responseData = JSON.parse(text);
    } catch {
      responseData = { rawText: text };
    }
    if (!response.ok) {
      return res.status(response.status).json({
        success: false,
        error: `A API da Meta Graph retornou c\xF3digo de erro: ${response.status}`,
        details: responseData
      });
    }
    res.json({
      success: true,
      message: "Conex\xE3o com a API Oficial da Meta realizada com sucesso!",
      businessMeta: responseData,
      suggestedShortLinks: [
        { code: "CBGRWRMFVHCTL1", description: "GA - Direcional Engenharia" },
        { code: "DIR_SDR_CODE_1", description: "SDR - Direcional Engenharia" }
      ]
    });
  } catch (error) {
    console.error("Erro na conex\xE3o com a API da Meta:", error);
    res.status(500).json({
      success: false,
      error: "Falha ao se conectar com a API da Meta Cloud WhatsApp.",
      details: error.message || error
    });
  }
});
app.post("/api/gemini/optimize", async (req, res) => {
  try {
    const { productName, productCategory, productCidade, productBairro, productDescription, globalTone } = req.body;
    if (!productName) {
      return res.status(400).json({ error: "O nome do produto \xE9 obrigat\xF3rio para gerar a sugest\xE3o." });
    }
    if (!apiKey) {
      return res.status(503).json({
        error: "A chave API do Gemini n\xE3o est\xE1 configurada nos segredos do projeto. Voc\xEA ainda pode usar o gerador manual offline!"
      });
    }
    const descText = productDescription ? `. Detalhes/descri\xE7\xE3o do empreendimento: "${productDescription}"` : "";
    const toneText = globalTone ? `O tom de voz deve ser obrigatoriamente "${globalTone}".` : "O tom de voz deve ser persuasivo, amig\xE1vel e prop\xEDcio \xE0 convers\xE3o de vendas.";
    const prompt = `Voc\xEA \xE9 um redator publicit\xE1rio de alta performance especialista em vendas do mercado imobili\xE1rio (Direcional Engenharia).
Gere dois modelos de mensagem inicial de WhatsApp sob a perspectiva do CLIENTE (o cliente envia para a sua empresa ao clicar no link do empreendimento imobili\xE1rio).

Informa\xE7\xF5es do empreendimento:
- Nome: "${productName}"
- Categoria/Etapa: "${productCategory || "Breve Lan\xE7amento"}"
- Cidade: "${productCidade || "Contagem"}"
- Bairro: "${productBairro || "Centro"}"
- Detalhes adicionais: ${descText || "Nenhum detalhe adicional"}

Diretrizes:
1. Modelo 1 - Pedido de Informa\xE7\xF5es Gerais:
   - Exemplo de refer\xEAncia: "Ol\xE1! Estava no site da Direcional e gostaria de mais informa\xE7\xF5es sobre o(a) ${productName}. Pode me ajudar?"
   - Crie uma version otimizada baseada neste modelo, mantendo curto, simp\xE1tico e contendo o nome do condom\xEDnio.

2. Modelo 2 - Simula\xE7\xE3o de Financiamento:
   - Exemplo de refer\xEAncia: "Ol\xE1! Estava no site da Direcional e gostaria de realizar uma simula\xE7\xE3o para o ${productCategory || "Breve Lan\xE7amento"} no ${productBairro || "Centro"} de ${productCidade || "Contagem"}. Pode me ajudar?"
   - Crie uma vers\xE3o otimizada baseada neste modelo, contextualizando a simula\xE7\xE3o de financiamento usando o Bairro, Cidade e Categoria apropriados do condom\xEDnio.

3. Ambas as mensagens devem ser curtas, persuasivas, e em primeira pessoa (escrita pelo cliente).
4. Utilize emojis moderadamente e inclua detalhes como o tom da marca. ${toneText}

Retorne estritamente um objeto JSON v\xE1lido (sem crases de bloco markdown \`\`\`json ou texto explicativo ao redor, apenas o JSON bruto) com este formato:
{
  "suggestedMessage": "Sua sugest\xE3o de texto otimizada de informa\xE7\xF5es aqui",
  "suggestedFinanceMessage": "Sua sugest\xE3o de texto otimizada de simula\xE7\xE3o de financiamento aqui",
  "justification": "Breve justificativa t\xE9cnica do tom e gatilhos aplicados."
}
`;
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        systemInstruction: "Voc\xEA \xE9 um assistente especialista em convers\xE3o de vendas imobili\xE1rias e copywriting s\xEAnior. Responda apenas com o JSON bruto solicitado."
      }
    });
    const resultText = response.text?.trim() || "";
    if (!resultText) {
      throw new Error("O modelo Gemini n\xE3o retornou nenhum texto.");
    }
    try {
      const data = JSON.parse(resultText);
      res.json(data);
    } catch (parseError) {
      const cleanedText = resultText.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();
      const data = JSON.parse(cleanedText);
      res.json(data);
    }
  } catch (error) {
    console.error("Erro na integra\xE7\xE3o com o Gemini:", error);
    res.status(500).json({
      error: "Falha ao gerar sugest\xE3o com a intelig\xEAncia artificial.",
      details: error.message || error
    });
  }
});
async function setupServer() {
  if (process.env.NODE_ENV !== "production") {
    console.log("Starting development mode with Vite middleware...");
    const vite = await (0, import_vite.createServer)({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    console.log("Starting production mode...");
    const distPath = import_path.default.join(process.cwd(), "dist");
    app.use(import_express.default.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(import_path.default.join(distPath, "index.html"));
    });
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}
setupServer();
//# sourceMappingURL=server.cjs.map
