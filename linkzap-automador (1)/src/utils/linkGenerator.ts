import { Product, GlobalConfig, BRAND_DEFAULT_PHONES } from "../types";

/**
 * Clean phone numbers to only contain digits (no +, spaces, brackets, or dashes)
 */
export function cleanPhoneNumber(phone: string | undefined | null): string {
  return (phone || "").replace(/\D/g, "");
}

/**
 * Replace placeholders in the message template with real values
 */
export function interpolateMessage(
  template: string | undefined | null,
  product: Product,
  config: GlobalConfig
): string {
  let message = template || "";
  
  // Determine active brand's name for {Nome_Empresa}
  const brandName = config.brands?.find((b) => b.id === product.brandId)?.name || config.companyName || "";

  // Dynamic replacements (supporting legacy variables and newly requested ones)
  message = message.replace(/{NOME_PRODUTO}/gi, product.name || "");
  message = message.replace(/{NOME_EMPRESA}/gi, brandName);
  message = message.replace(/{CIDADE}/gi, product.cidade || "");
  message = message.replace(/{BAIRRO}/gi, product.bairro || "");
  message = message.replace(/{CATEGORIA}/gi, product.category || "");
  // Support exact requested aliases mapping to same fields:
  message = message.replace(/{STATUS}/gi, product.category || "");
  
  // Custom tracking additions based on configured UTM tags if the template uses it
  const utmCampaign = product.utmCampaign || config.utmCampaign;
  message = message.replace(/{UTM_CAMPAIGN}/gi, utmCampaign || "");
  message = message.replace(/{UTM_SOURCE}/gi, config.utmSource || "");
  
  return message;
}

/**
 * Generate full WhatsApp link using the standard wa.me/NUM?text=MSG format
 */
export function generateWhatsAppLink(
  product: Product,
  config: GlobalConfig,
  templateType: "info" | "finance" = "info",
  phoneType: "ga" | "sdr" = "ga"
): string {
  // Resolve brand based on product setting (defaulting to "direcional")
  const brandId = product.brandId || "direcional";
  
  // Resolve editable target phone number based on active configuration first, falling back to static map
  let targetPhone = product.customPhone;
  if (!targetPhone) {
    const brand = config.brands?.find((b) => b.id === brandId);
    if (brand) {
      if (phoneType === "ga") {
        targetPhone = brand.phone;
      } else {
        targetPhone = brand.sdrPhone || brand.phone;
      }
    } else {
      const mapped = BRAND_DEFAULT_PHONES[brandId];
      if (mapped) {
        if (phoneType === "ga") {
          targetPhone = mapped.ga;
        } else {
          targetPhone = mapped.sdr || mapped.ga;
        }
      } else {
        targetPhone = config.defaultPhone;
      }
    }
  }

  const phone = cleanPhoneNumber(targetPhone);
  
  // Choose template category rules
  const messageTemplate = templateType === "finance"
    ? (product.customFinanceMessage || config.defaultFinanceMessage)
    : (product.customMessage || config.defaultMessage);

  const interpolatedText = interpolateMessage(messageTemplate, product, config);
  
  const encodedText = encodeURIComponent(interpolatedText);
  return `https://wa.me/${phone}?text=${encodedText}`;
}

/**
 * Generate tracking meta-string for internal system logs
 */
export function getLinkUTMString(product: Product, config: GlobalConfig): string {
  const source = encodeURIComponent(config.utmSource);
  const medium = encodeURIComponent(config.utmMedium);
  const campaign = encodeURIComponent(product.utmCampaign || config.utmCampaign);
  const content = encodeURIComponent(product.id);
  
  return `?utm_source=${source}&utm_medium=${medium}&utm_campaign=${campaign}&utm_content=${content}`;
}
