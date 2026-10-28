import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { socialLinks } from "@/lib/social";
import { SOCIAL_ICONS } from "@/lib/social-icons";

describe("footer social links (Settings → Organization → Official profiles)", () => {
  it("recognises platforms from the address, with or without www. / m.", () => {
    const links = socialLinks([
      "https://www.facebook.com/mswt",
      "https://m.facebook.com/mswt",
      "https://instagram.com/mswt",
      "https://youtu.be/abc",
      "https://www.youtube.com/@mswt",
      "https://twitter.com/mswt",
      "https://x.com/mswt",
      "https://wa.me/919800000000",
      "https://www.linkedin.com/company/mswt",
      "https://t.me/mswt",
    ]);
    expect(links.map((l) => [l.platform, l.name])).toEqual([
      ["facebook", "Facebook"],
      ["facebook", "Facebook"],
      ["instagram", "Instagram"],
      ["youtube", "YouTube"],
      ["youtube", "YouTube"],
      ["x", "X"],
      ["x", "X"],
      ["whatsapp", "WhatsApp"],
      ["linkedin", "LinkedIn"],
      ["telegram", "Telegram"],
    ]);
  });

  it("other sites show as a website named by its host; only https links are kept", () => {
    expect(
      socialLinks(["https://www.example.org/trust", "http://facebook.com/x", "javascript:alert(1)", "nope"]),
    ).toEqual([{ href: "https://www.example.org/trust", platform: "website", name: "example.org" }]);
  });

  it("the sprite has a 24×24 symbol for every brand icon", () => {
    const sprite = readFileSync("public/icons/social.svg", "utf8");
    for (const id of SOCIAL_ICONS)
      expect(sprite).toContain(`<symbol id="${id}" viewBox="0 0 24 24"><path d="M`);
  });
});
