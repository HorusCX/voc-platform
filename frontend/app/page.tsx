"use client";

import VocStepper from "@/components/stepper/VocStepper";
import UserMenu from "@/components/auth/UserMenu";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Loader2, ArrowLeft } from "lucide-react";
import { SavedCompaniesList } from "@/components/companies/SavedCompaniesList";

import { usePortfolio } from "@/contexts/PortfolioContext";
import { VoCService } from "@/lib/api";

export default function Home() {
  const { user, isLoading } = useAuth();
  const { portfolios, refreshPortfolios, setCurrentPortfolioId } = usePortfolio();
  const router = useRouter();
  const [view, setView] = useState<"companies" | "stepper">("companies");
  const [isCreatingPortfolio, setIsCreatingPortfolio] = useState(false);

  useEffect(() => {
    if (!isLoading && !user) {
      router.push("/login");
    }
  }, [user, isLoading, router]);

  const handleStartNew = async () => {
    if (portfolios.length === 0) {
      setIsCreatingPortfolio(true);
      try {
        const newPortfolio = await VoCService.createPortfolio("My Portfolio");
        await refreshPortfolios();
        setCurrentPortfolioId(newPortfolio.id);
      } catch (error) {
        console.error("Failed to create default portfolio:", error);
        // Optionally show an error toast here
      } finally {
        setIsCreatingPortfolio(false);
      }
    }
    setView("stepper");
  };

  const resetView = () => {
    setView("companies");
  };

  if (isLoading || !user || isCreatingPortfolio) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
        <p className="text-muted-foreground">
          {isCreatingPortfolio ? "Initializing workspace..." : "Verifying session..."}
        </p>
      </div>
    );
  }

  return (
    <main className="min-h-screen relative flex flex-col items-center py-24 font-sans selection:bg-primary/10">
      <UserMenu />

      <div className="w-full max-w-3xl px-6 mb-12 text-center mt-8 sm:mt-0 relative">
        {(view === "stepper") && (
          <button
            onClick={resetView}
            className="absolute left-6 top-1/2 -translate-y-1/2 sm:flex hidden items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
        )}
        <h1 className="text-4xl sm:text-5xl font-semibold text-foreground mb-4 tracking-tight">
          VoC Intelligence Platform
        </h1>
        <p className="text-muted-foreground text-lg sm:text-xl font-medium tracking-tight">
          Automated Review Analysis &amp; Insight Generation
        </p>
      </div>

      <div className="w-full max-w-5xl px-4 flex-1">
        {view === "companies" && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <SavedCompaniesList
              onStartNew={handleStartNew}
            />
          </div>
        )}

        {view === "stepper" && (
          <div className="relative animate-in fade-in slide-in-from-bottom-4 duration-500">
            <button
              onClick={resetView}
              className="sm:hidden flex items-center gap-1.5 text-sm font-medium text-muted-foreground mb-6"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Companies
            </button>
            <VocStepper />
          </div>
        )}

      </div>

      <footer className="mt-auto pt-24 pb-12 text-center">
        <p className="text-xs font-medium text-zinc-400">
          &copy; {new Date().getFullYear()} HorusCX. All rights reserved.
        </p>
      </footer>
    </main>
  );
}
