export interface Product {
  id: string; // Internal ID
  name: string;
  cidade: string; // City
  bairro: string; // Neighborhood
  category?: string; // e.g. "Breve Lançamento"
  description?: string;
  customPhone?: string; // Optional override salesperson number for this item
  customMessage?: string; // Optional custom message template override (informações)
  customFinanceMessage?: string; // Optional custom finance message template override (financiamento)
  utmCampaign?: string; // campaign override e.g. "apartamento-pinheiros"
  clicks: number; // Click metrics (internally tracked simulated clicks)
  createdAt: string;
  brandId?: string; // Selected brand ID ("direcional", "riva", "abyta")
  regional?: string; // Optional commercial regional e.g. "São Paulo", "Rio de Janeiro"
}

export interface BrandConfig {
  id: string; // "direcional" | "riva" | "abyta"
  name: string;
  phone: string;
  sdrPhone?: string; // SDR phone
  siteApiUrl?: string; // Brand specific API
  siteAccessToken?: string; // Brand specific Token
  metaGaPhoneNumberId?: string;
  metaGaWabaId?: string;
  metaSdrPhoneNumberId?: string;
  metaSdrWabaId?: string;
}

export interface GlobalConfig {
  defaultPhone: string;
  defaultMessage: string;
  defaultFinanceMessage: string;
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
  companyName: string;
  brands: BrandConfig[];
  siteApiUrl: string;
  siteAccessToken: string;
  metaAccessToken?: string; // Meta System User Token
  metaWabaId?: string; // Meta WABA ID
  adminEmails?: string[];
  userEmails?: string[];
  spreadsheetId?: string;
  sheetsSyncInterval?: number; // In minutes, 0 means disabled
}

export type MessageTone = "amigavel" | "formal" | "urgente" | "casual" | "consultivo";

export const BRAND_DEFAULT_PHONES: Record<string, { ga: string; sdr?: string; labelGa: string; labelSdr?: string }> = {
  direcional: {
    ga: "553140200400",
    sdr: "553198396041",
    labelGa: "31 4020-0400",
    labelSdr: "31 9839-6041"
  },
  riva: {
    ga: "553140071120",
    sdr: "5511973479997",
    labelGa: "31 4007-1120",
    labelSdr: "11 97347-9997"
  },
  abyta: {
    ga: "5511973429247",
    labelGa: "11 97342-9247"
    // SDR not available yet
  }
};

export const DEFAULT_GLOBAL_CONFIG: GlobalConfig = {
  defaultPhone: "553140200400", // Base default number in Brazil format (+55)
  defaultMessage: "Olá! Estava no site da {NOME_EMPRESA} e gostaria de mais informações sobre o(a) {NOME_PRODUTO}. Pode me ajudar?",
  defaultFinanceMessage: "Olá! Estava no site da {NOME_EMPRESA} e gostaria de realizar uma simulação para o {STATUS} no {BAIRRO} de {CIDADE}. Pode me ajudar?",
  utmSource: "whatsapp",
  utmMedium: "link-do-produto",
  utmCampaign: "campanha-vendas",
  companyName: "Direcional",
  brands: [
    {
      id: "direcional",
      name: "Direcional Engenharia",
      phone: "553140200400",
      sdrPhone: "553198396041",
      siteApiUrl: "https://www.direcional.com.br/wp-json/wp/v2/empreendimento",
      siteAccessToken: "",
      metaGaPhoneNumberId: "839365472599480",
      metaGaWabaId: "2208578326299282",
      metaSdrPhoneNumberId: "779823718546695",
      metaSdrWabaId: "702750576115425"
    },
    {
      id: "riva",
      name: "Riva Incorporadora",
      phone: "553140071120",
      sdrPhone: "5511973479997",
      siteApiUrl: "https://www.rivaincorporadora.com.br/wp-json/wp/v2/empreendimento",
      siteAccessToken: "",
      metaGaPhoneNumberId: "931134676746772",
      metaGaWabaId: "1119196000043718",
      metaSdrPhoneNumberId: "712371051952531",
      metaSdrWabaId: "584667034679368"
    },
    {
      id: "abyta",
      name: "Abytá Incorporadora",
      phone: "5511973429247",
      sdrPhone: "",
      siteApiUrl: "https://abyta.com.br/wp-json/wp/v2/enterprise/",
      siteAccessToken: "",
      metaGaPhoneNumberId: "961305733736204",
      metaGaWabaId: "1299931935295395",
      metaSdrPhoneNumberId: "961305733736204",
      metaSdrWabaId: "1299931935295395"
    }
  ],
  siteApiUrl: "https://www.direcional.com.br/wp-json/wp/v2/empreendimento",
  siteAccessToken: "",
  metaAccessToken: "",
  metaWabaId: "",
  adminEmails: [
    "aline.silva@direcional.com.br",
    "lucas.spessoa@direcional.com.br",
    "sabrina.braga@direcional.com.br",
    "nucleodigital.grupodirecional@gmail.com"
  ],
  userEmails: [
    "aline.silva@direcional.com.br",
    "mayara.salomao@direcional.com.br",
    "evelin.rocha@direcional.com.br",
    "lucas.felipe@direcional.com.br",
    "lucas.spessoa@direcional.com.br",
    "sabrina.braga@direcional.com.br",
    "nucleodigital.grupodirecional@gmail.com"
  ],
  sheetsSyncInterval: 0
};

export interface LinkAnalysis {
  length: number;
  isSafe: boolean;
  warnings: string[];
}
