/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { collection, query, where, getDocs, updateDoc, doc, orderBy, arrayUnion, addDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../auth/AuthProvider';
import { Complaint, ComplaintStatus, AuditLogEntry } from '../../types';
import { motion } from 'motion/react';
import { 
  Clock, 
  CheckCircle2, 
  XCircle, 
  PlayCircle, 
  MoreVertical, 
  MapPin, 
  Calendar,
  AlertTriangle,
  User as UserIcon,
  Filter,
  FileText,
  History,
  Eye,
  Trash2
} from 'lucide-react';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';
import { deleteDoc } from 'firebase/firestore';
import { ComplaintTimeline } from './ComplaintTimeline';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { Skeleton, CardSkeleton } from '../ui/Skeleton';

interface ListProps {
  viewType: 'personal' | 'management';
}

const statusConfig: Record<ComplaintStatus, { label: string; bg: string; text: string; icon: any }> = {
  pending: { label: 'รอดำเนินการ', bg: 'bg-amber-100', text: 'text-amber-700', icon: Clock },
  received: { label: 'รับเรื่องแล้ว', bg: 'bg-blue-100', text: 'text-blue-700', icon: PlayCircle },
  in_progress: { label: 'กำลังดำเนินการ', bg: 'bg-indigo-100', text: 'text-indigo-700', icon: PlayCircle },
  resolved: { label: 'แก้ไขแล้ว', bg: 'bg-emerald-100', text: 'text-emerald-700', icon: CheckCircle2 },
  rejected: { label: 'ไม่รับเรื่อง', bg: 'bg-red-100', text: 'text-red-700', icon: XCircle },
};

const severityConfig: Record<string, { label: string; text: string }> = {
  low: { label: 'ต่ำ', text: 'text-blue-600 border-blue-200 bg-blue-50' },
  medium: { label: 'กลาง', text: 'text-amber-600 border-amber-200 bg-amber-50' },
  high: { label: 'สูง', text: 'text-orange-600 border-orange-200 bg-orange-50' },
  critical: { label: 'วิกฤต', text: 'text-red-600 border-red-200 bg-red-50' },
};

export function ComplaintList({ viewType }: ListProps) {
  const { profile } = useAuth();
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedComplaint, setSelectedComplaint] = useState<Complaint | null>(null);
  const [filterStatus, setFilterStatus] = useState<ComplaintStatus | 'all'>('all');
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  const [dialogState, setDialogState] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    type?: 'danger' | 'warning' | 'info';
    showCancel?: boolean;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {}
  });

  const showConfirm = (options: {
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    type?: 'danger' | 'warning' | 'info';
    showCancel?: boolean;
    onConfirm: () => void;
  }) => {
    setDialogState({
      isOpen: true,
      ...options
    });
  };

  const showAlert = (title: string, message: string, type: 'danger' | 'warning' | 'info' = 'info') => {
    setDialogState({
      isOpen: true,
      title,
      message,
      confirmText: 'ตกลง',
      showCancel: false,
      type,
      onConfirm: () => {}
    });
  };

  useEffect(() => {
    const fetchComplaints = async () => {
      if (viewType === 'personal' && !profile?.uid) {
        return;
      }
      setLoading(true);
      try {
        let q;
        if (viewType === 'personal') {
          q = query(
            collection(db, 'complaints'), 
            where('complainantUid', '==', profile?.uid)
          );
        } else {
          // Managers/Officers see everything or assigned
          q = query(collection(db, 'complaints'));
        }
        
        const snapshot = await getDocs(q);
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) } as Complaint));
        
        // Sort in memory for reliability and to ensure docs with missing fields are included
        data.sort((a, b) => {
          const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return dateB - dateA; // desc
        });
        
        setComplaints(data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchComplaints();
  }, [viewType, profile]);

  const [activeTab, setActiveTab] = useState<'details' | 'timeline'>('details');
  const [officerNotes, setOfficerNotes] = useState('');

  const updateStatus = async (id: string, newStatus: ComplaintStatus, notes: string = '') => {
    try {
      const complaint = complaints.find(c => c.id === id);
      const previousStatus = complaint?.status;

      const logEntry: AuditLogEntry = {
        id: Math.random().toString(36).substring(7),
        timestamp: new Date().toISOString(),
        actorName: profile?.fullName || 'System',
        actorUid: profile?.uid || 'system',
        action: `เปลี่ยนสถานะเป็น ${statusConfig[newStatus].label}`,
        previousStatus: previousStatus,
        newStatus: newStatus,
        notes: notes
      };

      await updateDoc(doc(db, 'complaints', id), { 
        status: newStatus,
        updatedAt: new Date().toISOString(),
        assignedOfficerUid: profile?.uid || '',
        officerNotes: notes || complaint?.officerNotes || '',
        logs: arrayUnion(logEntry)
      });

      // Create notification for complainant
      if (complaint?.complainantUid) {
        await addDoc(collection(db, 'notifications'), {
          userId: complaint.complainantUid,
          title: 'อัปเดตสถานะการร้องเรียน',
          message: `เรื่อง "${complaint.title}" เปลี่ยนสถานะเป็น: ${statusConfig[newStatus].label}`,
          type: 'status_change',
          relatedId: id,
          read: false,
          createdAt: new Date().toISOString()
        });
      }

      setComplaints(complaints.map(c => c.id === id ? { 
        ...c, 
        status: newStatus,
        logs: c.logs ? [...c.logs, logEntry] : [logEntry]
      } : c));
      
      // Update selected complaint to show changes
      if (selectedComplaint?.id === id) {
        setSelectedComplaint(prev => prev ? {
          ...prev,
          status: newStatus,
          logs: prev.logs ? [...prev.logs, logEntry] : [logEntry]
        } : null);
      }
    } catch (err: any) {
      console.error("Error updating status:", err);
      showAlert('เกิดข้อผิดพลาด', 'เกิดข้อผิดพลาดในการเปลี่ยนสถานะ: ' + (err.message || err), 'danger');
    }
  };

  const deleteComplaint = async (id: string) => {
    showConfirm({
      title: 'ต้องการลบเรื่องร้องเรียนใช่หรือไม่?',
      message: 'การลบประวัติเรื่องร้องเรียนจะเป็นการลบแบบถาวรและไม่สามารถกู้คืนได้ภายหลัง',
      confirmText: 'ใช่, ฉันต้องการลบ',
      cancelText: 'ยกเลิก',
      type: 'danger',
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, 'complaints', id));
          setComplaints(complaints.filter(c => c.id !== id));
          setSelectedComplaint(null);
          showAlert('สำเร็จ', 'ลบเรื่องร้องเรียนเรียบร้อยแล้ว', 'info');
        } catch (err: any) {
          console.error('Error deleting complaint:', err);
          showAlert('เกิดข้อผิดพลาด', 'ไม่สามารถลบข้อมูลได้เนื่องจากเกิดข้อผิดพลาด: ' + (err.message || err), 'danger');
        }
      }
    });
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <div className="space-y-2">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-32" />
          </div>
          <Skeleton className="h-10 w-24" />
        </div>
        <div className="grid grid-cols-1 gap-4">
          {[1, 2, 3, 4, 5].map(i => (
            <CardSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">
            {viewType === 'personal' ? 'ประวัติการร้องเรียนของฉัน' : 'รายการเรื่องร้องเรียนทั้งหมด'}
          </h1>
          <p className="text-slate-500 font-medium">รวมทั้งหมด {complaints.length} รายการ</p>
        </div>
        <div className="relative">
          <button 
            onClick={() => setIsFilterOpen(!isFilterOpen)}
            className={`p-2 border rounded-lg transition-all flex items-center gap-2 ${isFilterOpen ? 'bg-emerald-50 border-emerald-500 text-emerald-600' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
          >
            <Filter size={18} /> <span className="text-sm font-bold">กรองข้อมูล</span>
          </button>
          
          {isFilterOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setIsFilterOpen(false)}></div>
              <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-xl border border-slate-100 z-20 py-2 overflow-hidden">
                <div className="px-4 py-2 border-b border-slate-50 mb-1">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">สถานะ</p>
                </div>
                <button 
                  onClick={() => { setFilterStatus('all'); setIsFilterOpen(false); }}
                  className={`w-full text-left px-4 py-2 text-sm font-bold transition-colors ${filterStatus === 'all' ? 'text-emerald-600 bg-emerald-50' : 'text-slate-600 hover:bg-slate-50'}`}
                >
                  ทั้งหมด
                </button>
                {Object.entries(statusConfig).map(([status, config]) => (
                  <button 
                    key={status}
                    onClick={() => { setFilterStatus(status as ComplaintStatus); setIsFilterOpen(false); }}
                    className={`w-full text-left px-4 py-2 text-sm font-bold transition-colors ${filterStatus === status ? 'text-emerald-600 bg-emerald-50' : 'text-slate-600 hover:bg-slate-50'}`}
                  >
                    {config.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {complaints.filter(c => filterStatus === 'all' || c.status === filterStatus).length === 0 ? (
          <div className="text-center p-20 bg-white rounded-3xl border-2 border-dashed border-slate-200">
            <AlertTriangle size={48} className="mx-auto text-slate-300 mb-4" />
            <p className="text-slate-500 font-bold">ไม่พบรายการเรื่องร้องเรียน</p>
          </div>
        ) : (
          complaints
            .filter(c => filterStatus === 'all' || c.status === filterStatus)
            .map((c) => {
            const status = statusConfig[c.status];
            const severity = severityConfig[c.severity];
            return (
              <motion.div 
                layout
                key={c.id} 
                className="bg-white p-5 rounded-2xl border border-slate-200 hover:shadow-lg transition-all cursor-pointer group"
                onClick={() => setSelectedComplaint(c)}
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs font-black text-emerald-600 bg-emerald-50 px-2 py-1 rounded tracking-tighter">
                        {c.trackingId}
                      </span>
                      <span className={`text-[10px] uppercase font-black px-2 py-1 rounded border-2 ${severity.text}`}>
                        {severity.label}
                      </span>
                    </div>
                    <h3 className="text-lg font-bold text-slate-800 truncate mb-1 pr-4">{c.title}</h3>
                    <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 font-medium">
                      <span className="flex items-center gap-1"><MapPin size={14} /> {c.incidentLocation || 'ไม่ระบุสถานที่'}</span>
                      <span className="flex items-center gap-1">
                        <Calendar size={14} /> 
                        {c.createdAt ? (() => {
                          try {
                            return format(new Date(c.createdAt), 'dd MMM yyyy', { locale: th });
                          } catch (e) {
                            return 'ไม่ระบุวันที่';
                          }
                        })() : 'ไม่ระบุวันที่'}
                      </span>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between md:justify-end gap-3 min-w-[150px]">
                    <div className={`px-4 py-1.5 rounded-full flex items-center gap-2 font-bold text-xs ${status.bg} ${status.text}`}>
                      <status.icon size={14} />
                      {status.label}
                    </div>
                    <MoreVertical size={20} className="text-slate-400 group-hover:text-slate-600" />
                  </div>
                </div>
              </motion.div>
            );
          })
        )}
      </div>

      {/* Details Modal */}
      {selectedComplaint && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white w-full max-w-3xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
          >
            <div className="p-6 border-b flex justify-between items-center bg-slate-50">
              <div className="flex items-center gap-3">
                <div className="bg-emerald-600 text-white p-2 rounded-xl"><FileText size={24} /></div>
                <div>
                  <h2 className="text-xl font-bold text-slate-800">รายละเอียดเรื่องร้องเรียน</h2>
                  <p className="text-xs font-bold text-emerald-600">{selectedComplaint.trackingId}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="bg-white border rounded-xl overflow-hidden flex mr-4">
                  <button 
                    onClick={() => setActiveTab('details')}
                    className={`px-4 py-2 text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'details' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-slate-600'}`}
                  >
                    รายละเอียด
                  </button>
                  <button 
                    onClick={() => setActiveTab('timeline')}
                    className={`px-4 py-2 text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'timeline' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-slate-600'}`}
                  >
                    ประวัติการแก้ไข
                  </button>
                </div>
                <button 
                  onClick={() => setSelectedComplaint(null)}
                  className="p-2 hover:bg-slate-200 rounded-lg transition-colors"
                >
                  <XCircle size={24} className="text-slate-400" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-8 space-y-8">
              {activeTab === 'details' ? (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-4">
                      <div>
                        <label className="text-[10px] uppercase font-black text-slate-400 tracking-widest">หัวข้อเรื่อง</label>
                        <p className="font-bold text-lg text-slate-800 leading-tight">{selectedComplaint.title}</p>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-[10px] uppercase font-black text-slate-400 tracking-widest">หมวดหมู่</label>
                          <p className="text-sm font-bold text-slate-700">{selectedComplaint.category}</p>
                        </div>
                        <div>
                          <label className="text-[10px] uppercase font-black text-slate-400 tracking-widest">ความรุนแรง</label>
                          <p className={`text-sm font-bold ${severityConfig[selectedComplaint.severity].text.split(' ')[0]}`}>
                            {severityConfig[selectedComplaint.severity].label}
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="space-y-4 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                      <div className="flex items-center gap-2 mb-2">
                        <UserIcon size={16} className="text-emerald-600" />
                        <span className="text-xs font-black text-slate-800 uppercase tracking-wider">ข้อมูลผู้ร้องเรียน</span>
                      </div>
                      <p className="text-sm font-bold text-slate-700">รหัสผู้ร้องเรียน: {selectedComplaint.complainantUid.substring(0, 8)}...</p>
                      <p className="text-xs text-slate-500">ยื่นเมื่อ: {(() => {
                        try {
                          return format(new Date(selectedComplaint.createdAt), 'PPPp', { locale: th });
                        } catch (e) {
                          return 'ไม่ระบุวันที่';
                        }
                      })()}</p>
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] uppercase font-black text-slate-400 tracking-widest block mb-2">รายละเอียดเหตุการณ์</label>
                    <div className="p-4 bg-white border border-slate-100 rounded-xl text-slate-700 text-sm leading-relaxed shadow-sm">
                      {selectedComplaint.details}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="text-[10px] uppercase font-black text-slate-400 tracking-widest block mb-2">วันที่แจ้งเกิดเหตุ</label>
                      <p className="text-sm font-bold text-slate-700">{(() => {
                        try {
                          return format(new Date(selectedComplaint.incidentDate), 'PPP', { locale: th });
                        } catch (e) {
                          return 'ไม่ระบุวันที่';
                        }
                      })()}</p>
                    </div>
                    <div>
                      <label className="text-[10px] uppercase font-black text-slate-400 tracking-widest block mb-2">สถานที่</label>
                      <p className="text-sm font-bold text-slate-700">{selectedComplaint.incidentLocation || '-'}</p>
                    </div>
                  </div>

                  {selectedComplaint.officerNotes && (
                    <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100">
                      <label className="text-[10px] uppercase font-black text-emerald-700 tracking-widest block mb-2">บันทึกจากเจ้าหน้าที่ล่าสุด</label>
                      <p className="text-sm text-emerald-900 leading-relaxed font-medium">{selectedComplaint.officerNotes}</p>
                    </div>
                  )}

                  {selectedComplaint.evidenceUrls && selectedComplaint.evidenceUrls.length > 0 && (
                    <div>
                      <label className="text-[10px] uppercase font-black text-slate-400 tracking-widest block mb-4">หลักฐาน / รูปภาพประกอบ</label>
                      <div className="flex flex-wrap gap-4">
                        {selectedComplaint.evidenceUrls.map((url, idx) => (
                          <a 
                            key={idx} 
                            href={url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="relative group w-24 h-24 bg-slate-100 rounded-2xl overflow-hidden border border-slate-200 shadow-sm hover:shadow-md transition-all"
                          >
                            <img src={url} alt={`Evidence ${idx + 1}`} className="w-full h-full object-cover" />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                              <Eye size={20} className="text-white" />
                            </div>
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="py-4">
                  <ComplaintTimeline logs={selectedComplaint.logs || []} />
                </div>
              )}
            </div>

            {viewType === 'management' && (
              <div className="p-6 bg-slate-50 border-t space-y-4">
                <div className="flex flex-col gap-2">
                  <label className="text-[10px] uppercase font-black text-slate-400 tracking-widest pl-1">บันทึกเพิ่มเติมจากเจ้าหน้าที่ (ระบุก่อนกดบันทึกสถานะ)</label>
                  <textarea 
                    value={officerNotes}
                    onChange={(e) => setOfficerNotes(e.target.value)}
                    placeholder="ระบุเหตุผลหรือรายละเอียดการดำเนินการ..."
                    className="w-full p-3 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500 min-h-[80px]"
                  />
                </div>
                <div className="flex flex-wrap gap-2 justify-center">
                  <button onClick={() => { updateStatus(selectedComplaint.id!, 'received', officerNotes); setOfficerNotes(''); }} className="px-6 py-2.5 bg-blue-600 text-white rounded-xl text-xs font-black hover:bg-blue-700 transition-all active:scale-95 shadow-lg shadow-blue-200">รับเรื่อง</button>
                  <button onClick={() => { updateStatus(selectedComplaint.id!, 'in_progress', officerNotes); setOfficerNotes(''); }} className="px-6 py-2.5 bg-indigo-600 text-white rounded-xl text-xs font-black hover:bg-indigo-700 transition-all active:scale-95 shadow-lg shadow-indigo-200">ดำเนินการ</button>
                  <button onClick={() => { updateStatus(selectedComplaint.id!, 'resolved', officerNotes); setOfficerNotes(''); }} className="px-6 py-2.5 bg-emerald-600 text-white rounded-xl text-xs font-black hover:bg-emerald-700 transition-all active:scale-95 shadow-lg shadow-emerald-200">สำเร็จแล้ว</button>
                  <button onClick={() => { updateStatus(selectedComplaint.id!, 'rejected', officerNotes); setOfficerNotes(''); }} className="px-6 py-2.5 bg-red-600 text-white rounded-xl text-xs font-black hover:bg-red-700 transition-all active:scale-95 shadow-lg shadow-red-200">ไม่รับเรื่อง</button>
                </div>
                
                {(profile?.role === 'admin' || profile?.role === 'supervisor') && (
                  <div className="flex justify-center pt-2 border-t border-slate-100 mt-4">
                    <button 
                      onClick={() => deleteComplaint(selectedComplaint.id!)}
                      className="flex items-center gap-2 px-6 py-2 text-red-600 hover:bg-red-50 rounded-xl text-xs font-black transition-all"
                    >
                      <Trash2 size={16} />
                      ลบข้อมูลเรื่องร้องเรียน
                    </button>
                  </div>
                )}
              </div>
            )}
          </motion.div>
        </div>
      )}

      {/* Confirm Dialog */}
      <ConfirmDialog
        isOpen={dialogState.isOpen}
        title={dialogState.title}
        message={dialogState.message}
        confirmText={dialogState.confirmText}
        cancelText={dialogState.cancelText}
        type={dialogState.type}
        showCancel={dialogState.showCancel}
        onConfirm={dialogState.onConfirm}
        onCancel={() => setDialogState(prev => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}
