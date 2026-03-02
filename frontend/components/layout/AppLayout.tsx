"use client";

import { useAuth } from "@/contexts/AuthContext";
import { Sidebar } from "./Sidebar";
import { usePathname } from "next/navigation";

export function AppLayout({ children }: { children: React.ReactNode }) {
    const { user } = useAuth();
    const pathname = usePathname();

    // Hide sidebar on auth pages or public pages if needed
    const isAuthPage = pathname?.startsWith('/login') || pathname?.startsWith('/signup');
    const showSidebar = user && !isAuthPage;

    if (!showSidebar) {
        return <>{children}</>;
    }

    return (
        <div className="min-h-screen flex bg-background">
            <Sidebar />
            <div className="flex-1 md:ml-64 flex flex-col min-w-0">
                {children}
            </div>
        </div>
    );
}
