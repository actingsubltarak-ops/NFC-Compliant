import React, { useEffect, useState } from 'react';
import { collection, query, where, orderBy, onSnapshot, updateDoc, doc, limit } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../auth/AuthProvider';
import { AppNotification } from '../../types';
import { Bell, Check, Clock, MessageSquare, AlertCircle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { th } from 'date-fns/locale';
import { motion, AnimatePresence } from 'motion/react';

export function NotificationCenter() {
  const { profile } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!profile?.uid) return;

    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', profile.uid),
      orderBy('createdAt', 'desc'),
      limit(20)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) } as AppNotification));
      setNotifications(data);
      setUnreadCount(data.filter(n => !n.read).length);
    });

    return () => unsubscribe();
  }, [profile]);

  const markAsRead = async (id: string) => {
    await updateDoc(doc(db, 'notifications', id), { read: true });
  };

  const markAllAsRead = async () => {
    const unread = notifications.filter(n => !n.read);
    for (const n of unread) {
      await markAsRead(n.id);
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'status_change': return <Clock className="text-blue-500" size={16} />;
      case 'comment': return <MessageSquare className="text-emerald-500" size={16} />;
      default: return <AlertCircle className="text-amber-500" size={16} />;
    }
  };

  return (
    <div className="relative">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2.5 bg-slate-100 rounded-2xl text-slate-600 hover:bg-emerald-50 hover:text-emerald-600 transition-all group"
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-black w-5 h-5 rounded-full flex items-center justify-center border-2 border-white ring-2 ring-red-100 animate-pulse">
            {unreadCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {isOpen && (
          <>
            <div 
              className="fixed inset-0 z-40" 
              onClick={() => setIsOpen(false)}
            />
            <motion.div 
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              className="absolute right-0 mt-4 w-80 md:w-96 bg-white rounded-[2rem] shadow-2xl border border-slate-100 z-50 overflow-hidden"
            >
              <div className="p-6 bg-slate-50 border-b flex justify-between items-center">
                <div>
                  <h3 className="font-black text-slate-800 tracking-tight">การแจ้งเตือน</h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Recent Activity</p>
                </div>
                {unreadCount > 0 && (
                  <button 
                    onClick={markAllAsRead}
                    className="text-[10px] font-black text-emerald-600 uppercase tracking-widest hover:underline"
                  >
                    Mark all as read
                  </button>
                )}
              </div>

              <div className="max-h-[70vh] overflow-y-auto">
                {notifications.length === 0 ? (
                  <div className="p-12 text-center">
                    <p className="text-sm font-bold text-slate-400">ยังไม่มีการแจ้งเตือน</p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-50">
                    {notifications.map((n) => (
                      <div 
                        key={n.id} 
                        className={`p-4 hover:bg-slate-50 transition-colors flex gap-4 cursor-pointer ${!n.read ? 'bg-emerald-50/30' : ''}`}
                        onClick={() => {
                          markAsRead(n.id);
                          // Option to navigate to relatedId
                        }}
                      >
                        <div className={`mt-1 p-2 rounded-xl border shrink-0 h-fit ${!n.read ? 'bg-white border-emerald-100 shadow-sm' : 'bg-slate-50 border-slate-100'}`}>
                          {getIcon(n.type)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className={`text-sm tracking-tight ${!n.read ? 'font-black text-slate-800' : 'font-bold text-slate-600'}`}>
                            {n.title}
                          </h4>
                          <p className="text-xs text-slate-500 font-medium leading-relaxed my-1">{n.message}</p>
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                            {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true, locale: th })}
                          </span>
                        </div>
                        {!n.read && (
                          <div className="mt-1">
                            <div className="w-2 h-2 bg-emerald-500 rounded-full"></div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="p-4 bg-slate-50 border-t text-center">
                <button className="text-xs font-black text-slate-400 uppercase tracking-widest hover:text-slate-600">
                  View all notifications
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
