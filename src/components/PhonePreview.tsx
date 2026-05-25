import React from "react";
import { Product, GlobalConfig, BRAND_DEFAULT_PHONES } from "../types";
import { interpolateMessage, cleanPhoneNumber } from "../utils/linkGenerator";

interface PhonePreviewProps {
  product: Product;
  config: GlobalConfig;
  templateType?: "info" | "finance";
  phoneType?: "ga" | "sdr";
}

export default function PhonePreview({ product, config, templateType = "info", phoneType = "ga" }: PhonePreviewProps) {
  const rawMessage = templateType === "finance"
    ? (product.customFinanceMessage || config.defaultFinanceMessage)
    : (product.customMessage || config.defaultMessage);
  const text = interpolateMessage(rawMessage, product, config);

  // Resolve Brand Information
  const brandId = product.brandId || "direcional";
  const brand = config.brands?.find((b) => b.id === brandId) || config.brands?.[0];

  const brandName = brand ? brand.name : config.companyName;
  
  // Resolve editable target phone number based on active configuration first, falling back to static map
  let chosenPhone = product.customPhone;
  if (!chosenPhone) {
    if (brand) {
      if (phoneType === "ga") {
        chosenPhone = brand.phone;
      } else {
        chosenPhone = brand.sdrPhone || brand.phone;
      }
    } else {
      const mapped = BRAND_DEFAULT_PHONES[brandId];
      if (mapped) {
        if (phoneType === "ga") {
          chosenPhone = mapped.ga;
        } else {
          chosenPhone = mapped.sdr || mapped.ga;
        }
      } else {
        chosenPhone = config.defaultPhone;
      }
    }
  }

  const phone = cleanPhoneNumber(chosenPhone);

  // Helper to format WhatsApp markdown (*bold*, _italic_, ~strike~, \n)
  const formatWhatsAppMarkdown = (str: string) => {
    if (!str) return "";
    
    // Simple HTML escaping to prevent security issues while keeping formatting
    let escaped = str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

    // Bold *text*
    escaped = escaped.replace(/\*(.*?)\*/g, "<strong>$1</strong>");
    
    // Italic _text_
    escaped = escaped.replace(/_(.*?)_/g, "<em>$1</em>");
    
    // Strike ~text~
    escaped = escaped.replace(/~(.*?)~/g, "<del>$1</del>");
    
    // New lines
    escaped = escaped.replace(/\n/g, "<br />");

    return escaped;
  };

  // Get current system time formatted as HH:MM
  const timeStr = React.useMemo(() => {
    const d = new Date();
    return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
  }, []);

  return (
    <div className="w-full max-w-[344px] mx-auto bg-gray-900 rounded-[3rem] p-4 shadow-2xl border-4 border-slate-700 relative overflow-hidden">
      {/* Speaker and Camera Notch */}
      <div className="absolute top-4 left-1/2 transform -translate-x-1/2 w-32 h-6 bg-gray-900 rounded-full z-20 flex items-center justify-center">
        <div className="w-12 h-1 bg-slate-850 rounded-full mr-2"></div>
        <div className="w-2.5 h-2.5 bg-slate-900 border border-slate-650 rounded-full"></div>
      </div>

      {/* Screen Body */}
      <div className="rounded-[2.5rem] bg-[#efe7dd] border border-gray-950 overflow-hidden text-sm h-[480px] flex flex-col relative">
        
        {/* WhatsApp Header App Bar */}
        <div className="bg-[#075e54] text-white pt-6 pb-3 px-4 flex items-center justify-between shadow-md select-none">
          <div className="flex items-center space-x-2">
            <svg className="w-4 h-4 cursor-pointer" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" />
            </svg>
            <div className="w-9 h-9 bg-teal-800 rounded-full flex items-center justify-center text-white font-semibold shadow-inner border border-teal-700 text-xs overflow-hidden leading-none uppercase">
              {brandName ? brandName.substring(0, 2).toUpperCase() : "WA"}
            </div>
            <div>
              <h4 className="font-semibold text-xs leading-tight tracking-wide truncate max-w-[150px]">
                {brandName || "Direcional"}
              </h4>
              <p className="text-[9px] text-[#25D366] font-bold leading-none uppercase tracking-wider mt-0.5">
                ● Atendimento
              </p>
              <p className="text-[8.5px] text-teal-100/90 leading-none mt-0.5">
                +{phone}
              </p>
            </div>
          </div>
          
          <div className="flex space-x-3 text-white">
            {/* Phone/Video icons */}
            <svg className="w-4 h-4 opacity-90 hover:opacity-100 transition-opacity" fill="currentColor" viewBox="0 0 24 24">
              <path d="M20.005 5.005h-1.393L15.343 8.27a.998.998 0 0 0-.422.819v5.82a1 1 0 0 0 .422.819l3.269 3.265h1.393a1 1 0 0 0 1-1V6.005a1 1 0 0 0-1-1zM3 6.005a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1v-10a1 1 0 0 0-1-1H3z" />
            </svg>
            <svg className="w-4 h-4 opacity-90 hover:opacity-100 transition-opacity" fill="currentColor" viewBox="0 0 24 24">
              <path d="M18.268 14.38a10.016 10.016 0 0 1-5.11 5.08 1.01 1.01 0 0 1-.9.08l-2.07-.61a.99.99 0 0 0-.96.22l-2.07 2.07a1 1 0 0 1-1.41-1.41l2.07-2.07a1 1 0 0 0 .22-.96l-.61-2.07a1.01 1.01 0 0 1 .08-.9 10.016 10.016 0 0 1 5.08-5.11c.42-.18.88-.1 1.25.17l2.13 1.54c.32.22.45.64.31 1.01l-1 2.6z" />
            </svg>
            <svg className="w-4 h-4 opacity-90 hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 5v.01M12 12v.01M12 19v.01" />
            </svg>
          </div>
        </div>

        {/* WhatsApp Chat Area Backplate */}
        <div 
          className="flex-1 p-3 overflow-y-auto flex flex-col space-y-3"
          style={{
            backgroundImage: "url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')",
            backgroundSize: "cover",
            backgroundPosition: "center"
          }}
        >
          {/* Info System Message banner */}
          <div className="self-center bg-[#ffe9a2] text-[11px] text-gray-800 px-3 py-1.5 rounded-lg shadow-sm text-center max-w-[90%] font-medium border border-[#ebd897]">
            🔒 As mensagens e chamadas são protegidas com criptografia de ponta a ponta.
          </div>

          <div className="self-center bg-[#dff1ff] text-[11px] text-sky-850 px-3 py-1 rounded-full shadow-sm font-medium">
            HOJE
          </div>

          {/* User Message sent right-aligned WhatsApp Bubble */}
          <div className="self-end bg-[#dcf8c6] text-gray-900 rounded-xl rounded-tr-none px-3 py-2 shadow-sm max-w-[85%] relative group">
            {/* Playful mini text block */}
            <p 
              className="text-xs break-words" 
              dangerouslySetInnerHTML={{ __html: formatWhatsAppMarkdown(text) }}
            />
            {/* Double Check & Time inside the bubble */}
            <div className="flex items-center justify-end space-x-1 text-[9px] text-gray-500 mt-1 select-none">
              <span>{timeStr}</span>
              <svg className="w-3.5 h-3.5 text-blue-500 fill-current" viewBox="0 0 24 24">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
              </svg>
            </div>
            
            {/* Visual Chat Bubble Tail on top-right edge */}
            <div className="absolute top-0 -right-2 w-2 h-3 bg-[#dcf8c6]" style={{ clipPath: "polygon(0 0, 0 100%, 100% 0)" }}></div>
          </div>
        </div>

        {/* WhatsApp Bottom Input bar simulator */}
        <div className="p-2 bg-[#f0f0f0] flex items-center space-x-2 border-t border-gray-200">
          <div className="flex-1 bg-white rounded-full py-2 px-4 shadow-sm flex items-center justify-between text-gray-400">
            <div className="flex items-center space-x-2 w-full text-xs">
              <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="text-gray-700 truncate w-44 font-normal">
                {text ? "Mensagem pronta para enviar" : "Digite uma mensagem..."}
              </div>
            </div>
            <div className="flex space-x-2 text-gray-500">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
              </svg>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              </svg>
            </div>
          </div>
          {/* Mic icon representing ready to send state */}
          <div className="w-10 h-10 rounded-full bg-[#075e54] flex items-center justify-center text-white shadow-md active:bg-teal-900 transition-colors cursor-pointer shrink-0">
            <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
            </svg>
          </div>
        </div>
      </div>

      {/* Screen Shine Overlay */}
      <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-tr from-white/0 to-white/10 pointer-events-none rounded-[3rem]"></div>
    </div>
  );
}
