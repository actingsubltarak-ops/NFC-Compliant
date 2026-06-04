/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { collection, getDocs, addDoc, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { Category, Department } from '../../types';
import { Plus, Trash2, Edit3, Check, X, Landmark, Tag, Loader2 } from 'lucide-react';
import { ConfirmDialog } from '../common/ConfirmDialog';

export function MasterData() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [newCat, setNewCat] = useState('');
  const [newDep, setNewDep] = useState('');
  const [adding, setAdding] = useState(false);
  
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [updating, setUpdating] = useState(false);

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
    const fetchData = async () => {
      try {
        setLoading(true);
        
        let catSnap, depSnap;
        try {
          const { getDocsFromServer } = await import('firebase/firestore');
          [catSnap, depSnap] = await Promise.all([
            getDocsFromServer(collection(db, 'categories')),
            getDocsFromServer(collection(db, 'departments'))
          ]);
        } catch (serverError) {
          console.warn("Failed to fetch fresh master data, using cache:", serverError);
          [catSnap, depSnap] = await Promise.all([
            getDocs(collection(db, 'categories')),
            getDocs(collection(db, 'departments'))
          ]);
        }
        
        let catData = catSnap.docs.map(d => ({ id: d.id, ...d.data() } as Category));
        let depData = depSnap.docs.map(d => ({ id: d.id, ...d.data() } as Department));

        // If data is empty and user is admin, seed some defaults automatically
        // this fixes the "disappearing database" issue if the collections were accidentally cleared
        if (catData.length === 0 || depData.length === 0) {
           console.log("Master data empty, seeding defaults...");
           const defaultCats = ['ปัญหาที่ดิน', 'ปัญหาหนี้สิน', 'ปัญหาราคาสินค้าเกษตร', 'ภัยแล้ง', 'น้ำท่วม', 'ศัตรูพืชระบาด', 'ปัญหาด้านอื่นๆ'];
           const defaultDeps = ['กรมส่งเสริมการเกษตร', 'กรมชลประทาน', 'กรมปศุสัตว์', 'กรมประมง', 'สำนักงานปฏิรูปที่ดินเพื่อเกษตรกรรม (ส.ป.ก.)', 'โครงการชลประทานจังหวัด', 'เกษตรจังหวัด'];
           
           if (catData.length === 0) {
             for (const name of defaultCats) {
               const docRef = await addDoc(collection(db, 'categories'), { name });
               catData.push({ id: docRef.id, name });
             }
           }
           
           if (depData.length === 0) {
             for (const name of defaultDeps) {
               const docRef = await addDoc(collection(db, 'departments'), { name });
               depData.push({ id: docRef.id, name });
             }
           }
        }

        setCategories(catData.sort((a, b) => {
          const nameA = a.name || '';
          const nameB = b.name || '';
          if (nameA === 'ปัญหาด้านอื่นๆ' && nameB !== 'ปัญหาด้านอื่นๆ') return 1;
          if (nameA !== 'ปัญหาด้านอื่นๆ' && nameB === 'ปัญหาด้านอื่นๆ') return -1;
          return nameA.localeCompare(nameB, 'th');
        }));
        
        setDepartments(depData.sort((a, b) => {
          const nameA = a.name || '';
          const nameB = b.name || '';
          if (nameA === 'ปัญหาด้านอื่นๆ' && nameB !== 'ปัญหาด้านอื่นๆ') return 1;
          if (nameA !== 'ปัญหาด้านอื่นๆ' && nameB === 'ปัญหาด้านอื่นๆ') return -1;
          return nameA.localeCompare(nameB, 'th');
        }));
      } catch (err: any) {
        console.error("MasterData fetch error:", err);
        if (err.message?.includes('permission-denied')) {
          showAlert('ไม่มีสิทธิ์เข้าถึง', 'คุณไม่มีสิทธิ์ในการเข้าถึงข้อมูลพื้นฐานระบบ', 'danger');
        }
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const addCategory = async () => {
    if (!newCat) return;
    setAdding(true);
    try {
      const docRef = await addDoc(collection(db, 'categories'), { name: newCat });
      setCategories([...categories, { id: docRef.id, name: newCat }].sort((a, b) => {
        const nameA = a.name || '';
        const nameB = b.name || '';
        if (nameA === 'ปัญหาด้านอื่นๆ' && nameB !== 'ปัญหาด้านอื่นๆ') return 1;
        if (nameA !== 'ปัญหาด้านอื่นๆ' && nameB === 'ปัญหาด้านอื่นๆ') return -1;
        return nameA.localeCompare(nameB, 'th');
      }));
      setNewCat('');
    } finally {
      setAdding(false);
    }
  };

  const addDepartment = async () => {
    if (!newDep) return;
    setAdding(true);
    try {
      const docRef = await addDoc(collection(db, 'departments'), { name: newDep });
      setDepartments([...departments, { id: docRef.id, name: newDep }].sort((a, b) => {
        const nameA = a.name || '';
        const nameB = b.name || '';
        if (nameA === 'ปัญหาด้านอื่นๆ' && nameB !== 'ปัญหาด้านอื่นๆ') return 1;
        if (nameA !== 'ปัญหาด้านอื่นๆ' && nameB === 'ปัญหาด้านอื่นๆ') return -1;
        return nameA.localeCompare(nameB, 'th');
      }));
      setNewDep('');
    } finally {
      setAdding(false);
    }
  };

  const removeData = async (type: 'cat' | 'dep', id: string) => {
    showConfirm({
      title: 'ต้องการลบข้อมูลใช่หรือไม่?',
      message: 'ข้อมูลนี้จะถูกลบออกแบบถาวรและไม่สามารถกู้คืนได้ภายหลัง',
      confirmText: 'ใช่, ฉันต้องการลบ',
      cancelText: 'ยกเลิก',
      type: 'danger',
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, type === 'cat' ? 'categories' : 'departments', id));
          if (type === 'cat') setCategories(categories.filter(c => c.id !== id));
          else setDepartments(departments.filter(d => d.id !== id));
          showAlert('สำเร็จ', 'ลบข้อมูลเรียบร้อยแล้ว', 'info');
        } catch (err: any) {
          console.error(err);
          showAlert('เกิดข้อผิดพลาด', 'ไม่สามารถลบข้อมูลได้: ' + (err.message || err), 'danger');
        }
      }
    });
  };

  const startEdit = (id: string, value: string) => {
    setEditingId(id);
    setEditingValue(value);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingValue('');
  };

  const saveEdit = async (type: 'cat' | 'dep') => {
    if (!editingId || !editingValue.trim()) return;
    setUpdating(true);
    try {
      const collectionName = type === 'cat' ? 'categories' : 'departments';
      await updateDoc(doc(db, collectionName, editingId), { name: editingValue });
      
      if (type === 'cat') {
        setCategories(categories.map(c => c.id === editingId ? { ...c, name: editingValue } : c).sort((a, b) => {
          const nameA = a.name || '';
          const nameB = b.name || '';
          if (nameA === 'ปัญหาด้านอื่นๆ' && nameB !== 'ปัญหาด้านอื่นๆ') return 1;
          if (nameA !== 'ปัญหาด้านอื่นๆ' && nameB === 'ปัญหาด้านอื่นๆ') return -1;
          return nameA.localeCompare(nameB, 'th');
        }));
      } else {
        setDepartments(departments.map(d => d.id === editingId ? { ...d, name: editingValue } : d).sort((a, b) => {
          const nameA = a.name || '';
          const nameB = b.name || '';
          if (nameA === 'ปัญหาด้านอื่นๆ' && nameB !== 'ปัญหาด้านอื่นๆ') return 1;
          if (nameA !== 'ปัญหาด้านอื่นๆ' && nameB === 'ปัญหาด้านอื่นๆ') return -1;
          return nameA.localeCompare(nameB, 'th');
        }));
      }
      cancelEdit();
    } catch (err) {
      console.error(err);
    } finally {
      setUpdating(false);
    }
  };

  if (loading) return <div className="p-10 text-center">กำลังโหลดข้อมูลระบบ...</div>;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-black text-slate-800 tracking-tight">เมนูข้อมูลพื้นฐาน</h1>
        <p className="text-slate-500 font-bold">จัดการข้อมูลหมวดหมู่และหน่วยงานที่เกี่ยวข้อง</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Categories */}
        <div className="bg-white rounded-3xl p-8 shadow-sm border border-slate-100 flex flex-col gap-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="bg-amber-100 text-amber-600 p-3 rounded-2xl"><Tag size={24} /></div>
            <h2 className="text-xl font-black text-slate-800">หมวดหมู่เรื่องร้องเรียน</h2>
          </div>
          
          <div className="flex gap-2">
            <input 
              type="text" 
              value={newCat}
              onChange={(e) => setNewCat(e.target.value)}
              placeholder="เพิ่มหมวดหมู่ใหม่..."
              className="flex-1 p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-amber-500 transition-all font-bold text-sm"
            />
            <button onClick={addCategory} disabled={adding} className="bg-amber-600 text-white p-3 rounded-xl hover:bg-amber-700 transition-all">
              {adding ? <Loader2 className="animate-spin" size={20} /> : <Plus size={20} />}
            </button>
          </div>

          <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2 scrollbar-hide">
            {categories.map(cat => (
              <div key={cat.id} className="flex justify-between items-center p-3 bg-slate-50 rounded-xl group hover:bg-amber-50 transition-all border border-transparent hover:border-amber-100">
                {editingId === cat.id ? (
                  <div className="flex-1 flex gap-2">
                    <input 
                      autoFocus
                      className="flex-1 bg-white border border-amber-300 rounded-lg px-2 py-1 text-sm font-bold outline-none"
                      value={editingValue}
                      onChange={(e) => setEditingValue(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && saveEdit('cat')}
                    />
                    <button onClick={() => saveEdit('cat')} className="text-emerald-500 hover:bg-emerald-50 p-1 rounded">
                      <Check size={16} />
                    </button>
                    <button onClick={cancelEdit} className="text-slate-400 hover:bg-slate-100 p-1 rounded">
                      <X size={16} />
                    </button>
                  </div>
                ) : (
                  <>
                    <span className="font-bold text-slate-700 text-sm">{cat.name}</span>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
                      <button onClick={() => startEdit(cat.id, cat.name)} className="text-slate-400 hover:text-amber-600 p-1">
                        <Edit3 size={16} />
                      </button>
                      <button onClick={() => removeData('cat', cat.id)} className="text-slate-400 hover:text-red-500 p-1">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Departments */}
        <div className="bg-white rounded-3xl p-8 shadow-sm border border-slate-100 flex flex-col gap-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="bg-blue-100 text-blue-600 p-3 rounded-2xl"><Landmark size={24} /></div>
            <h2 className="text-xl font-black text-slate-800">หน่วยงานที่เกี่ยวข้อง</h2>
          </div>
          
          <div className="flex gap-2">
            <input 
              type="text" 
              value={newDep}
              onChange={(e) => setNewDep(e.target.value)}
              placeholder="เพิ่มหน่วยงานใหม่..."
              className="flex-1 p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all font-bold text-sm"
            />
            <button onClick={addDepartment} disabled={adding} className="bg-blue-600 text-white p-3 rounded-xl hover:bg-blue-700 transition-all">
              {adding ? <Loader2 className="animate-spin" size={20} /> : <Plus size={20} />}
            </button>
          </div>

          <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2 scrollbar-hide">
            {departments.map(dep => (
              <div key={dep.id} className="flex justify-between items-center p-3 bg-slate-50 rounded-xl group hover:bg-blue-50 transition-all border border-transparent hover:border-blue-100">
                {editingId === dep.id ? (
                  <div className="flex-1 flex gap-2">
                    <input 
                      autoFocus
                      className="flex-1 bg-white border border-blue-300 rounded-lg px-2 py-1 text-sm font-bold outline-none"
                      value={editingValue}
                      onChange={(e) => setEditingValue(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && saveEdit('dep')}
                    />
                    <button onClick={() => saveEdit('dep')} className="text-emerald-500 hover:bg-emerald-50 p-1 rounded">
                      <Check size={16} />
                    </button>
                    <button onClick={cancelEdit} className="text-slate-400 hover:bg-slate-100 p-1 rounded">
                      <X size={16} />
                    </button>
                  </div>
                ) : (
                  <>
                    <span className="font-bold text-slate-700 text-sm">{dep.name}</span>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
                      <button onClick={() => startEdit(dep.id, dep.name)} className="text-slate-400 hover:text-blue-600 p-1">
                        <Edit3 size={16} />
                      </button>
                      <button onClick={() => removeData('dep', dep.id)} className="text-slate-400 hover:text-red-500 p-1">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
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
