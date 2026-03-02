'use client';

import React, { useEffect, useState } from 'react';
import { Users, Mail, Clock, Shield, User } from 'lucide-react';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { VoCService } from '@/lib/api';

interface Member {
    id: number;
    email: string;
    role: string;
}

interface Invitation {
    id: number;
    email: string;
    created_at: string;
}

export function TeamMembersList() {
    const { currentPortfolio } = usePortfolio();
    const [members, setMembers] = useState<Member[]>([]);
    const [invitations, setInvitations] = useState<Invitation[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchMembers = async () => {
            if (!currentPortfolio) return;

            try {
                setIsLoading(true);
                const data = await VoCService.getPortfolioMembers(currentPortfolio.id);
                setMembers(data.members);
                setInvitations(data.invitations);
                setError(null);
            } catch (err: unknown) {
                console.error("Failed to fetch team members:", err);
                setError("Failed to load team members");
            } finally {
                setIsLoading(false);
            }
        };

        fetchMembers();
    }, [currentPortfolio]);

    if (!currentPortfolio) return null;

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="text-center py-12 text-destructive">
                <p>{error}</p>
            </div>
        );
    }

    return (
        <div className="space-y-8">
            {/* Members Section */}
            <div>
                <div className="flex items-center gap-2 mb-4">
                    <Users className="h-5 w-5 text-primary" />
                    <h2 className="text-xl font-semibold">Active Members</h2>
                </div>
                <div className="grid gap-3">
                    {members.map((member) => (
                        <div key={member.id} className="flex items-center justify-between p-4 bg-background border border-border rounded-xl">
                            <div className="flex items-center gap-3">
                                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                                    <User className="h-5 w-5" />
                                </div>
                                <div>
                                    <div className="font-medium text-sm">{member.email}</div>
                                    <div className="text-xs text-muted-foreground capitalize">{member.role}</div>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <Shield className="h-4 w-4 text-muted-foreground" />
                                <span className="text-xs text-muted-foreground">Access Granted</span>
                            </div>
                        </div>
                    ))}
                    {members.length === 0 && (
                        <p className="text-sm text-muted-foreground italic p-4">No active members found.</p>
                    )}
                </div>
            </div>

            {/* Invitations Section */}
            {invitations.length > 0 && (
                <div>
                    <div className="flex items-center gap-2 mb-4">
                        <Mail className="h-5 w-5 text-primary" />
                        <h2 className="text-xl font-semibold">Pending Invitations</h2>
                    </div>
                    <div className="grid gap-3">
                        {invitations.map((invitation) => (
                            <div key={invitation.id} className="flex items-center justify-between p-4 bg-muted/30 border border-border border-dashed rounded-xl">
                                <div className="flex items-center gap-3">
                                    <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
                                        <Mail className="h-5 w-5" />
                                    </div>
                                    <div>
                                        <div className="font-medium text-sm italic">{invitation.email}</div>
                                        <div className="text-xs text-muted-foreground">Sent on {new Date(invitation.created_at).toLocaleDateString()}</div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 text-amber-500">
                                    <Clock className="h-4 w-4" />
                                    <span className="text-xs font-medium">Pending</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
