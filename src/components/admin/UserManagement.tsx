/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { collection, getDocs, updateDoc, doc, deleteDoc, getDocsFromServer } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { UserProfile, UserRole } from '../../types';
import { useAuth } from '../auth/AuthProvider';
import { Users, Shield, UserCheck, Search, Filter, Trash2, UserX, Power } from 'lucide-react';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { Skeleton } from '../ui/Skeleton';

const roleLabels: Record<UserRole, string> = {
  citizen: 'ผู้ร้องเรียน (Citizen)',
  officer: 'เจ้าหน้าที่ (Officer)',
  supervisor: 'หัวหน้างาน (Supervisor)',
  manager: 'ผู้จัดการ (Manager)',
  admin: 'ผู้ดูแลระบบ (Admin)'
};

export function UserManagement() {
  const { profile: currentUserProfile } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

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

  const isAdmin = currentUserProfile?.role === 'admin';

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        setLoading(true);
        let snapshot;
        try {
          // Try to get fresh data from server first for admin accuracy
          snapshot = await getDocsFromServer(collection(db, 'users'));
        } catch (serverError) {
          console.warn("Failed to fetch fresh users, using cache/default:", serverError);
          snapshot = await getDocs(collection(db, 'users'));
        }
        const userData = snapshot.docs.map(doc => doc.data() as UserProfile);
        setUsers(userData);
      } catch (err: any) {
        console.error("UserManagement fetch error:", err);
        if (err.message?.includes('permission-denied')) {
          showAlert('ไม่มีสิทธิ์เข้าถึง', 'คุณไม่มีสิทธิ์ในการดูข้อมูลผู้ใช้งาน กรุณาแจ้งผู้ดูแลระบบ', 'danger');
        }
      } finally {
        setLoading(false);
      }
    };
    fetchUsers();
  }, []);

  const changeRole = async (uid: string, newRole: UserRole) => {
    if (!isAdmin) return;
    try {
      await updateDoc(doc(db, 'users', uid), { role: newRole });
      setUsers(users.map(u => u.uid === uid ? { ...u, role: newRole } : u));
    } catch (err: any) {
      console.error(err);
      showAlert('เกิดข้อผิดพลาด', 'ไม่สามารถเปลี่ยนสิทธิ์ได้: ' + (err.message || 'Error'), 'danger');
    }
  };

  const toggleUserStatus = async (uid: string, currentStatus: boolean) => {
    if (!isAdmin) return;
    try {
      await updateDoc(doc(db, 'users', uid), { disabled: !currentStatus });
      setUsers(users.map(u => u.uid === uid ? { ...u, disabled: !currentStatus } : u));
    } catch (err: any) {
      console.error(err);
      showAlert('เกิดข้อผิดพลาด', 'ไม่สามารถเปลี่ยนสถานะได้: ' + (err.message || 'Error'), 'danger');
    }
  };

  const deleteUser = async (uid: string) => {
    if (!isAdmin) return;
    
    showConfirm({
      title: 'ต้องการลบผู้ใช้งานใช่หรือไม่?',
      message: 'การลบข้อมูลผู้ใช้งานจะเป็นการลบแบบถาวรและไม่สามารถกู้คืนได้ภายหลัง',
      confirmText: 'ใช่, ฉันต้องการลบ',
      cancelText: 'ยกเลิก',
      type: 'danger',
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, 'users', uid));
          setUsers(users.filter(u => u.uid !== uid));
          showAlert('สำเร็จ', 'ลบผู้ใช้งานเรียบร้อยแล้ว', 'info');
        } catch (err: any) {
          console.error(err);
          showAlert('เกิดข้อผิดพลาด', 'ไม่สามารถลบข้อมูลผู้ใช้งานได้: ' + (err.message || err), 'danger');
        }
      }
    });
  };

  const filteredUsers = users.filter(u => 
    (u.fullName || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
    (u.email || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) return (
    <div className="space-y-6">
      <div className="flex justify-between items-center bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
        <div className="space-y-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-48" />
        </div>
        <Skeleton className="h-10 w-64" />
      </div>
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="p-6 space-y-4">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="flex justify-between items-center gap-4">
              <div className="flex items-center gap-3">
                <Skeleton className="w-10 h-10 rounded-full" />
                <div className="space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-48" />
                </div>
              </div>
              <Skeleton className="h-8 w-32" />
              <Skeleton className="h-6 w-24" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-8 w-24" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
        <div>
          <h1 className="text-2xl font-black text-slate-800">จัดการผู้ใช้งาน</h1>
          <p className="text-slate-500 font-bold text-sm">กำหนดสิทธิ์และระดับการเข้าถึงระบบ</p>
        </div>
        <div className="relative w-full md:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input 
            type="text" 
            placeholder="ค้นหาชื่อหรืออีเมล..." 
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 text-slate-400 uppercase text-[10px] font-black tracking-widest border-b border-slate-100">
              <th className="px-6 py-4">ผู้ใช้งาน</th>
              <th className="px-6 py-4">สิทธิ์การใช้งาน</th>
              <th className="px-6 py-4">สถานะ</th>
              <th className="px-6 py-4">วันที่ลงทะเบียน</th>
              <th className="px-6 py-4 text-right">ดำเนินการ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {filteredUsers.map((user) => (
              <tr key={user.uid} className="hover:bg-slate-50 transition-colors">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center font-bold">
                      {user.fullName?.[0] || 'U'}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-800">{user.fullName}</p>
                      <p className="text-xs text-slate-500 font-medium">{user.email}</p>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span className="text-xs font-bold px-3 py-1 bg-slate-100 text-slate-600 rounded-full border border-slate-200">
                    {roleLabels[user.role]}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <span className={`text-[10px] font-black px-3 py-1 rounded-full border ${
                    user.disabled 
                    ? 'bg-red-50 text-red-600 border-red-100' 
                    : 'bg-emerald-50 text-emerald-600 border-emerald-100'
                  }`}>
                    {user.disabled ? 'DISABLED' : 'ACTIVE'}
                  </span>
                </td>
                <td className="px-6 py-4 text-xs font-medium text-slate-500">
                  {new Date(user.createdAt).toLocaleDateString('th-TH')}
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <select 
                      value={user.role} 
                      disabled={!isAdmin}
                      onChange={(e) => changeRole(user.uid, e.target.value as UserRole)}
                      className="text-xs font-bold p-2 bg-white border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50"
                    >
                      {Object.entries(roleLabels).map(([role, label]) => (
                        <option key={role} value={role}>{label}</option>
                      ))}
                    </select>
                    
                    {isAdmin && (
                      <div className="flex items-center gap-1">
                        <button 
                          onClick={() => toggleUserStatus(user.uid, !!user.disabled)}
                          title={user.disabled ? "Enable User" : "Disable User"}
                          className={`p-2 rounded-lg transition-all ${
                            user.disabled 
                            ? 'text-emerald-600 hover:bg-emerald-50' 
                            : 'text-orange-600 hover:bg-orange-50'
                          }`}
                        >
                          {user.disabled ? <Power size={18} /> : <UserX size={18} />}
                        </button>
                        <button 
                          onClick={() => deleteUser(user.uid)}
                          title="Delete User"
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-all"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filteredUsers.length === 0 && (
          <div className="p-20 text-center text-slate-400 font-bold">ไม่พบข้อมูลผู้ใช้งาน</div>
        )}
      </div>

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
