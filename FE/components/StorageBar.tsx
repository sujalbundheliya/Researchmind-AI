interface StorageBarProps {
  used: number;
  limit: number;
}

export default function StorageBar({ used, limit }: StorageBarProps) {
  const percent = limit > 0 ? Math.min((used / limit) * 100, 100) : 0;
  const usedMB = (used / 1024 / 1024).toFixed(1);
  const limitMB = Math.round(limit / 1024 / 1024);

  const barColor =
    percent >= 90 ? 'bg-red-500' : percent >= 70 ? 'bg-yellow-500' : 'bg-clay';

  return (
    <div>
      <div className="flex justify-between text-sm text-muted mb-2">
        <span className="font-medium">Storage</span>
        <span>
          {usedMB} MB of {limitMB} MB used
        </span>
      </div>
      <div className="h-2 bg-surface2 rounded-full overflow-hidden">
        <div
          className={`h-full ${barColor} rounded-full transition-all duration-300`}
          style={{ width: `${percent}%` }}
        />
      </div>
      {percent >= 70 && (
        <p className={`text-xs mt-1 ${percent >= 90 ? 'text-red-500' : 'text-yellow-600'}`}>
          {percent.toFixed(0)}% used
          {percent >= 90 ? ' — almost full' : ''}
        </p>
      )}
    </div>
  );
}
