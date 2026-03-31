"use client";

import { useLocale, useT } from "@/lib/i18n/context";
import { getDocsUrl } from "@/lib/site-links";
import { SiteFooter } from "./site-footer";

export function HomeFooter() {
  const t = useT();
  const [locale] = useLocale();
  const docsUrl = getDocsUrl(locale);

  const legalLinks = [
    { href: docsUrl, label: t.footer.privacy },
    { href: docsUrl, label: t.footer.terms },
    { href: docsUrl, label: t.footer.disclaimer },
  ];

  return (
    <div className="bg-base-300/50 border-t border-base-content/5">
      <SiteFooter />
      <div className="max-w-7xl mx-auto px-4 sm:px-10">
        <div className="divider before:bg-base-content/5 after:bg-base-content/5 my-0" />
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-4 py-4 sm:py-6">
          <p className="text-xs text-base-content/30">{t.footer.copyright}</p>
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 sm:justify-end">
            {legalLinks.map((link) => (
              <a
                key={link.label}
                className="text-xs text-base-content/35 transition-colors hover:text-primary"
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
              >
                {link.label}
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
