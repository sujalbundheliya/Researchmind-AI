import { Toast } from '@/lib/toast';

interface ToasterProps {
  toasts: Toast[];
  onRemove: (id: number) => void;
}

export default function Toaster({ toasts, onRemove }: ToasterProps) {
  if (toasts.length === 0) return null;
  return (
    <div className="fixed bottom-4 right-4 flex flex-col gap-2 z-50">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg text-sm font-medium text-white min-w-[220px] ${
            t.type === 'success' ? 'bg-green-600' : 'bg-red-600'
          }`}
        >
          <span>{t.type === 'success' ? '✓' : '✕'}</span>
          <span className="flex-1">{t.message}</span>
          <button onClick={() => onRemove(t.id)} className="opacity-70 hover:opacity-100 text-lg leading-none">
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
