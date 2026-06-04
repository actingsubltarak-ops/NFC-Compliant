import React from 'react';
import { AuditLogEntry, ComplaintStatus } from '../../types';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';
import { CheckCircle2, Clock, PlayCircle, XCircle, User } from 'lucide-react';

interface TimelineProps {
  logs: AuditLogEntry[];
}

const statusIcons: Record<string, any> = {
  pending: Clock,
  received: User,
  in_progress: PlayCircle,
  resolved: CheckCircle2,
  rejected: XCircle,
};

const statusColors: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-600 border-amber-200',
  received: 'bg-blue-100 text-blue-600 border-blue-200',
  in_progress: 'bg-indigo-100 text-indigo-600 border-indigo-200',
  resolved: 'bg-emerald-100 text-emerald-600 border-emerald-200',
  rejected: 'bg-red-100 text-red-600 border-red-200',
};

export function ComplaintTimeline({ logs }: TimelineProps) {
  if (!logs || logs.length === 0) {
    return (
      <div className="text-center py-8 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
        <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">ยังไม่มีประวัติการดำเนินการ</p>
      </div>
    );
  }

  // Sort logs by timestamp desc
  const sortedLogs = [...logs].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return (
    <div className="space-y-6 relative before:absolute before:left-[17px] before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-100">
      {sortedLogs.map((log, index) => {
        const Icon = statusIcons[log.newStatus || 'pending'] || User;
        const colors = statusColors[log.newStatus || 'pending'] || 'bg-slate-100 text-slate-600 border-slate-200';

        return (
          <div key={log.id} className="relative pl-12 group">
            <div className={`absolute left-0 top-0 w-9 h-9 rounded-xl border-2 flex items-center justify-center z-10 transition-transform group-hover:scale-110 ${colors}`}>
              <Icon size={18} />
            </div>
            
            <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm group-hover:shadow-md transition-all">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <h4 className="font-bold text-slate-800 text-sm">{log.action}</h4>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{log.actorName}</p>
                </div>
                <span className="text-[10px] font-bold text-slate-400 bg-slate-50 px-2 py-1 rounded">
                  {format(new Date(log.timestamp), 'dd MMM yy HH:mm', { locale: th })}
                </span>
              </div>
              
              {log.notes && (
                <p className="text-xs text-slate-600 font-medium bg-slate-50 p-2 rounded-lg border border-slate-100 mt-2">
                  {log.notes}
                </p>
              )}
              
              {log.previousStatus && log.newStatus && log.previousStatus !== log.newStatus && (
                <div className="flex items-center gap-2 mt-3">
                   <span className="text-[10px] font-bold text-slate-400 line-through">{log.previousStatus}</span>
                   <span className="text-slate-300">→</span>
                   <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded ${colors}`}>{log.newStatus}</span>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
