import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Building2, MessageSquare, BarChart3, Menu, X, Tags, UserPlus, Bot } from "lucide-react";
import { useState } from "react";
import { PortfolioSwitcher } from "../portfolios/PortfolioSwitcher";

const navItems = [
    { name: "Companies", href: "/", icon: Building2 },
    { name: "Dimensions", href: "/dimensions", icon: Tags },
    { name: "Reviews", href: "/reviews", icon: MessageSquare },
    { name: "Dashboard", href: "/dashboard", icon: BarChart3 },
    { name: "AI Chat", href: "/chat?new=1", icon: Bot },
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
                className="md:hidden fixed top-4 left-4 z-50 p-2 bg-card border border-border rounded-md shadow-sm text-foreground"
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
                    {/* Logo */}
                    <div className="mb-8 px-2 flex items-center justify-center md:justify-start mt-8 md:mt-0">
                        <Image
                            src="/logo.png"
                            alt="HorusCX"
                            width={120}
                            height={40}
                            className="h-9 w-auto object-contain"
                            priority
                        />
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
                    flex items-center gap-3 py-2.5 rounded-lg text-sm font-medium transition-colors
                    ${isActive
                                            ? "bg-primary/10 text-primary border-l-2 border-primary px-[10px]"
                                            : "px-3 text-muted-foreground hover:bg-accent hover:text-foreground"
                                        }
                   `}
                                >
                                    <Icon className={`h-5 w-5 flex-shrink-0 ${isActive ? "text-primary" : "text-muted-foreground"}`} />
                                    {item.name}
                                </Link>
                            );
                        })}
                    </nav>

                    <div className="mt-8 px-2 pb-4">
                        <div className="bg-muted border border-border rounded-xl p-4 text-xs text-muted-foreground text-center">
                            <p className="font-semibold text-foreground mb-1">HorusCX</p>
                            <p>Automated Review Analysis</p>
                        </div>
                    </div>
                </div>
            </aside>
        </>
    );
}
