import type { SOCIAL_ICONS } from "./social-icons";

export type SocialPlatform = (typeof SOCIAL_ICONS)[number] | "linkedin" | "website";
export type SocialLink = { href: string; platform: SocialPlatform; name: string };

// Host (without "www." / "m.") → platform. Names are brand names, the same in every language.
const HOSTS: Record<string, [SocialPlatform, string]> = {
  "facebook.com": ["facebook", "Facebook"],
  "fb.com": ["facebook", "Facebook"],
  "instagram.com": ["instagram", "Instagram"],
  "youtube.com": ["youtube", "YouTube"],
  "youtu.be": ["youtube", "YouTube"],
  "x.com": ["x", "X"],
  "twitter.com": ["x", "X"],
  "linkedin.com": ["linkedin", "LinkedIn"],
  "wa.me": ["whatsapp", "WhatsApp"],
  "whatsapp.com": ["whatsapp", "WhatsApp"],
  "chat.whatsapp.com": ["whatsapp", "WhatsApp"],
  "t.me": ["telegram", "Telegram"],
  "telegram.me": ["telegram", "Telegram"],
  "threads.net": ["threads", "Threads"],
  "threads.com": ["threads", "Threads"],
  "pinterest.com": ["pinterest", "Pinterest"],
  "in.pinterest.com": ["pinterest", "Pinterest"],
};

/**
 * The Trust's official profiles (Settings → Organization) as footer links: https only, platform
 * recognised from the address. Anything else shows as a website link named by its host.
 */
export function socialLinks(urls: readonly string[]): SocialLink[] {
  return urls.flatMap((href) => {
    let url: URL;
    try {
      url = new URL(href);
    } catch {
      return [];
    }
    if (url.protocol !== "https:") return [];
    const host = url.hostname.toLowerCase().replace(/^(www|m)\./, "");
    const [platform, name] = HOSTS[host] ?? ["website", host];
    return [{ href: url.toString(), platform, name }];
  });
}
