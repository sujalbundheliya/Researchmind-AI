'use client';

import { LifeBuoy } from 'lucide-react';
import ContactForm from '@/components/support/ContactForm';
import ContactAside from '@/components/support/ContactAside';

/**
 * In-app support. Same form as the public /contact page, but rendered inside
 * the app shell so signed-in users keep their sidebar instead of being dropped
 * onto the marketing site (which reads as being signed out).
 */
export default function SupportPage() {
  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-ink flex items-center gap-2">
          <LifeBuoy size={22} className="text-clay" /> Contact Support
        </h1>
        <p className="text-muted text-sm mt-1">
          Trouble with your account, a bug, or an idea for what we should build next — we usually
          reply within 1–2 business days.
        </p>
      </div>

      <div className="grid lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3">
          <div className="bg-surface border border-line rounded-2xl p-6">
            <ContactForm defaultSubject="Technical support" hideIdentityFields />
          </div>
        </div>

        <div className="lg:col-span-2">
          <ContactAside plansHref="/dashboard/billing" plansLabel="View plans & billing" />
        </div>
      </div>
    </div>
  );
}
