/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { Complaint } from '../../types';
import { Search, MapPin, Calendar, Clock, CheckCircle2, XCircle, PlayCircle, Sprout, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';
import { motion, AnimatePresence } from 'motion/react';

export function ComplaintStatusTracking() {
  const [trackingId, setTrackingId] = useState('');
  const [complaint, setComplaint] = useState<Complaint | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');

  const performSearch = async (id: string) => {
    if (!id) return;
    
    setSearching(true);
    setComplaint(null);
    setError('');
    
    try {
      const formattedId = id.trim().toUpperCase();
      // First try direct document lookup (highest performance & security)
      const docRef = doc(db, 'complaints', formattedId);
      const docSnap = await getDoc(docRef);
      
      if (docSnap.exists()) {
        setComplaint({ id: docSnap.id, ...docSnap.data() } as Complaint);
      } else {
        // Fallback to query list for older auto-generated ID documents
        const q = query(collection(db, 'complaints'), where('trackingId', '==', formattedId));
        const snapshot = await getDocs(q);
        
        if (snapshot.empty) {
          setError('ไม่พบเลขที่เรื่องที่ระบุ กรุณาตรวจสอบอีกครั้ง');
        } else {
          setComplaint({ id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as Complaint);
        }
      }
    } catch (err: any) {
      console.error(err);
      if (err.message?.includes('offline')) {
        setError('เครื่องไคลเอนต์ออฟไลน์ ไม่สามารถเชื่อมต่อฐานข้อมูลได้');
      } else {
        setError('เกิดข้อผิดพลาดในการค้นหา กรุณาลองใหม่อีกครั้ง');
      }
    } finally {
      setSearching(false);
    }
  };

  React.useEffect(() => {
    const path = window.location.pathname;
    if (path.startsWith('/track/')) {
      const id = path.split('/track/')[1];
      if (id) {
        setTrackingId(id.toUpperCase());
        performSearch(id.toUpperCase());
      }
    }
  }, []);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    performSearch(trackingId);
  };

  const statusIcons: Record<string, any> = {
    pending: { icon: Clock, color: 'text-amber-500', bg: 'bg-amber-50' },
    received: { icon: CheckCircle2, color: 'text-blue-500', bg: 'bg-blue-50' },
    in_progress: { icon: PlayCircle, color: 'text-indigo-500', bg: 'bg-indigo-50' },
    resolved: { icon: CheckCircle2, color: 'text-emerald-500', bg: 'bg-emerald-50' },
    rejected: { icon: XCircle, color: 'text-red-500', bg: 'bg-red-50' },
  };

  const statusLabels: Record<string, string> = {
    pending: 'รอดำเนินการ',
    received: 'รับเรื่องแล้ว',
    in_progress: 'กำลังดำเนินการ',
    resolved: 'แก้ไขสำเร็จ',
    rejected: 'ไม่รับเรื่อง',
  };

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div className="text-center">
        <div className="bg-emerald-100 text-emerald-600 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <Search size={32} />
        </div>
        <h1 className="text-3xl font-black text-slate-800">ติดตามสถานะเรื่องร้องเรียน</h1>
        <p className="text-slate-500 font-bold">กรอกเลขที่รับเรื่องเพื่อตรวจสอบความคืบหน้า</p>
      </div>

      <form onSubmit={handleSearch} className="relative group">
        <input 
          type="text" 
          value={trackingId}
          onChange={(e) => setTrackingId(e.target.value)}
          placeholder="ระบุเลขที่รับเรื่อง (เช่น AGRI-XXXXX)"
          className="w-full p-6 pr-20 bg-white border-2 border-slate-200 rounded-[2rem] text-xl font-bold text-center focus:border-emerald-500 outline-none transition-all shadow-xl shadow-emerald-500/5 uppercase tracking-widest"
        />
        <button 
          disabled={searching}
          className="absolute right-4 top-4 bottom-4 px-6 bg-emerald-600 text-white rounded-2xl font-bold hover:bg-emerald-700 transition-all flex items-center justify-center disabled:opacity-50"
        >
          {searching ? <Loader2 size={24} className="animate-spin" /> : 'ค้นหา'}
        </button>
      </form>

      <AnimatePresence>
        {error && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-4 bg-red-50 border border-red-100 text-red-700 rounded-2xl text-center font-bold"
          >
            {error}
          </motion.div>
        )}

        {complaint && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-[2.5rem] shadow-2xl border border-slate-100 overflow-hidden"
          >
            <div className="p-8 border-b border-slate-50 bg-slate-50/50 flex justify-between items-center">
              <div>
                <p className="text-xs font-black text-emerald-600 uppercase tracking-widest mb-1">เลขที่คำร้อง</p>
                <h2 className="text-3xl font-black text-slate-800">{complaint.trackingId}</h2>
              </div>
              <div className="text-right">
                <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1">หมวดหมู่</p>
                <p className="font-bold text-slate-700">{complaint.category}</p>
              </div>
            </div>

            <div className="p-8">
              {/* Stepper Status */}
              <div className="flex justify-between items-center mb-10 relative">
                <div className="absolute top-1/2 left-0 right-0 h-1 bg-slate-100 -translate-y-1/2" />
                {['pending', 'received', 'in_progress', 'resolved'].map((step, idx) => {
                  const isActive = Object.keys(statusLabels).indexOf(complaint.status) >= idx;
                  const StepIcon = statusIcons[step].icon;
                  return (
                    <div key={step} className="relative z-10 flex flex-col items-center gap-2">
                      <div className={`w-12 h-12 rounded-full flex items-center justify-center border-4 border-white shadow-lg transition-all ${isActive ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-400'}`}>
                        <StepIcon size={20} />
                      </div>
                      <span className={`text-[10px] font-black uppercase tracking-widest ${isActive ? 'text-emerald-700' : 'text-slate-400'}`}>
                        {statusLabels[step]}
                      </span>
                    </div>
                  );
                })}
              </div>

              <div className="p-6 bg-slate-50 rounded-3xl space-y-4">
                <h4 className="font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
                  <Sprout size={18} className="text-emerald-600" /> รายละเอียดเรื่อง
                </h4>
                <p className="text-slate-700 font-medium leading-relaxed">{complaint.title}</p>
                
                <div className="grid grid-cols-2 gap-4 border-t border-slate-200 pt-4">
                  <div className="flex items-center gap-2 text-slate-500 text-xs font-bold">
                    <Calendar size={14} /> {format(new Date(complaint.createdAt), 'dd MMM yyyy', { locale: th })}
                  </div>
                  <div className="flex items-center gap-2 text-slate-500 text-xs font-bold">
                    <MapPin size={14} /> {complaint.incidentLocation}
                  </div>
                </div>
              </div>

              {complaint.officerNotes && (
                <div className="mt-6 p-6 bg-emerald-600 text-white rounded-3xl shadow-xl shadow-emerald-600/20">
                  <h4 className="font-black uppercase tracking-wider text-xs mb-2 opacity-80">บันทึกการดำเนินการ</h4>
                  <p className="font-bold leading-relaxed">{complaint.officerNotes}</p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
