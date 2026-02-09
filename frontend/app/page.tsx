import VocStepper from "@/components/stepper/VocStepper";

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center py-24 font-sans selection:bg-primary/10">
      <div className="w-full max-w-3xl px-6 mb-16 text-center">
        <h1 className="text-4xl sm:text-5xl font-semibold text-foreground mb-4 tracking-tight">
          VoC Intelligence Platform
        </h1>
        <p className="text-muted-foreground text-lg sm:text-xl font-medium tracking-tight">
          Automated Review Analysis &amp; Insight Generation
        </p>
      </div>

      <div className="w-full max-w-5xl px-4">
        <VocStepper />
      </div>

      <footer className="mt-auto pt-24 pb-12 text-center">
        <p className="text-xs font-medium text-zinc-400">
          &copy; {new Date().getFullYear()} HorusCX. All rights reserved.
        </p>
      </footer>
    </main>
  );
}
