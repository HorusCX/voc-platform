import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, MessageSquare, BarChart3, Menu, X, Tags, UserPlus } from "lucide-react";
import { useState } from "react";
import { PortfolioSwitcher } from "../portfolios/PortfolioSwitcher";
import { TeamManagement } from "./TeamManagement";

const navItems = [
    { name: "Companies", href: "/", icon: Building2 },
    { name: "Dimensions", href: "/dimensions", icon: Tags },
    { name: "Reviews", href: "/reviews", icon: MessageSquare },
    { name: "Dashboard", href: "/dashboard", icon: BarChart3 },
    { name: "Team", href: "/team", icon: UserPlus },
];

export function Sidebar() {
    const pathname = usePathname();
    const [isOpen, setIsOpen] = useState(false);

    return (
        <>
            {/* Mobile Menu Button */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="md:hidden fixed top-4 left-4 z-50 p-2 bg-background border border-border rounded-md shadow-sm text-foreground"
            >
                {isOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>

            {/* Backdrop for mobile */}
            {isOpen && (
                <div
                    className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40 md:hidden"
                    onClick={() => setIsOpen(false)}
                />
            )}

            {/* Sidebar */}
            <aside className={`
        fixed inset-y-0 left-0 z-40 w-64 bg-card border-r border-border transform transition-transform duration-200 ease-in-out
        md:translate-x-0 ${isOpen ? "translate-x-0" : "-translate-x-full"}
      `}>
                <div className="h-full flex flex-col py-6 px-4">
                    <div className="mb-8 px-2 flex items-center justify-center md:justify-start mt-8 md:mt-0">
                        <h2 className="text-xl font-bold tracking-tight text-foreground">
                            VoC <span className="text-primary font-medium">Intelligence</span>
                        </h2>
                    </div>

                    <PortfolioSwitcher />

                    <nav className="space-y-1 flex-1">
                        {navItems.map((item) => {
                            const isActive = pathname === item.href;
                            const Icon = item.icon;
                            return (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    onClick={() => setIsOpen(false)}
                                    className={`
                    flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors
                    ${isActive
                                            ? "bg-primary/10 text-primary"
                                            : "text-muted-foreground hover:bg-accent hover:text-foreground"
                                        }
                   `}
                                >
                                    <Icon className={`h-5 w-5 ${isActive ? "text-primary" : "text-muted-foreground"}`} />
                                    {item.name}
                                </Link>
                            );
                        })}
                    </nav>

                    <div className="mt-8 px-2 pb-4">
                        <div className="bg-accent/50 rounded-xl p-4 text-xs text-muted-foreground text-center">
                            <p className="font-semibold text-foreground mb-1">HorusCX</p>
                            <p>Automated Review Analysis</p>
                        </div>
                    </div>
                </div>
            </aside>
        </>
    );
}
