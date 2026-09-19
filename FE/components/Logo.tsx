interface LogoProps {
  size?: number;
  /** 'full' = icon + wordmark, 'icon' = icon only, 'wordmark' = text only */
  variant?: 'full' | 'icon' | 'wordmark';
  className?: string;
}

/**
 * ResearchMind brand mark — a two-hemisphere brain whose inner fold lines
 * double as the lines of an open page. Clay (#D97757) and ochre (#E0A03C)
 * strokes stay vivid in both themes; the hemisphere fill uses the theme's
 * accent-tint token so it sits naturally on light or dark surfaces.
 */
export function LogoIcon({ size = 32, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={className}
    >
      <g transform="translate(2.4,10.4) scale(0.424)">
        <path
          d="M70 20 C50 6,22 8,16 30 C2 34,2 56,14 62 C8 80,26 92,42 84 C50 96,70 94,70 78 Z"
          style={{ fill: 'rgb(var(--clay-tint))' }}
          stroke="rgb(var(--clay))"
          strokeWidth="5"
          strokeLinejoin="round"
        />
        <path
          d="M70 20 C90 6,118 8,124 30 C138 34,138 56,126 62 C132 80,114 92,98 84 C90 96,70 94,70 78 Z"
          style={{ fill: 'rgb(var(--clay-soft))' }}
          stroke="rgb(var(--clay))"
          strokeWidth="5"
          strokeLinejoin="round"
        />
        <line x1="70" y1="20" x2="70" y2="84" stroke="rgb(var(--clay))" strokeWidth="5" strokeLinecap="round" />
        <line x1="26" y1="40" x2="58" y2="40" stroke="rgb(var(--clay))" strokeWidth="5" strokeLinecap="round" />
        <line x1="22" y1="54" x2="58" y2="54" stroke="rgb(var(--clay))" strokeWidth="5" strokeLinecap="round" />
        <line x1="30" y1="68" x2="58" y2="68" stroke="rgb(var(--clay))" strokeWidth="5" strokeLinecap="round" />
        <line x1="82" y1="40" x2="114" y2="40" stroke="rgb(var(--ochre))" strokeWidth="5" strokeLinecap="round" />
        <line x1="82" y1="54" x2="118" y2="54" stroke="rgb(var(--ochre))" strokeWidth="5" strokeLinecap="round" />
        <line x1="82" y1="68" x2="110" y2="68" stroke="rgb(var(--ochre))" strokeWidth="5" strokeLinecap="round" />
      </g>
    </svg>
  );
}

/** Full wordmark: "Research" in ink, "Mind" in clay — set in the brand serif */
export function LogoWordmark({ className = '' }: { className?: string }) {
  return (
    <span className={`font-serif leading-none select-none text-ink ${className}`}>
      Research<span className="font-bold text-clay">Mind</span>
    </span>
  );
}

/** Combined logo: icon + wordmark + tagline */
export default function Logo({ size = 32, variant = 'full', className = '' }: LogoProps) {
  if (variant === 'icon') return <LogoIcon size={size} />;
  if (variant === 'wordmark') return <LogoWordmark className={className} />;

  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <LogoIcon size={size} />
      <div className="flex flex-col leading-none">
        <LogoWordmark className="text-base font-semibold tracking-tight" />
        <span className="text-[10px] tracking-[0.18em] font-medium mt-0.5 text-muted">
          AI · RESEARCH WORKSPACE
        </span>
      </div>
    </div>
  );
}
