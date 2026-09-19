import Link from 'next/link';
import {
  MessageSquare, FlaskConical, Table2,
  FileEdit, Library, Users, Check, X,
  ArrowRight, Star, BookOpen, Brain, Lock, Sparkles, Crown,
} from 'lucide-react';
import { LogoIcon } from '@/components/Logo';
import MarketingNav from '@/components/marketing/MarketingNav';
import MarketingFooter from '@/components/marketing/MarketingFooter';
import { PLAN_META, PLAN_ORDER } from '@/lib/plan';

// ── App Mockup ──────────────────────────────────────────────────────
function AppMockup() {
  return (
    <div className="relative w-full max-w-3xl mx-auto">
      {/* Glow */}
      <div className="absolute inset-0 bg-clay/20 blur-3xl rounded-3xl" />
      {/* Window */}
      <div className="relative bg-surface rounded-2xl border border-line shadow-2xl overflow-hidden">
        {/* Title bar */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-line bg-canvas">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-danger/70" />
            <div className="w-3 h-3 rounded-full bg-warning/70" />
            <div className="w-3 h-3 rounded-full bg-success/70" />
          </div>
          <div className="flex-1 mx-4 h-5 bg-surface2 rounded-full flex items-center px-3">
            <span className="text-xs text-subtle">app.researchmind.ai/workspace</span>
          </div>
        </div>
        {/* App content */}
        <div className="flex h-72">
          {/* Sidebar */}
          <div className="w-44 bg-canvas border-r border-line p-3 flex flex-col gap-1 flex-shrink-0">
            <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-clay/15 border border-clay/30">
              <div className="w-3 h-3 bg-clay rounded-sm flex-shrink-0" />
              <span className="text-xs text-clay font-medium">All Documents</span>
            </div>
            {['Dashboard', 'Workspaces', 'History', 'Systematic Review', 'Data Extraction', 'AI Drafts'].map(item => (
              <div key={item} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-surface2">
                <div className="w-3 h-3 bg-line rounded-sm flex-shrink-0" />
                <span className="text-xs text-subtle truncate">{item}</span>
              </div>
            ))}
            <div className="mt-auto pt-3 border-t border-line">
              <div className="flex items-center gap-2 px-2">
                <div className="w-5 h-5 rounded-full bg-clay flex items-center justify-center flex-shrink-0">
                  <span className="text-[9px] text-white font-bold">JD</span>
                </div>
                <div>
                  <p className="text-[10px] text-muted font-medium">Dr. Jane</p>
                  <p className="text-[9px] text-subtle">Researcher</p>
                </div>
              </div>
            </div>
          </div>

          {/* Chat area */}
          <div className="flex-1 flex flex-col bg-surface">
            {/* Doc list */}
            <div className="border-b border-line p-3 flex gap-2">
              {['attention-mechanism.pdf', 'transformer-v2.pdf', 'bert-paper.pdf'].map((f, i) => (
                <div key={i} className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] ${i === 0 ? 'bg-clay/15 border border-clay/30 text-clay' : 'bg-surface2 text-subtle'}`}>
                  <div className="w-2 h-2 bg-current rounded-sm flex-shrink-0" />
                  <span className="truncate max-w-[80px]">{f}</span>
                </div>
              ))}
            </div>
            {/* Messages */}
            <div className="flex-1 p-4 space-y-3 overflow-hidden">
              <div className="flex justify-end">
                <div className="bg-clay text-white text-[11px] px-3 py-2 rounded-xl rounded-tr-sm max-w-[70%]">
                  What attention mechanism do these papers propose?
                </div>
              </div>
              <div className="flex gap-2">
                <div className="w-5 h-5 rounded-full bg-gradient-to-br from-clay to-clay-hover flex-shrink-0 flex items-center justify-center">
                  <span className="text-[8px] text-white font-bold">R</span>
                </div>
                <div className="bg-surface2 border border-line text-[11px] text-muted px-3 py-2 rounded-xl rounded-tl-sm max-w-[75%]">
                  The papers propose <span className="text-clay">multi-head self-attention</span> that allows models to jointly attend to information from different positions...
                  <div className="flex gap-1.5 mt-2 flex-wrap">
                    <span className="bg-clay/15 text-clay border border-clay/30 text-[9px] px-1.5 py-0.5 rounded-full">attention-mechanism.pdf p.3</span>
                    <span className="bg-clay/15 text-clay border border-clay/30 text-[9px] px-1.5 py-0.5 rounded-full">transformer-v2.pdf p.1</span>
                  </div>
                </div>
              </div>
            </div>
            {/* Input */}
            <div className="p-3 border-t border-line">
              <div className="flex gap-2 bg-surface2 rounded-xl px-3 py-2 border border-line">
                <span className="text-[11px] text-subtle flex-1">Ask anything about your documents…</span>
                <div className="w-5 h-5 bg-clay rounded-lg flex items-center justify-center flex-shrink-0">
                  <ArrowRight size={10} className="text-white" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Feature Card ────────────────────────────────────────────────────
function FeatureCard({ icon, title, description, gradient, badge }: {
  icon: React.ReactNode; title: string; description: string; gradient: string; badge?: string;
}) {
  return (
    <div className="group relative bg-surface border border-line rounded-2xl p-6 hover:border-clay/40 transition-all duration-300 hover:-translate-y-0.5">
      <div className={`w-11 h-11 rounded-xl ${gradient} flex items-center justify-center mb-4 shadow-lg`}>
        {icon}
      </div>
      <h3 className="text-ink font-semibold text-base mb-2 flex items-center gap-2">
        {title}
        {badge && (
          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-clay/15 text-clay border border-clay/30">
            {badge}
          </span>
        )}
      </h3>
      <p className="text-muted text-sm leading-relaxed">{description}</p>
    </div>
  );
}

// ── Step Card ───────────────────────────────────────────────────────
function StepCard({ number, title, description }: { number: string; title: string; description: string }) {
  return (
    <div className="flex gap-5">
      <div className="flex-shrink-0 w-10 h-10 rounded-full bg-clay/15 border border-clay/40 flex items-center justify-center">
        <span className="text-clay font-bold text-sm">{number}</span>
      </div>
      <div className="pt-1">
        <h3 className="text-ink font-semibold mb-1.5">{title}</h3>
        <p className="text-muted text-sm leading-relaxed">{description}</p>
      </div>
    </div>
  );
}

// ── Compare Row ─────────────────────────────────────────────────────
function Row({ feature, us, chat, readers }: { feature: string; us: boolean | string; chat: boolean | string; readers: boolean | string }) {
  const Cell = ({ val }: { val: boolean | string }) => (
    <td className="px-6 py-4 text-center">
      {typeof val === 'boolean'
        ? val
          ? <div className="inline-flex w-6 h-6 rounded-full bg-success/15 items-center justify-center"><Check size={13} className="text-success" /></div>
          : <div className="inline-flex w-6 h-6 rounded-full bg-danger/10 items-center justify-center"><X size={13} className="text-danger/70" /></div>
        : <span className="text-xs text-muted">{val}</span>
      }
    </td>
  );
  return (
    <tr className="border-b border-line hover:bg-surface2/60 transition-colors">
      <td className="px-6 py-4 text-sm text-muted">{feature}</td>
      <Cell val={us} />
      <Cell val={chat} />
      <Cell val={readers} />
    </tr>
  );
}

// ── Main Page ───────────────────────────────────────────────────────
export default function LandingPage() {
  return (
    <div className="bg-canvas text-ink min-h-screen">
      <MarketingNav />

      {/* ── HERO ─────────────────────────────────────────────────── */}
      <section className="relative pt-32 pb-20 px-6 overflow-hidden">
        {/* Background glows */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-clay/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute top-20 left-1/4 w-[400px] h-[400px] bg-ochre/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative max-w-7xl mx-auto">
          {/* Badge */}
          <div className="flex justify-center mb-8">
            <div className="inline-flex items-center gap-2 bg-clay/10 border border-clay/20 rounded-full px-4 py-1.5 text-sm text-clay">
              <Star size={13} className="fill-clay" />
              <span>AI-powered for research scholars</span>
            </div>
          </div>

          {/* Headline */}
          <div className="text-center mb-8 max-w-4xl mx-auto">
            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold leading-[1.1] tracking-tight mb-6">
              Your private{' '}
              <span className="bg-gradient-to-r from-clay via-ochre to-clay bg-clip-text text-transparent">
                AI research
              </span>
              {' '}workspace
            </h1>
            <p className="text-lg sm:text-xl text-muted leading-relaxed max-w-2xl mx-auto">
              Upload your papers. Ask questions across your library. Conduct systematic reviews.
              Draft literature reviews. Everything grounded in <em className="text-ink not-italic">your own documents</em> — never hallucinated.
            </p>
          </div>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
            <Link href="/register"
              className="flex items-center gap-2 bg-clay hover:bg-clay-hover text-white font-semibold px-7 py-3.5 rounded-xl transition-all shadow-xl shadow-clay/20 hover:shadow-clay/30 hover:-translate-y-0.5 text-base">
              Start for free <ArrowRight size={16} />
            </Link>
            <Link href="/pricing"
              className="flex items-center gap-2 bg-surface2 hover:bg-surface text-ink font-semibold px-7 py-3.5 rounded-xl transition-all border border-line text-base">
              See plans & pricing
            </Link>
          </div>

          {/* App mockup */}
          <AppMockup />

          {/* Capability strip */}
          <div className="mt-12 text-center">
            <p className="text-subtle text-sm mb-6">Everything you need for a rigorous literature workflow</p>
            <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-4">
              {['Cited answers', 'PRISMA-style screening', 'Data extraction tables', 'Grounded drafts', '5 citation styles'].map(item => (
                <span key={item} className="inline-flex items-center gap-1.5 text-subtle font-medium text-sm">
                  <Check size={13} className="text-success" /> {item}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── STATS ────────────────────────────────────────────────── */}
      <section className="border-y border-line bg-surface/60 py-12 px-6">
        <div className="max-w-4xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
          {[
            { value: '9', label: 'Research tools in one place' },
            { value: '5', label: 'Citation formats' },
            { value: 'Unlimited', label: 'Chat & Q&A on every plan' },
            { value: '100%', label: 'Answers grounded in your papers' },
          ].map(({ value, label }) => (
            <div key={label}>
              <p className="text-3xl font-bold text-ink mb-1">{value}</p>
              <p className="text-muted text-sm">{label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── FEATURES ─────────────────────────────────────────────── */}
      <section id="features" className="py-24 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-clay font-semibold text-sm uppercase tracking-widest mb-3">Features</p>
            <h2 className="text-4xl font-bold text-ink mb-4">Everything a researcher needs</h2>
            <p className="text-muted text-lg max-w-2xl mx-auto">
              One workspace for the whole literature workflow — from first upload to finished draft,
              with every answer grounded in your own documents.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            <FeatureCard
              icon={<MessageSquare size={20} className="text-white" />}
              gradient="bg-clay"
              title="Multi-document Q&A"
              description="Ask questions across your entire uploaded library simultaneously. Every answer cites the exact document and page number — never invented."
            />
            <FeatureCard
              icon={<FlaskConical size={20} className="text-white" />}
              gradient="bg-ochre"
              title="Systematic Review"
              description="PRISMA-style screening workflow. Define inclusion and exclusion criteria, screen all papers in one click, export results as CSV."
            />
            <FeatureCard
              icon={<Table2 size={20} className="text-white" />}
              gradient="bg-success"
              title="Structured Extraction"
              description="Define columns like 'Sample Size' and 'Country'. AI fills them from each paper into a downloadable table you can review and edit."
            />
            <FeatureCard
              icon={<FileEdit size={20} className="text-white" />}
              gradient="bg-clay-hover"
              title="AI Draft Writing"
              description="Generate literature reviews, abstracts, and discussion sections — grounded strictly in your uploaded papers. Claims that can't be supported are clearly flagged."
            />
            <FeatureCard
              icon={<BookOpen size={20} className="text-white" />}
              gradient="bg-info"
              title="Citation Generation"
              description="Accurate reference metadata for your papers, formatted in APA, MLA, Chicago, IEEE, and Harvard. Copy or export your full reference list."
            />
            <FeatureCard
              icon={<Brain size={20} className="text-white" />}
              gradient="bg-clay"
              title="Key Findings & Summaries"
              description="One click to extract Research Objective, Methodology, Key Findings, Conclusions, and Limitations from any paper in your library."
            />
            <FeatureCard
              icon={<Sparkles size={20} className="text-white" />}
              gradient="bg-ochre"
              title="Research Gap Analysis"
              description="Compare two or more papers to surface open questions, contradictions, and under-explored directions for your next study."
            />
            <FeatureCard
              icon={<Library size={20} className="text-white" />}
              gradient="bg-info"
              title="Zotero Import"
              badge="Pro"
              description="Already have a library? Import your .ris or .bib export from Zotero. Metadata pre-populated, PDFs brought in where available."
            />
            <FeatureCard
              icon={<Users size={20} className="text-white" />}
              gradient="bg-espresso"
              title="Shared Workspaces"
              description="Invite your research team with role-based access — Owner, Editor, Viewer — and a shared document library."
            />
          </div>

          {/* Privacy note */}
          <div className="mt-8 flex items-start gap-3 bg-surface border border-line rounded-2xl p-6 max-w-3xl mx-auto">
            <div className="w-9 h-9 rounded-xl bg-espresso flex items-center justify-center flex-shrink-0">
              <Lock size={17} className="text-white" />
            </div>
            <p className="text-muted text-sm leading-relaxed">
              <span className="text-ink font-semibold">Privacy-first by design.</span> Bring your own documents — no scraping,
              no shared corpus. Your uploaded papers stay private to your account and are never used to train any model.
            </p>
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ─────────────────────────────────────────── */}
      <section id="how-it-works" className="py-24 px-6 bg-surface/60 border-y border-line">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-clay font-semibold text-sm uppercase tracking-widest mb-3">How it works</p>
            <h2 className="text-4xl font-bold text-ink mb-4">From papers to insights in minutes</h2>
          </div>

          <div className="grid md:grid-cols-2 gap-16 items-center">
            <div className="space-y-10">
              <StepCard
                number="1"
                title="Upload your PDF papers"
                description="Drag and drop your research papers. They're processed in moments and stay private to your account — ready to search, question, and analyze."
              />
              <StepCard
                number="2"
                title="Ask questions naturally"
                description="Type any research question. ResearchMind finds the most relevant passages across all your papers and answers with exact citations, down to the page."
              />
              <StepCard
                number="3"
                title="Analyze, draft & export"
                description="Run systematic reviews, extract structured data, generate reference lists, and write grounded drafts — then export everything to take with you."
              />
            </div>

            {/* Mini flow diagram */}
            <div className="bg-surface border border-line rounded-2xl p-6">
              <div className="space-y-3">
                {[
                  { label: 'Your PDFs, uploaded privately', color: 'bg-clay/15 border-clay/30 text-clay', icon: '📄' },
                  { label: 'Ask questions & run analyses', color: 'bg-ochre/15 border-ochre/30 text-ochre', icon: '💬' },
                  { label: 'Answers cited to page level', color: 'bg-info/15 border-info/30 text-info', icon: '🔍' },
                  { label: 'Reviews, tables & drafts — export-ready', color: 'bg-success/15 border-success/30 text-success', icon: '✅' },
                ].map((step, i) => (
                  <div key={i}>
                    <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${step.color}`}>
                      <span>{step.icon}</span>
                      <span className="text-sm font-medium">{step.label}</span>
                    </div>
                    {i < 3 && (
                      <div className="flex justify-center my-1">
                        <div className="w-px h-3 bg-line" />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── COMPARE ──────────────────────────────────────────────── */}
      <section id="compare" className="py-24 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-clay font-semibold text-sm uppercase tracking-widest mb-3">Comparison</p>
            <h2 className="text-4xl font-bold text-ink mb-4">Why ResearchMind?</h2>
            <p className="text-muted text-lg">Multi-document Q&A, systematic review, data extraction, and grounded drafting — in one place instead of four tools.</p>
          </div>

          <div className="rounded-2xl overflow-hidden border border-line">
            <table className="w-full">
              <thead>
                <tr className="bg-surface">
                  <th className="px-6 py-4 text-left text-sm text-muted font-medium w-1/3">Feature</th>
                  <th className="px-6 py-4 text-center w-1/5">
                    <div className="inline-flex flex-col items-center gap-1">
                      <div className="bg-clay text-white text-xs font-bold px-3 py-1 rounded-full">ResearchMind AI</div>
                    </div>
                  </th>
                  <th className="px-6 py-4 text-center text-sm text-muted font-medium w-1/5">Typical AI chat tools</th>
                  <th className="px-6 py-4 text-center text-sm text-muted font-medium w-1/5">Generic PDF readers</th>
                </tr>
              </thead>
              <tbody className="bg-canvas">
                <Row feature="Chat with your uploaded PDFs" us={true} chat={true} readers="Limited" />
                <Row feature="Ask across many papers at once" us={true} chat="Limited" readers={false} />
                <Row feature="Answers cited to document & page" us={true} chat={false} readers={false} />
                <Row feature="Systematic review screening (PRISMA-style)" us={true} chat={false} readers={false} />
                <Row feature="Structured data extraction to tables" us={true} chat={false} readers={false} />
                <Row feature="Drafting grounded only in your documents" us={true} chat="Limited" readers={false} />
                <Row feature="Citations in APA/MLA/Chicago/IEEE/Harvard" us={true} chat={false} readers="Limited" />
                <Row feature="Key findings & research-gap analysis" us={true} chat={false} readers={false} />
                <Row feature="Zotero library import" us={true} chat={false} readers={false} />
                <Row feature="Your documents stay private to you" us={true} chat="Varies" readers={true} />
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ── PRICING PREVIEW ──────────────────────────────────────── */}
      <section id="pricing" className="py-24 px-6 bg-surface/60 border-y border-line">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-clay font-semibold text-sm uppercase tracking-widest mb-3">Pricing</p>
            <h2 className="text-4xl font-bold text-ink mb-4">Start free, upgrade when you&apos;re ready</h2>
            <p className="text-muted text-lg">Simple monthly plans. Cancel anytime.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-5 mb-10">
            {PLAN_ORDER.map((planId) => {
              const meta = PLAN_META[planId];
              return (
                <div key={planId}
                  className={`relative bg-surface rounded-2xl border p-6 flex flex-col ${meta.highlighted ? 'border-clay/60 shadow-lg shadow-clay/10' : 'border-line'}`}>
                  {meta.highlighted && (
                    <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-clay text-white">
                      Most popular
                    </span>
                  )}
                  <div className="flex items-center gap-2 mb-1">
                    {planId === 'pro' && <Crown size={16} className="text-clay" />}
                    <h3 className="text-lg font-bold text-ink">{meta.name}</h3>
                  </div>
                  <p className="text-xs text-muted mb-3">{meta.tagline}</p>
                  <p className="text-3xl font-bold text-ink mb-5">
                    {meta.priceLabel.split('/')[0]}
                    {meta.priceLabel.includes('/') && <span className="text-sm font-normal text-subtle">/mo</span>}
                  </p>
                  <ul className="space-y-2 flex-1">
                    {meta.features.slice(0, 3).map((f) => (
                      <li key={f} className="flex items-start gap-2 text-sm text-muted">
                        <Check size={15} className="text-clay flex-shrink-0 mt-0.5" /> {f}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>

          <div className="text-center">
            <Link href="/pricing"
              className="inline-flex items-center gap-2 bg-clay hover:bg-clay-hover text-white font-semibold px-7 py-3.5 rounded-xl transition-all shadow-xl shadow-clay/20 text-base">
              See full pricing & plan details <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────────────── */}
      <section className="py-24 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <div className="relative">
            <div className="absolute inset-0 bg-clay/10 blur-3xl rounded-full" />
            <div className="relative bg-gradient-to-b from-surface to-canvas border border-line rounded-3xl p-12">
              <div className="w-16 h-16 mx-auto mb-6 bg-surface2 border border-line rounded-2xl flex items-center justify-center shadow-2xl">
                <LogoIcon size={36} />
              </div>
              <h2 className="text-4xl font-bold text-ink mb-4">Start your research workspace</h2>
              <p className="text-muted text-lg mb-8">
                Upload your first paper and ask your first question in under 5 minutes.
                No credit card required. Just your documents.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link href="/register"
                  className="flex items-center justify-center gap-2 bg-clay hover:bg-clay-hover text-white font-bold px-8 py-4 rounded-xl transition-all text-base shadow-xl shadow-clay/20 hover:-translate-y-0.5">
                  Get started free <ArrowRight size={18} />
                </Link>
                <Link href="/pricing"
                  className="flex items-center justify-center gap-2 bg-surface2 hover:bg-surface text-ink font-semibold px-8 py-4 rounded-xl border border-line transition-all text-base">
                  View pricing
                </Link>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-6 mt-8 text-sm text-subtle">
                {['Free to start', 'No credit card', 'Privacy-first', 'Your data stays yours'].map(item => (
                  <div key={item} className="flex items-center gap-1.5">
                    <Check size={13} className="text-success" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
}
