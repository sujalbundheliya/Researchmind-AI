import { MessageSquare } from 'lucide-react';
import MarketingNav from '@/components/marketing/MarketingNav';
import MarketingFooter from '@/components/marketing/MarketingFooter';
import ContactForm from '@/components/support/ContactForm';
import ContactAside from '@/components/support/ContactAside';

/**
 * Public contact page. Signed-in users get the same form inside the app shell
 * at /dashboard/support instead, so they never lose their sidebar.
 */
export default function ContactContent() {
  return (
    <div className="min-h-screen bg-canvas">
      <MarketingNav />

      <main className="pt-32 pb-20 px-6">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="text-center max-w-2xl mx-auto mb-14">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-clay/10 text-clay text-xs font-semibold mb-5">
              <MessageSquare size={13} /> We&apos;d love to hear from you
            </div>
            <h1 className="text-4xl sm:text-5xl font-bold text-ink font-serif leading-tight mb-4">
              Get in touch
            </h1>
            <p className="text-muted text-lg leading-relaxed">
              Questions about the product, trouble with your account, or an idea for what we should
              build next — send it over and we&apos;ll get back to you.
            </p>
          </div>

          <div className="grid lg:grid-cols-5 gap-8">
            <div className="lg:col-span-3">
              <div className="bg-surface border border-line rounded-2xl p-6 sm:p-8">
                <ContactForm />
              </div>
            </div>

            <div className="lg:col-span-2">
              <ContactAside />
            </div>
          </div>
        </div>
      </main>

      <MarketingFooter />
    </div>
  );
}
