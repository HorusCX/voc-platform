'use client';

import React from 'react';
import { TeamManagement } from '@/components/layout/TeamManagement';
import { TeamMembersList } from '@/components/layout/TeamMembersList';
import { UserPlus, Users } from 'lucide-react';

export default function TeamPage() {
    return (
        <div className="container mx-auto py-10 px-4 md:px-8 max-w-4xl">
            <div className="mb-8">
                <div className="flex items-center gap-3 mb-2 text-primary">
                    <Users className="h-6 w-6" />
                    <h1 className="text-3xl font-bold tracking-tight text-foreground">Team Management</h1>
                </div>
                <p className="text-muted-foreground">
                    Invite collaborators to this portfolio and manage their access.
                </p>
            </div>

            <div className="grid gap-8">
                <div className="bg-card border border-border rounded-2xl p-8 shadow-sm">
                    <div className="flex items-center gap-2 mb-6">
                        <UserPlus className="h-5 w-5 text-primary" />
                        <h2 className="text-xl font-semibold">Invite New Member</h2>
                    </div>

                    <div className="max-w-md">
                        <TeamManagement />
                    </div>
                </div>

                <div className="bg-card border border-border rounded-2xl p-8 shadow-sm">
                    <TeamMembersList />
                </div>
            </div>
        </div>
    );
}
