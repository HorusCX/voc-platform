"use client";

import { useAuth } from "@/contexts/AuthContext";
import { LogOut, User as UserIcon } from "lucide-react";

export default function UserMenu() {
    const { user, logout } = useAuth();

    if (!user) return null;

    return (
        <div className="absolute top-4 right-4 sm:top-6 sm:right-6 flex items-center gap-4">
            <div className="flex flex-col items-end">
                <span className="text-sm font-medium text-foreground">{user.email}</span>
                <span className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
                    {user.role} PLAN
                </span>
            </div>
            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                <UserIcon size={16} />
            </div>
            <button
                onClick={logout}
                className="p-2 text-muted-foreground hover:text-red-500 transition-colors rounded-full hover:bg-red-50"
                title="Sign out"
            >
                <LogOut size={18} />
            </button>
        </div>
    );
}
