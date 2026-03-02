"use client";

import VocStepper from "@/components/stepper/VocStepper";
import UserMenu from "@/components/auth/UserMenu";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Loader2, ArrowLeft } from "lucide-react";
import { SavedCompaniesList } from "@/components/companies/SavedCompaniesList";
import { SuccessView } from "@/components/results/SuccessView";
import { Company, VoCService } from "@/lib/api";

export default function Home() {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  const [view, setView] = useState<"companies" | "stepper">("companies");

  useEffect(() => {
    if (!isLoading && !user) {
      router.push("/login");
    }
  }, [user, isLoading, router]);

  const resetView = () => {
    setView("companies");
  };

  if (isLoading || !user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
        <p className="text-muted-foreground">Verifying session...</p>
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
              onStartNew={() => setView("stepper")}
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
