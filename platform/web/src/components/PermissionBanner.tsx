import { AlertTriangle } from 'lucide-react';

interface PermissionBannerProps {
  sessionId: string | null;
  onSendApproval: (response: string) => void;
}

export function PermissionBanner({ sessionId, onSendApproval }: PermissionBannerProps) {
  if (!sessionId) return null;

  return (
    <div className="mx-4 mb-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
      <div className="flex items-start gap-3">
        <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-600" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-amber-900">Agent awaiting your approval</p>
          <p className="mt-0.5 text-xs text-amber-700">
            Review the agent's plan above, then approve or deny.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => onSendApproval('Approved')}
              className="rounded-md bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-1 transition-colors"
            >
              Approve
            </button>
            <button
              onClick={() => onSendApproval('Denied')}
              className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-1 transition-colors"
            >
              Deny
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
