interface StatusBadgeProps {
  status: string;
}

export default function StatusBadge({ status }: StatusBadgeProps) {
  if (status === 'pending_pdf') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-orange-50 text-orange-700 border border-orange-200">
        <span className="h-1.5 w-1.5 rounded-full bg-orange-400" />
        Upload PDF
      </span>
    );
  }
  if (status === 'processing') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-50 text-yellow-700 border border-yellow-200">
        <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        Processing
      </span>
    );
  }
  if (status === 'ready') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-200">
        <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
        Ready
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-700 border border-red-200">
      <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
      Failed
    </span>
  );
}
