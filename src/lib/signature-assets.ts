/**
 * Icon URLs used inside the rich email signature.
 *
 * The pointers below are CDN-backed assets served from this app, so the
 * signature keeps its icons after it is pasted into Gmail / Outlook. Mail
 * clients need absolute URLs, so every path is prefixed with the public CRM
 * origin.
 */
import globe from "@/assets/signature/globe.png.asset.json";
import mail from "@/assets/signature/mail.png.asset.json";
import phone from "@/assets/signature/phone.png.asset.json";
import instagram from "@/assets/signature/instagram.png.asset.json";
import youtube from "@/assets/signature/youtube.png.asset.json";
import linkedin from "@/assets/signature/linkedin.png.asset.json";
import facebook from "@/assets/signature/facebook.png.asset.json";
import mastercover from "@/assets/signature/mastercover.png.asset.json";
import financing from "@/assets/signature/financing.png.asset.json";
import easysign from "@/assets/signature/easysign.png.asset.json";
import studio from "@/assets/signature/studio.png.asset.json";

import logo from "@/assets/yachtway-black.png.asset.json";

/** Public origin used to make signature image URLs absolute. */
export const SIGNATURE_ORIGIN = "https://crm.yachtway.app";

function abs(a: { url: string }): string {
  return a.url.startsWith("http") ? a.url : `${SIGNATURE_ORIGIN}${a.url}`;
}

/** YachtWay wordmark used in the signature card. */
export const SIGNATURE_LOGO = abs(logo);


export const SIGNATURE_ICONS = {
  globe: abs(globe),
  mail: abs(mail),
  phone: abs(phone),
  instagram: abs(instagram),
  youtube: abs(youtube),
  linkedin: abs(linkedin),
  facebook: abs(facebook),
  mastercover: abs(mastercover),
  financing: abs(financing),
  easysign: abs(easysign),
  studio: abs(studio),
};
