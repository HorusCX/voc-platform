import VocStepper from "@/components/stepper/VocStepper";
import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-50 flex flex-col items-center py-12 font-[family-name:var(--font-geist-sans)]">
      <div className="w-full max-w-5xl px-4 mb-8">
        <div className="flex items-center justify-between">
          <div className="text-center flex-1">
            <h1 className="text-4xl font-extrabold text-slate-800 mb-2 tracking-tight">
              VoC Intelligence Platform
            </h1>
            <p className="text-slate-500 text-lg">
              Automated Review Analysis &amp; Insight Generation
            </p>
          </div>
          <Link
            href="/dashboard"
            className="bg-teal-500 hover:bg-teal-600 text-white px-6 py-3 rounded-lg font-bold shadow-md transition-colors"
          >
            📊 Dashboard
          </Link>
        </div>
      </div>

      <VocStepper />

      <footer className="mt-16 text-xs text-slate-400">
        &copy; {new Date().getFullYear()} HorusCX. All rights reserved.
      </footer>
    </main>
  );
}
