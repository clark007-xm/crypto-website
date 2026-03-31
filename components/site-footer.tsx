"use client";

import { ExternalLink } from "lucide-react";
import { getAddresses, getExplorerAddressUrl, hasDeployedContracts } from "@/lib/contracts/addresses";
import { useLocale, useT } from "@/lib/i18n/context";
import { CHAINS } from "@/lib/rpc/nodes";
import { useRpc } from "@/lib/rpc/context";
import {
  DISCORD_URL,
  MEDIUM_URL,
  TELEGRAM_URL,
  X_URL,
  getContractsDocsUrl,
  getDocsUrl,
} from "@/lib/site-links";
import { BrandLogo } from "./brand-logo";

interface FooterLinkProps {
  href: string;
  label: string;
  external?: boolean;
  meta?: string;
}

function FooterLink({ href, label, external = false, meta }: FooterLinkProps) {
  return (
    <a
      className="group inline-flex items-center gap-1.5 text-sm text-base-content/50 transition-colors hover:text-primary"
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noopener noreferrer" : undefined}
    >
      <span>{label}</span>
      {meta ? (
        <span className="rounded-full border border-base-content/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.18em] text-base-content/35 transition-colors group-hover:border-primary/20 group-hover:text-primary/70">
          {meta}
        </span>
      ) : null}
      {external ? (
        <ExternalLink className="h-3.5 w-3.5 text-base-content/20 transition-colors group-hover:text-primary/60" />
      ) : null}
    </a>
  );
}

export function SiteFooter() {
  const t = useT();
  const [locale] = useLocale();
  const { chain } = useRpc();

  const chainId = CHAINS[chain].numericId;
  const docsUrl = getDocsUrl(locale);
  const contractsDocsUrl = getContractsDocsUrl(locale);
  const addresses = getAddresses(chainId);
  const contractHref = hasDeployedContracts(chainId)
    ? getExplorerAddressUrl(chainId, addresses.factory)
    : contractsDocsUrl;

  const platformLinks = [
    { href: "#ongoing", label: t.footer.ongoing },
    { href: "#history", label: t.footer.history },
    { href: "#ongoing", label: t.footer.myBets },
    { href: "#history", label: t.footer.leaderboard },
  ];

  const supportLinks = [
    { href: "#rules", label: t.footer.rules },
    { href: docsUrl, label: t.footer.faq, external: true },
    { href: TELEGRAM_URL, label: t.footer.contact, external: true },
    {
      href: contractHref,
      label: t.footer.contractAddr,
      external: true,
      meta: chain === "sepolia" ? "Sepolia" : "Mainnet",
    },
  ];

  const communityLinks = [
    { href: TELEGRAM_URL, label: "Telegram" },
    { href: DISCORD_URL, label: "Discord" },
    { href: X_URL, label: "Twitter / X" },
    { href: MEDIUM_URL, label: "Medium" },
  ];

  return (
    <footer className="grid max-w-7xl grid-cols-1 gap-8 border-t border-base-content/5 bg-base-300/50 px-4 py-8 text-base-content/40 sm:grid-cols-2 sm:px-10 lg:grid-cols-[1.25fr_repeat(3,0.8fr)] lg:gap-10 lg:py-10">
      <aside className="pr-0 lg:pr-6">
        <BrandLogo
          href="#top"
          showName
          className="inline-flex items-center gap-3 mb-3"
          imageClassName="h-8 w-auto sm:h-10"
          nameClassName="text-lg sm:text-xl font-display font-bold tracking-[0.16em] text-base-content whitespace-nowrap"
        />
        <p className="text-sm leading-relaxed max-w-xs">
          {t.footer.desc}
          <br />
          {t.footer.descSub}
        </p>
      </aside>
      <nav className="space-y-3">
        <h6 className="text-xs font-semibold uppercase tracking-[0.22em] text-base-content/60">
          {t.footer.platform}
        </h6>
        <div className="flex flex-col gap-2.5">
          {platformLinks.map((link) => (
            <FooterLink key={link.label} href={link.href} label={link.label} />
          ))}
        </div>
      </nav>
      <nav className="space-y-3">
        <h6 className="text-xs font-semibold uppercase tracking-[0.22em] text-base-content/60">
          {t.footer.support}
        </h6>
        <div className="flex flex-col gap-2.5">
          {supportLinks.map((link) => (
            <FooterLink
              key={link.label}
              href={link.href}
              label={link.label}
              external={link.external}
              meta={link.meta}
            />
          ))}
        </div>
      </nav>
      <nav className="space-y-3">
        <h6 className="text-xs font-semibold uppercase tracking-[0.22em] text-base-content/60">
          {t.footer.community}
        </h6>
        <div className="flex flex-col gap-2.5">
          {communityLinks.map((link) => (
            <FooterLink key={link.label} href={link.href} label={link.label} external />
          ))}
        </div>
      </nav>
    </footer>
  );
}
