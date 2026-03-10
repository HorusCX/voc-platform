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
    <main className="min-h-screen relative flex flex-col py-8 font-sans selection:bg-primary/10">
      <UserMenu />

      <div className="w-full max-w-[1600px] mx-auto px-6 2xl:px-12 mb-8">
        {(view === "stepper") && (
          <button
            onClick={resetView}
            className="sm:flex hidden items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors mb-4"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
        )}
        <div className="text-center">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight bg-gradient-to-r from-slate-900 to-slate-500 bg-clip-text text-transparent mb-1.5">
            VoC Intelligence Platform
          </h1>
          <p className="text-muted-foreground text-base sm:text-lg">
            Automated Review Analysis &amp; Insight Generation
          </p>
        </div>
      </div>

      <div className="w-full max-w-[1600px] mx-auto px-6 2xl:px-12 flex-1">
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
