"use client";

import { Company } from "@/lib/api";
import { Globe, Smartphone, MapPin, Star, Pencil, Trash2, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

interface CompanyCardProps {
    company: Company;
    onEdit: (company: Company) => void;
    onDelete: (id: number) => void;
}

export function CompanyCard({ company, onEdit, onDelete }: CompanyCardProps) {
    return (
        <div className={cn(
            "group relative flex flex-col h-full",
            "bg-glass backdrop-blur-xl border border-glass-border",
            "rounded-2xl p-6 shadow-glass transition-all duration-300",
            "hover:translate-y-[-4px] hover:shadow-xl hover:bg-white/80",
            company.is_main && "ring-2 ring-primary/20"
        )}>
            {/* Visual Indicator for Main Company */}
            {company.is_main && (
                <div className="absolute top-4 left-4">
                    <span className="text-[10px] font-bold uppercase tracking-wider bg-primary text-primary-foreground px-2 py-0.5 rounded-full shadow-sm">
                        Main
                    </span>
                </div>
            )}

            {/* Action Buttons (Top Right) */}
            <div className="absolute top-4 right-4 flex items-center gap-1 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                <button
                    onClick={() => onEdit(company)}
                    className="p-1.5 text-muted-foreground hover:text-primary hover:bg-black/5 rounded-lg transition-colors bg-black/5 sm:bg-transparent"
                    title="Edit Company"
                >
                    <Pencil className="w-4 h-4" />
                </button>
                <button
                    onClick={() => onDelete(company.id!)}
                    className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors bg-black/5 sm:bg-transparent"
                    title="Delete Company"
                >
                    <Trash2 className="w-4 h-4" />
                </button>
            </div>

            {/* Content */}
            <div className={cn("mt-4", company.is_main && "pt-4")}>
                <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-xl font-bold text-foreground tracking-tight line-clamp-1" title={company.company_name}>
                        {company.company_name}
                    </h3>
                </div>

                {company.website && (
                    <a
                        href={company.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-primary hover:underline flex items-center gap-1.5 w-fit font-medium mb-3"
                    >
                        <Globe className="h-3.5 w-3.5" />
                        <span className="truncate max-w-[200px]">{company.website.replace(/^https?:\/\/(www\.)?/, '')}</span>
                        <ExternalLink className="h-3 w-3 opacity-50" />
                    </a>
                )}

                {company.description && (
                    <p className="text-sm text-muted-foreground leading-relaxed line-clamp-3 mb-6 flex-grow">
                        {company.description}
                    </p>
                )}
            </div>

            {/* Footer / Integration Badges */}
            <div className="mt-auto flex flex-wrap gap-2.5 pt-4 border-t border-black/5">
                {company.android_id && (
                    <Badge icon={<Smartphone className="h-3.5 w-3.5" />} label="Android" color="bg-green-500/10 text-green-600" />
                )}
                {company.apple_id && (
                    <Badge icon={<Smartphone className="h-3.5 w-3.5" />} label="iOS" color="bg-slate-500/10 text-slate-800" />
                )}
                {company.google_maps_links && company.google_maps_links.length > 0 && (
                    <Badge icon={<MapPin className="h-3.5 w-3.5" />} label="Maps" color="bg-rose-500/10 text-rose-600" />
                )}
                {company.trustpilot_link && (
                    <Badge icon={<Star className="h-3.5 w-3.5" />} label="Trustpilot" color="bg-amber-500/10 text-amber-600" />
                )}
            </div>
        </div>
    );
}

function Badge({ icon, label, color }: { icon: React.ReactNode; label: string; color: string }) {
    return (
        <div className={cn("flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-tight", color)}>
            {icon}
            <span>{label}</span>
        </div>
    );
}
