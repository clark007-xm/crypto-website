"use client";

import { useState } from "react";
import { Wallet, Menu, X, Zap } from "lucide-react";

export default function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <nav className="navbar bg-base-200/80 backdrop-blur-xl border-b border-base-300 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto w-full flex items-center justify-between px-4">
        {/* Logo */}
        <a
          href="/"
          className="flex items-center gap-2 text-xl font-bold text-primary"
        >
          <Zap className="w-6 h-6 fill-primary" />
          <span>CryptoLoot</span>
        </a>

        {/* Desktop Nav */}
        <div className="hidden md:flex items-center gap-6">
          <a
            href="#draws"
            className="text-base-content/70 hover:text-primary transition-colors text-sm font-medium"
          >
            {"Draws"}
          </a>
          <a
            href="#winners"
            className="text-base-content/70 hover:text-primary transition-colors text-sm font-medium"
          >
            {"Winners"}
          </a>
          <a
            href="#how-it-works"
            className="text-base-content/70 hover:text-primary transition-colors text-sm font-medium"
          >
            {"How it Works"}
          </a>
          <a
            href="#faq"
            className="text-base-content/70 hover:text-primary transition-colors text-sm font-medium"
          >
            {"FAQ"}
          </a>
        </div>

        {/* CTA + Mobile Toggle */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="btn btn-primary btn-sm gap-2 hidden sm:flex"
          >
            <Wallet className="w-4 h-4" />
            {"Connect Wallet"}
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm md:hidden"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Toggle menu"
          >
            {mobileOpen ? (
              <X className="w-5 h-5" />
            ) : (
              <Menu className="w-5 h-5" />
            )}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      {mobileOpen && (
        <div className="md:hidden bg-base-200 border-t border-base-300 px-4 pb-4 animate-slide-up">
          <div className="flex flex-col gap-3 pt-3">
            <a
              href="#draws"
              className="text-base-content/70 hover:text-primary transition-colors text-sm font-medium py-2"
            >
              {"Draws"}
            </a>
            <a
              href="#winners"
              className="text-base-content/70 hover:text-primary transition-colors text-sm font-medium py-2"
            >
              {"Winners"}
            </a>
            <a
              href="#how-it-works"
              className="text-base-content/70 hover:text-primary transition-colors text-sm font-medium py-2"
            >
              {"How it Works"}
            </a>
            <a
              href="#faq"
              className="text-base-content/70 hover:text-primary transition-colors text-sm font-medium py-2"
            >
              {"FAQ"}
            </a>
            <button
              type="button"
              className="btn btn-primary btn-sm gap-2 w-full sm:hidden"
            >
              <Wallet className="w-4 h-4" />
              {"Connect Wallet"}
            </button>
          </div>
        </div>
      )}
    </nav>
  );
}
