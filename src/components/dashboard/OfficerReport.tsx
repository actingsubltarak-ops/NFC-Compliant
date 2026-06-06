/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { Complaint } from '../../types';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Cell
} from 'recharts';
import { Skeleton, CardSkeleton, ChartSkeleton } from '../ui/Skeleton';
import { motion } from 'motion/react';
import { 
  ClipboardList, 
  CheckCircle2, 
  Clock,
  AlertTriangle,
  Users,
  Activity,
  Calendar,
  ChevronRight,
  LayoutDashboard,
  Table,
  Filter,
  Search,
  X,
  ChevronLeft,
  ArrowUpDown,
  RefreshCw,
  Eye,
  MapPin,
  User,
  FileText,
  Tag,
  ChevronDown,
  ChevronUp,
  SlidersHorizontal,
  Download
} from 'lucide-react';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';
import html2pdf from 'html2pdf.js';

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6'];

const STATUS_LABELS: Record<string, string> = {
  pending: 'รอตรวจสอบ',
  received: 'รับเรื่องแล้ว',
  in_progress: 'กำลังดำเนินการ',
  resolved: 'สำเร็จ',
  rejected: 'ไม่รับเรื่อง/ยกเลิก'
};

export function OfficerReport() {
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [dbDepartments, setDbDepartments] = useState<string[]>([]);
  const [dbCategories, setDbCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<'all' | 'today' | '7days' | '30days'>('all');
  const [viewMode, setViewMode] = useState<'dashboard' | 'table'>('dashboard');

  // Multi-condition filtering states
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterSeverity, setFilterSeverity] = useState<string>('all');
  const [filterDepartment, setFilterDepartment] = useState<string>('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  // Sorting states
  const [sortField, setSortField] = useState<'createdAt' | 'trackingId' | 'title' | 'departmentName' | 'severity' | 'status'>('createdAt');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Selected complaint for details view modal
  const [selectedComplaint, setSelectedComplaint] = useState<Complaint | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const q = query(collection(db, 'complaints'));
        const snapshot = await getDocs(q);
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Complaint));
        // Sort in memory
        data.sort((a, b) => {
          const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return dateB - dateA; // desc
        });
        setComplaints(data);

        // Fetch Master Data (Categories & Departments)
        let catSnap, depSnap;
        try {
          const { getDocsFromServer } = await import('firebase/firestore');
          [catSnap, depSnap] = await Promise.all([
            getDocsFromServer(collection(db, 'categories')),
            getDocsFromServer(collection(db, 'departments'))
          ]);
        } catch (serverError) {
          console.warn("Failed to fetch fresh master data from server, using cache/local:", serverError);
          [catSnap, depSnap] = await Promise.all([
            getDocs(collection(db, 'categories')),
            getDocs(collection(db, 'departments'))
          ]);
        }

        let catNames = catSnap.docs.map(d => d.data().name as string).filter(Boolean);
        let depNames = depSnap.docs.map(d => d.data().name as string).filter(Boolean);

        // Fallbacks if collections are empty or failed
        if (catNames.length === 0) {
          catNames = ['ปัญหาที่ดิน', 'ปัญหาหนี้สิน', 'ปัญหาราคาสินค้าเกษตร', 'ภัยแล้ง', 'น้ำท่วม', 'ศัตรูพืชระบาด', 'ปัญหาด้านอื่นๆ'];
        }
        if (depNames.length === 0) {
          depNames = ['กรมส่งเสริมการเกษตร', 'กรมชลประทาน', 'กรมปศุสัตว์', 'กรมประมง', 'สำนักงานปฏิรูปที่ดินเพื่อเกษตรกรรม (ส.ป.ก.)', 'โครงการชลประทานจังหวัด', 'เกษตรจังหวัด'];
        }

        setDbCategories(catNames);
        setDbDepartments(depNames);

      } catch (err) {
        console.error("Officer Report fetch error:", err);
      } finally {
        setTimeout(() => setLoading(false), 500); 
      }
    };
    fetchData();
  }, []);

  const filteredComplaints = complaints.filter(c => {
    if (dateRange === 'all') return true;
    const date = new Date(c.createdAt);
    const now = new Date();
    if (dateRange === 'today') return date.toDateString() === now.toDateString();
    if (dateRange === '7days') return (now.getTime() - date.getTime()) <= 7 * 24 * 60 * 60 * 1000;
    if (dateRange === '30days') return (now.getTime() - date.getTime()) <= 30 * 24 * 60 * 60 * 1000;
    return true;
  });

  const stats = {
    total: filteredComplaints.length,
    active: filteredComplaints.filter(c => ['received', 'in_progress'].includes(c.status)).length,
    resolvedToday: filteredComplaints.filter(c => {
      if (c.status !== 'resolved' || !c.updatedAt) return false;
      const d = new Date(c.updatedAt);
      const today = new Date();
      return d.toDateString() === today.toDateString();
    }).length,
    critical: filteredComplaints.filter(c => c.severity === 'critical' && c.status !== 'resolved').length,
  };

  const deptData = Object.entries(
    filteredComplaints.reduce((acc, c) => {
      const dept = c.departmentName || 'ไม่ระบุ';
      acc[dept] = (acc[dept] || 0) + 1;
      return acc;
    }, {} as Record<string, number>)
  ).map(([name, value]) => ({ name, value }))
   .sort((a, b) => b.value - a.value)
   .slice(0, 5);

  // Dynamic lists for filters
  const filterDepartments = Array.from(new Set([...dbDepartments, ...(complaints.map(c => c.departmentName).filter(Boolean) as string[])]))
    .sort((a, b) => {
      if (a === 'อื่น ๆ' || a === 'อื่นๆ' || a === 'ปัญหาด้านอื่นๆ') return 1;
      if (b === 'อื่น ๆ' || b === 'อื่นๆ' || b === 'ปัญหาด้านอื่นๆ') return -1;
      return a.localeCompare(b, 'th');
    });

  const filterCategories = Array.from(new Set([...dbCategories, ...(complaints.map(c => c.category).filter(Boolean) as string[])]))
    .sort((a, b) => {
      if (a === 'อื่น ๆ' || a === 'อื่นๆ' || a === 'ปัญหาด้านอื่นๆ') return 1;
      if (b === 'อื่น ๆ' || b === 'อื่นๆ' || b === 'ปัญหาด้านอื่นๆ') return -1;
      return a.localeCompare(b, 'th');
    });

  const activeFiltersCount = [
    filterStatus !== 'all',
    filterSeverity !== 'all',
    filterDepartment !== 'all',
    filterCategory !== 'all'
  ].filter(Boolean).length;

  // Filter complaints based on multi-conditions to display in table
  const filteredTableComplaints = filteredComplaints.filter(c => {
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      const matchTitle = c.title?.toLowerCase().includes(term);
      const matchId = c.trackingId?.toLowerCase().includes(term);
      const matchName = c.fullName?.toLowerCase().includes(term);
      const matchDetails = c.details?.toLowerCase().includes(term);
      if (!matchTitle && !matchId && !matchName && !matchDetails) return false;
    }
    if (filterStatus !== 'all' && c.status !== filterStatus) return false;
    if (filterSeverity !== 'all' && c.severity !== filterSeverity) return false;
    if (filterDepartment !== 'all' && c.departmentName !== filterDepartment) return false;
    if (filterCategory !== 'all' && c.category !== filterCategory) return false;
    return true;
  });

  // Handle toggle field sort
  const handleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
    setCurrentPage(1);
  };

  // Sorted complaints
  const sortedComplaints = [...filteredTableComplaints].sort((a, b) => {
    let valA: any = a[sortField] || '';
    let valB: any = b[sortField] || '';

    if (sortField === 'createdAt') {
      const timeA = valA ? new Date(valA).getTime() : 0;
      const timeB = valB ? new Date(valB).getTime() : 0;
      return sortDirection === 'asc' ? timeA - timeB : timeB - timeA;
    }

    if (typeof valA === 'string' && typeof valB === 'string') {
      return sortDirection === 'asc' 
        ? valA.localeCompare(valB, 'th') 
        : valB.localeCompare(valA, 'th');
    }

    return sortDirection === 'asc' ? (valA > valB ? 1 : -1) : (valA < valB ? 1 : -1);
  });

  // Paginated complaints
  const totalPages = Math.ceil(sortedComplaints.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedComplaints = sortedComplaints.slice(startIndex, startIndex + itemsPerPage);

  // Reset all filters helper
  const handleClearFilters = () => {
    setSearchTerm('');
    setFilterStatus('all');
    setFilterSeverity('all');
    setFilterDepartment('all');
    setFilterCategory('all');
    setCurrentPage(1);
  };

  // Reset page when search or select changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterStatus, filterSeverity, filterDepartment, filterCategory, dateRange]);

  const exportToPDF = () => {
    if (sortedComplaints.length === 0) return;
    
    const element = document.getElementById('officer-report-printable');
    if (!element) return;

    // Temporarily show the hidden element for capture
    element.style.display = 'block';

    const opt = {
      margin: [10, 10, 10, 10] as [number, number, number, number],
      filename: `NFC_Officer_Report_${new Date().toISOString().slice(0, 10)}.pdf`,
      image: { type: 'jpeg' as const, quality: 0.98 },
      html2canvas: { 
        scale: 2, 
        useCORS: true, 
        letterRendering: true,
        scrollX: 0,
        scrollY: 0
      },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' as const }
    };

    html2pdf().set(opt).from(element).save().then(() => {
      element.style.display = 'none';
    });
  };

  if (loading) return (
    <div className="space-y-8 pb-10">
      <div className="flex justify-between items-center">
        <div className="space-y-2">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-4 w-48" />
        </div>
        <Skeleton className="h-12 w-48" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <ChartSkeleton />
          <ChartSkeleton />
        </div>
        <div className="space-y-6">
          <Skeleton className="h-64 w-full rounded-3xl" />
          <Skeleton className="h-64 w-full rounded-3xl" />
        </div>
      </div>
    </div>
  );

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-8 pb-10"
    >
      {/* Hidden element for PDF Export */}
      <div id="officer-report-printable" style={{ display: 'none' }} className="p-8 bg-white font-sans text-slate-800">
        <div className="mb-8 border-b-2 border-emerald-600 pb-6 flex justify-between items-end">
          <div>
            <h1 className="text-2xl font-black text-slate-800">รายงานสรุปเรื่องร้องเรียนและประสิทธิภาพการจัดการ</h1>
            <p className="text-sm text-slate-500 font-bold mt-1">ระบบรับเรื่องร้องเรียนร้องทุกข์ (NFC Complaint System)</p>
          </div>
          <div className="text-right">
            <p className="text-xs font-black text-slate-400">ข้อมูล ณ วันที่ {format(new Date(), 'd MMMM yyyy HH:mm', { locale: th })}</p>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-4 mb-8">
          <div className="bg-slate-50 p-4 rounded-2xl">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">รายการทั้งหมด</p>
            <p className="text-2xl font-black text-slate-800">{stats.total}</p>
          </div>
          <div className="bg-emerald-50 p-4 rounded-2xl">
            <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-1">กำลังดำเนินการ</p>
            <p className="text-2xl font-black text-emerald-700">{stats.active}</p>
          </div>
          <div className="bg-blue-50 p-4 rounded-2xl">
            <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest mb-1">สำเร็จวันนี้</p>
            <p className="text-2xl font-black text-blue-700">{stats.resolvedToday}</p>
          </div>
          <div className="bg-red-50 p-4 rounded-2xl">
            <p className="text-[10px] font-black text-red-600 uppercase tracking-widest mb-1">วิกฤตค้างงาน</p>
            <p className="text-2xl font-black text-red-700">{stats.critical}</p>
          </div>
        </div>

        <table className="w-full text-xs text-left border-collapse">
          <thead>
            <tr className="bg-slate-100 border-b border-slate-200">
              <th className="p-3 font-black text-slate-600">รหัส</th>
              <th className="p-3 font-black text-slate-600">หัวเรื่อง</th>
              <th className="p-3 font-black text-slate-600">ผู้แจ้ง</th>
              <th className="p-3 font-black text-slate-600">หน่วยงาน</th>
              <th className="p-3 font-black text-slate-600">เร่งด่วน</th>
              <th className="p-3 font-black text-slate-600">สถานะ</th>
              <th className="p-3 font-black text-slate-600">วันที่แจ้ง</th>
            </tr>
          </thead>
          <tbody>
            {sortedComplaints.map((c, idx) => (
              <tr key={c.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                <td className="p-3 font-mono font-bold text-[10px] text-slate-500">{c.trackingId || c.id.slice(0, 8)}</td>
                <td className="p-3 font-black text-slate-800">{c.title}</td>
                <td className="p-3 font-bold text-slate-600">{c.fullName || '-'}</td>
                <td className="p-3 font-bold text-slate-600">{c.departmentName || '-'}</td>
                <td className="p-3">
                  <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${
                    c.severity === 'critical' ? 'bg-red-100 text-red-700' :
                    c.severity === 'high' ? 'bg-orange-100 text-orange-700' :
                    c.severity === 'medium' ? 'bg-yellow-100 text-yellow-700' : 'bg-blue-100 text-blue-700'
                  }`}>
                    {c.severity === 'critical' ? 'วิกฤต' : c.severity === 'high' ? 'สูง' : c.severity === 'medium' ? 'กลาง' : 'ต่ำ'}
                  </span>
                </td>
                <td className="p-3 font-black text-slate-700">{STATUS_LABELS[c.status] || c.status}</td>
                <td className="p-3 font-bold text-slate-500 whitespace-nowrap">
                  {c.createdAt ? format(new Date(c.createdAt), 'dd/MM/yyyy', { locale: th }) : '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-8 text-center text-[10px] text-slate-400 font-bold italic">
          -- จบบันทึกรายงานสรุปเรื่องร้องเรียน --
        </div>
      </div>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-800 tracking-tight">รายงานการปฏิบัติงาน</h1>
          <p className="text-slate-500 font-bold">รายงานประสิทธิภาพและการจัดการงานระดับปฏิบัติการ</p>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">

          {/* ปุ่มเพื่อเปลี่ยนมุมมองการแสดงผล อยู่ถัดจาก เลือกช่วงเวลา */}
          <div className="flex items-center bg-white p-1 rounded-2xl shadow-sm border border-slate-100 gap-1">
            <button
              type="button"
              onClick={() => setViewMode('dashboard')}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black transition-all ${
                viewMode === 'dashboard'
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-200'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <LayoutDashboard size={14} />
              <span>สรุปภาพรวม</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black transition-all ${
                viewMode === 'table'
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-200'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <Table size={14} />
              <span>ตารางข้อมูล</span>
            </button>
          </div>

          <div className="flex items-center gap-3 bg-white px-4 py-3 rounded-2xl shadow-sm border border-slate-100 hover:border-emerald-200 transition-colors">
            <Calendar size={18} className="text-emerald-600" />
            <select 
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value as any)}
              className="text-sm font-black text-slate-700 outline-none bg-transparent cursor-pointer pr-2"
            >
              <option value="all">ทั้งหมด</option>
              <option value="today">วันนี้</option>
              <option value="7days">7 วันล่าสุด</option>
              <option value="30days">30 วันล่าสุด</option>
            </select>
          </div>
        </div>
      </div>

      {viewMode === 'dashboard' ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <StatCard 
              title="งานทั้งหมด" 
              value={stats.total} 
              icon={ClipboardList} 
              color="slate"
              delay={0.1}
            />
            <StatCard 
              title="กำลังดำเนินการ" 
              value={stats.active} 
              icon={Activity} 
              color="emerald"
              delay={0.2}
            />
            <StatCard 
              title="เสร็จสิ้นวันนี้" 
              value={stats.resolvedToday} 
              icon={CheckCircle2} 
              color="blue"
              delay={0.3}
            />
            <StatCard 
              title="ค้างงานวิกฤต" 
              value={stats.critical} 
              icon={AlertTriangle} 
              color="red"
              delay={0.4}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                className="bg-white p-8 rounded-[32px] shadow-sm border border-slate-100"
              >
                <h3 className="text-xl font-black text-slate-800 mb-8 flex items-center gap-3">
                  <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-600">
                    <Users size={20} />
                  </div>
                  ปริมาณงานแยกตามหน่วยงาน (TOP 5)
                </h3>
                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height={300} minWidth={0}>
                    <BarChart data={deptData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 12, fontWeight: 'bold'}} dy={10} />
                      <YAxis axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 12, fontWeight: 'bold'}} />
                      <Tooltip 
                        cursor={{fill: '#f8fafc'}} 
                        contentStyle={{borderRadius: '20px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)'}} 
                      />
                      <Bar dataKey="value" radius={[6, 6, 0, 0]} barSize={48}>
                        {deptData.map((_, index) => (
                          <Cell key={index} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </motion.div>

              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6 }}
                className="bg-white p-8 rounded-[32px] shadow-sm border border-slate-100"
              >
                <h3 className="text-xl font-black text-slate-800 mb-8 flex items-center gap-3">
                  <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-600">
                    <Clock size={20} />
                  </div>
                  รายการที่ต้องดำเนินการล่าสุด
                </h3>
                <div className="space-y-3">
                  {filteredComplaints.filter(c => c.status !== 'resolved').slice(0, 5).map((c, i) => (
                    <div 
                      key={i} 
                      onClick={() => setSelectedComplaint(c)}
                      className="flex items-center justify-between p-5 bg-slate-50 rounded-2xl group hover:bg-emerald-50 hover:shadow-lg hover:shadow-emerald-100/50 transition-all cursor-pointer border border-transparent hover:border-emerald-100"
                    >
                      <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 flex items-center justify-center rounded-xl shadow-sm ${
                          c.severity === 'critical' ? 'bg-red-100 text-red-600' : 
                          c.severity === 'high' ? 'bg-orange-100 text-orange-600' : 'bg-blue-100 text-blue-600'
                        }`}>
                          <AlertTriangle size={24} />
                        </div>
                        <div>
                          <p className="text-sm font-black text-slate-800">{c.title}</p>
                          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">แจ้งเมื่อ {(() => {
                            try {
                              return format(new Date(c.createdAt), 'd MMM HH:mm', { locale: th });
                            } catch (e) {
                              return 'ไม่ระบุ';
                            }
                          })()}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                          c.status === 'received' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
                        }`}>
                          {c.status}
                        </span>
                        <ChevronRight size={18} className="text-slate-300 group-hover:text-emerald-500 group-hover:translate-x-1 transition-all" />
                      </div>
                    </div>
                  ))}
                  {filteredComplaints.filter(c => c.status !== 'resolved').length === 0 && (
                    <div className="py-20 text-center text-slate-400 font-black uppercase tracking-[0.2em] text-xs">ไม่มีรายการค้างในขณะนี้</div>
                  )}
                </div>
              </motion.div>
            </div>

            <div className="space-y-6">
              <motion.div 
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.7 }}
                className="bg-emerald-600 rounded-[32px] p-8 text-white shadow-2xl shadow-emerald-200 relative overflow-hidden"
              >
                <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500 rounded-full -translate-y-1/2 translate-x-1/2 opacity-30"></div>
                <h3 className="text-2xl font-black mb-1 tracking-tight">สรุปการปฏิบัติงาน</h3>
                <p className="text-emerald-100/80 text-sm font-bold mb-8">ภาพรวมผลงานของทีมเจ้าหน้าที่</p>
                
                <div className="space-y-8">
                  <div>
                    <div className="flex justify-between text-[10px] font-black uppercase tracking-[0.2em] mb-3">
                      <span>อัตราการแก้ไขปัญหา</span>
                      <span className="text-base leading-none">{stats.total > 0 ? Math.round((filteredComplaints.filter(c => c.status === 'resolved').length / stats.total) * 100) : 0}%</span>
                    </div>
                    <div className="h-3 bg-emerald-700/50 rounded-full overflow-hidden p-0.5">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${stats.total > 0 ? (filteredComplaints.filter(c => c.status === 'resolved').length / stats.total) * 100 : 0}%` }}
                        transition={{ duration: 1.5, ease: "easeOut" }}
                        className="h-full bg-white rounded-full shadow-sm" 
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-white/10 p-5 rounded-2xl backdrop-blur-md border border-white/10">
                      <p className="text-3xl font-black leading-none mb-1">{filteredComplaints.filter(c => c.status === 'rejected').length}</p>
                      <p className="text-[10px] font-black text-emerald-200 uppercase tracking-widest leading-none">ไม่รับเรื่อง</p>
                    </div>
                    <div className="bg-white/10 p-5 rounded-2xl backdrop-blur-md border border-white/10">
                      <p className="text-3xl font-black leading-none mb-1">{filteredComplaints.filter(c => c.status === 'in_progress').length}</p>
                      <p className="text-[10px] font-black text-emerald-200 uppercase tracking-widest leading-none">รอดำเนินการ</p>
                    </div>
                  </div>
                </div>
              </motion.div>

              <motion.div 
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.8 }}
                className="bg-white p-8 rounded-[32px] shadow-sm border border-slate-100"
              >
                <h3 className="text-xl font-black text-slate-800 mb-8 uppercase tracking-widest text-center">สถิติความเร่งด่วน</h3>
                <div className="space-y-5">
                  {['critical', 'high', 'medium', 'low'].map((sev) => {
                    const count = filteredComplaints.filter(c => c.severity === sev && c.status !== 'resolved').length;
                    const colors: Record<string, string> = {
                      critical: 'bg-red-500',
                      high: 'bg-orange-500',
                      medium: 'bg-yellow-500',
                      low: 'bg-blue-500'
                    };
                    const labels: Record<string, string> = {
                      critical: 'วิกฤต',
                      high: 'สูง',
                      medium: 'กลาง',
                      low: 'ต่ำ'
                    };
                    return (
                      <div key={sev} className="flex items-center justify-between group cursor-default">
                        <div className="flex items-center gap-4">
                          <div className={`w-3.5 h-3.5 rounded-full ${colors[sev]} group-hover:scale-125 transition-transform`}></div>
                          <span className="text-sm font-black text-slate-600 uppercase tracking-widest">{labels[sev]}</span>
                        </div>
                        <span className="text-xl font-black text-slate-900 leading-none">{count}</span>
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            </div>
          </div>
        </>
      ) : (
        <div className="space-y-6">
          {/* ตัวกรองตารางเชิงลึกหลายทางเลือก */}
          <motion.div 
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white p-6 md:p-8 rounded-[32px] shadow-sm border border-slate-100"
          >
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-600">
                  <Filter size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-800">ค้นหาเรื่องร้องเรียน</h3>
                </div>
              </div>

              {(searchTerm || filterStatus !== 'all' || filterSeverity !== 'all' || filterDepartment !== 'all' || filterCategory !== 'all') && (
                <button
                  type="button"
                  onClick={handleClearFilters}
                  className="flex items-center gap-2 px-4 py-2 text-rose-600 hover:bg-rose-50 rounded-xl text-xs font-black transition-colors self-start md:self-auto border border-dashed border-rose-200"
                >
                  <RefreshCw size={14} />
                  <span>ล้างตัวกรองทั้งหมด</span>
                </button>
              )}
            </div>

            {/* ค้นหาคำหลักและกลุ่มตัวคัดกรอง */}
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input
                    type="text"
                    placeholder="ค้นหารหัสติดตาม, หัวข้อร้องเรียน, ผู้ร้องเรียน หรือสาระสำคัญ..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-12 pr-12 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-emerald-500 text-sm font-semibold text-slate-700 placeholder-slate-400 transition-all focus:bg-white"
                  />
                  {searchTerm && (
                    <button 
                      onClick={() => setSearchTerm('')} 
                      className="absolute right-4 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-300 text-xs transition-colors"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                  className={`flex items-center justify-center gap-2 px-5 py-3.5 rounded-2xl font-black text-xs border transition-all shadow-sm shrink-0 select-none ${
                    showAdvancedFilters 
                      ? 'bg-emerald-600 border-emerald-600 text-white shadow-emerald-500/10' 
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <SlidersHorizontal size={14} className={showAdvancedFilters ? 'animate-pulse' : ''} />
                  <span>ค้นหาแบบมีเงื่อนไข</span>
                  {activeFiltersCount > 0 && (
                    <span className={`inline-flex items-center justify-center w-5 h-5 text-[10px] font-black rounded-full ${
                      showAdvancedFilters ? 'bg-white text-emerald-700' : 'bg-emerald-500 text-white'
                    }`}>
                      {activeFiltersCount}
                    </span>
                  )}
                  {showAdvancedFilters ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
              </div>

              {/* สรุปเงื่อนไขที่เลือกค้างไว้เมื่อซ่อนอยู่ */}
              {activeFiltersCount > 0 && !showAdvancedFilters && (
                <motion.div 
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex flex-wrap gap-1.5 pt-1.5 items-center text-xs text-slate-500 font-bold"
                >
                  <span>กำลังกรองค้างไว้:</span>
                  {filterStatus !== 'all' && (
                    <span className="inline-flex items-center gap-1 bg-emerald-50 border border-emerald-100 text-emerald-700 px-2.5 py-1 rounded-xl text-[11px] font-black">
                      สถานะ: {filterStatus === 'pending' ? 'รอตรวจสอบ' : filterStatus === 'received' ? 'รับเรื่องแล้ว' : filterStatus === 'in_progress' ? 'กำลังดำเนินการ' : filterStatus === 'resolved' ? 'ดำเนินการเสร็จสิ้น' : 'ไม่รับเรื่องร้องเรียน'}
                      <button type="button" onClick={() => setFilterStatus('all')} className="text-emerald-500 hover:text-emerald-800"><X size={10} /></button>
                    </span>
                  )}
                  {filterSeverity !== 'all' && (
                    <span className="inline-flex items-center gap-1 bg-emerald-50 border border-emerald-100 text-emerald-700 px-2.5 py-1 rounded-xl text-[11px] font-black">
                      ความเร่งด่วน: {filterSeverity === 'low' ? 'ต่ำ' : filterSeverity === 'medium' ? 'กลาง' : filterSeverity === 'high' ? 'สูง' : 'วิกฤต'}
                      <button type="button" onClick={() => setFilterSeverity('all')} className="text-emerald-500 hover:text-emerald-800"><X size={10} /></button>
                    </span>
                  )}
                  {filterDepartment !== 'all' && (
                    <span className="inline-flex items-center gap-1 bg-emerald-50 border border-emerald-100 text-emerald-700 px-2.5 py-1 rounded-xl text-[11px] font-black max-w-[200px] truncate">
                      หน่วยงาน: {filterDepartment}
                      <button type="button" onClick={() => setFilterDepartment('all')} className="text-emerald-500 hover:text-emerald-800 shrink-0"><X size={10} /></button>
                    </span>
                  )}
                  {filterCategory !== 'all' && (
                    <span className="inline-flex items-center gap-1 bg-emerald-50 border border-emerald-100 text-emerald-700 px-2.5 py-1 rounded-xl text-[11px] font-black max-w-[200px] truncate">
                      หมวดหมู่: {filterCategory}
                      <button type="button" onClick={() => setFilterCategory('all')} className="text-emerald-500 hover:text-emerald-800 shrink-0"><X size={10} /></button>
                    </span>
                  )}
                </motion.div>
              )}

              {/* กรองเงื่อนไขเพิ่มเติมที่ซ่อน/แสดงได้ */}
              <motion.div
                initial={false}
                animate={{ 
                  height: showAdvancedFilters ? 'auto' : 0, 
                  opacity: showAdvancedFilters ? 1 : 0 
                }}
                transition={{ duration: 0.25, ease: "easeInOut" }}
                className="overflow-hidden"
              >
                <div className="pt-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pb-1">
                  {/* ดรอปดาวน์ สถานะดำเนินงาน */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] text-slate-400 font-extrabold uppercase tracking-widest pl-1">สถานะดำเนินการ</label>
                    <select
                      value={filterStatus}
                      onChange={(e) => setFilterStatus(e.target.value)}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 text-xs font-black text-slate-700 cursor-pointer focus:bg-white"
                    >
                      <option value="all">สถานะงานทั้งหมด</option>
                      <option value="pending">รอตรวจสอบ (Pending)</option>
                      <option value="received">รับเรื่องแล้ว (Received)</option>
                      <option value="in_progress">กำลังดำเนินการ (In Progress)</option>
                      <option value="resolved">ดำเนินการเสร็จสิ้น (Resolved)</option>
                      <option value="rejected">ไม่รับเรื่องร้องเรียน (Rejected)</option>
                    </select>
                  </div>

                  {/* ดรอปดาวน์ ระดับความเร่งด่วน */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] text-slate-400 font-extrabold uppercase tracking-widest pl-1">ระดับความรุนแรง</label>
                    <select
                      value={filterSeverity}
                      onChange={(e) => setFilterSeverity(e.target.value)}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 text-xs font-black text-slate-700 cursor-pointer focus:bg-white"
                    >
                      <option value="all">ความเร่งด่วนทั้งหมด</option>
                      <option value="low">ต่ำ (Low)</option>
                      <option value="medium">กลาง (Medium)</option>
                      <option value="high">สูง (High)</option>
                      <option value="critical">วิกฤต (Critical)</option>
                    </select>
                  </div>

                  {/* ดรอปดาวน์ หน่วยงานรับผิดชอบ */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] text-slate-400 font-extrabold uppercase tracking-widest pl-1">หน่วยงานรับผิดชอบ</label>
                    <select
                      value={filterDepartment}
                      onChange={(e) => setFilterDepartment(e.target.value)}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 text-xs font-black text-slate-700 cursor-pointer focus:bg-white"
                    >
                      <option value="all">หน่วยงานทั้งหมด</option>
                      {filterDepartments.map(dept => (
                        <option key={dept} value={dept}>{dept}</option>
                      ))}
                    </select>
                  </div>

                  {/* ดรอปดาวน์ หมวดหมู่ */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] text-slate-400 font-extrabold uppercase tracking-widest pl-1">หมวดหมู่ปัญหาร้องเรียน</label>
                    <select
                      value={filterCategory}
                      onChange={(e) => setFilterCategory(e.target.value)}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 text-xs font-black text-slate-700 cursor-pointer focus:bg-white"
                    >
                      <option value="all">หมวดหมู่ปัญหารวม</option>
                      {filterCategories.map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </motion.div>
            </div>

            {/* แสดงปริมาณการตรวจพบ */}
            <div className="mt-5 text-slate-400 text-xs font-semibold flex items-center justify-between border-t border-slate-100 pt-4">
              <span>
                คัดกรองพบ: <strong className="text-slate-800 font-extrabold text-sm">{filteredTableComplaints.length}</strong> จากยอดรวมความปลอดภัย <strong className="text-slate-600">{filteredComplaints.length}</strong> รายการ
              </span>
              <span>
                (เรียงตาม {sortField === 'createdAt' ? 'วันที่แจ้งเรื่อง' : sortField === 'trackingId' ? 'รหัสติดตาม ID' : sortField === 'title' ? 'หัวข้อ' : 'ข้อมูลหน่วยงาน'} {sortDirection === 'desc' ? 'จากล่าสุดไปเก่าสุด' : 'จากเก่าสุดไปล่าสุด'})
              </span>
            </div>
          </motion.div>

          {/* ตารางแสดงผลเรื่องร้องเรียน */}
          <motion.div 
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-white rounded-[32px] border border-slate-100 shadow-sm overflow-hidden"
          >
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse table-auto">
                <thead>
                  <tr className="bg-slate-50/70 border-b border-slate-100 text-[11px] font-black text-slate-400 uppercase tracking-widest select-none">
                    <th onClick={() => handleSort('trackingId')} className="px-6 py-4.5 cursor-pointer hover:bg-slate-100/70 transition-colors">
                      <div className="flex items-center gap-1.5">
                        <span>รหัสติดตาม</span>
                        <ArrowUpDown size={12} className={sortField === 'trackingId' ? 'text-emerald-600' : 'text-slate-300'} />
                      </div>
                    </th>
                    <th onClick={() => handleSort('title')} className="px-6 py-4.5 cursor-pointer hover:bg-slate-100/70 transition-colors min-w-[220px]">
                      <div className="flex items-center gap-1.5">
                        <span>หัวเรื่องข้อแนะนำ/ช่วยเหลือ</span>
                        <ArrowUpDown size={12} className={sortField === 'title' ? 'text-emerald-600' : 'text-slate-300'} />
                      </div>
                    </th>
                    <th className="px-6 py-4.5">ประวัติผู้ร้องแจ้ง</th>
                    <th onClick={() => handleSort('departmentName')} className="px-6 py-4.5 cursor-pointer hover:bg-slate-100/70 transition-colors">
                      <div className="flex items-center gap-1.5">
                        <span>เจ้าหน้าที่ของรัฐ</span>
                        <ArrowUpDown size={12} className={sortField === 'departmentName' ? 'text-emerald-600' : 'text-slate-300'} />
                      </div>
                    </th>
                    <th onClick={() => handleSort('createdAt')} className="px-6 py-4.5 cursor-pointer hover:bg-slate-100/70 transition-colors">
                      <div className="flex items-center gap-1.5">
                        <span>ผู้ส่งเมื่อวันที่</span>
                        <ArrowUpDown size={12} className={sortField === 'createdAt' ? 'text-emerald-600' : 'text-slate-300'} />
                      </div>
                    </th>
                    <th onClick={() => handleSort('severity')} className="px-6 py-4.5 cursor-pointer hover:bg-slate-100/70 transition-colors">
                      <div className="flex items-center gap-1.5">
                        <span>เร่งรัดภารกิจ</span>
                        <ArrowUpDown size={12} className={sortField === 'severity' ? 'text-emerald-600' : 'text-slate-300'} />
                      </div>
                    </th>
                    <th onClick={() => handleSort('status')} className="px-6 py-4.5 cursor-pointer hover:bg-slate-100/70 transition-colors">
                      <div className="flex items-center justify-center gap-1.5">
                        <span>สถานะปัจจุบัน</span>
                        <ArrowUpDown size={12} className={sortField === 'status' ? 'text-emerald-600' : 'text-slate-300'} />
                      </div>
                    </th>
                    <th className="px-6 py-4.5 text-center">ปฏิบัติการ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paginatedComplaints.map((c) => {
                    const sevColors: Record<string, string> = {
                      critical: 'bg-rose-50 text-rose-700 border border-rose-100',
                      high: 'bg-orange-50 text-orange-700 border border-orange-100',
                      medium: 'bg-yellow-50 text-yellow-700 border border-yellow-100',
                      low: 'bg-sky-50 text-sky-700 border border-sky-100'
                    };
                    const sevLabels: Record<string, string> = {
                      critical: 'วิกฤต',
                      high: 'สูง',
                      medium: 'กลาง',
                      low: 'ต่ำ'
                    };

                    const statusIconConfig: Record<string, { icon: any, color: string }> = {
                      pending: { icon: Clock, color: 'bg-slate-50 text-slate-600 border border-slate-200 shadow-sm' },
                      received: { icon: ClipboardList, color: 'bg-blue-50 text-blue-600 border border-blue-200 shadow-sm' },
                      in_progress: { icon: Activity, color: 'bg-indigo-50 text-indigo-600 border border-indigo-200 shadow-sm' },
                      resolved: { icon: CheckCircle2, color: 'bg-emerald-50 text-emerald-600 border border-emerald-200 shadow-sm' },
                      rejected: { icon: X, color: 'bg-rose-50 text-rose-600 border border-rose-200 shadow-sm' }
                    };

                    return (
                      <tr key={c.id} className="text-xs text-slate-600 font-semibold hover:bg-emerald-50/20 transition-colors group">
                        <td className="px-6 py-4 font-mono text-slate-505 select-all group-hover:text-emerald-600 font-black">{c.trackingId}</td>
                        <td className="px-6 py-4 max-w-[280px]">
                          <p className="font-bold text-slate-800 text-xs font-black truncate" title={c.title}>{c.title}</p>
                          <p className="text-[10px] text-slate-400 font-bold mt-0.5 truncate">{c.category} / {c.subCategory || 'ทั่วไป'}</p>
                        </td>
                        <td className="px-6 py-4">
                          <p className="font-black text-slate-800">{c.fullName || 'ไม่ระบุตัวตน'}</p>
                          <p className="text-[10px] text-slate-400 font-extrabold">{c.province || 'ไม่ระบุจังหวัด'}</p>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-xs text-slate-705 font-bold">{c.departmentName || 'ไม่มีเจ้าหน้าที่รับผิดชอบ'}</span>
                        </td>
                        <td className="px-6 py-4">
                          <p className="font-bold text-slate-500">{(() => {
                            try {
                              return format(new Date(c.createdAt), 'dd MMMM yyyy', { locale: th });
                            } catch (e) {
                              return 'ไม่ระบุ';
                            }
                          })()}</p>
                          <p className="text-[10px] text-slate-450 mt-0.5">{(() => {
                            try {
                              return format(new Date(c.createdAt), 'HH:mm น.', { locale: th });
                            } catch (e) {
                              return '';
                            }
                          })()}</p>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-widest ${sevColors[c.severity] || 'bg-slate-50 text-slate-500'}`}>
                            {sevLabels[c.severity] || c.severity}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex justify-center">
                            <div 
                              title={STATUS_LABELS[c.status] || c.status}
                              className={`w-6 h-6 rounded-lg flex items-center justify-center transition-all group-hover:rotate-6 group-hover:scale-110 ${statusIconConfig[c.status]?.color || 'bg-slate-50 text-slate-400 border border-slate-100'}`}
                            >
                              {(() => {
                                const Icon = statusIconConfig[c.status]?.icon || Tag;
                                return <Icon size={11} strokeWidth={2.5} />;
                              })()}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <button
                            type="button"
                            onClick={() => setSelectedComplaint(c)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 hover:bg-emerald-50 text-slate-600 hover:text-emerald-700 font-bold text-xs rounded-xl border border-slate-100 hover:border-emerald-200 transition-all shadow-sm"
                          >
                            <Eye size={13} />
                            <span>View</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}

                  {sortedComplaints.length === 0 && (
                    <tr>
                      <td colSpan={8} className="py-20 text-center text-slate-400 font-black uppercase tracking-[0.2em] text-xs">
                        ไม่มีเรื่องร้องเรียนตามคุณลักษณะที่ท่านเลือก
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Legend Section สำหรับสถานะ */}
            <div className="bg-slate-50/30 px-6 py-6 border-t border-slate-100">
              <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 px-1">คำอธิบายสัญลักษณ์สถานะ (Status Legend)</h4>
              <div className="flex flex-wrap gap-y-4 gap-x-6 lg:justify-between lg:gap-x-4">
                {[
                  { id: 'pending', label: 'รอตรวจสอบ', icon: Clock, color: 'bg-slate-50 text-slate-600 border border-slate-200 shadow-sm', desc: 'เรื่องอยูู่ในคิวรอเจ้าหน้าที่ตรวจสอบความถูกต้อง' },
                  { id: 'received', label: 'รับเรื่องแล้ว', icon: ClipboardList, color: 'bg-blue-50 text-blue-600 border border-blue-200 shadow-sm', desc: 'เจ้าหน้าที่รับเรื่องเข้าระบบเรียบร้อยแล้ว' },
                  { id: 'in_progress', label: 'กำลังดำเนินการ', icon: Activity, color: 'bg-indigo-50 text-indigo-600 border border-indigo-200 shadow-sm', desc: 'อยู่ระหว่างดำเนินการแก้ไขปัญหาตามขั้นตอน' },
                  { id: 'resolved', label: 'แก้ไขสำเร็จ', icon: CheckCircle2, color: 'bg-emerald-50 text-emerald-600 border border-emerald-200 shadow-sm', desc: 'ดำเนินการแก้ไขปัญหาเสร็จสิ้นและปิดเรื่องแล้ว' },
                  { id: 'rejected', label: 'ไม่รับเรื่อง/ยกเลิก', icon: X, color: 'bg-rose-50 text-rose-600 border border-rose-200 shadow-sm', desc: 'เรื่องไม่อยู่ในเงื่อนไขหรือถูกยกเลิกโดยผู้แจ้ง' },
                ].map((item) => (
                  <div key={item.id} className="flex items-start gap-2.5 max-w-[190px] xl:max-w-[210px]">
                    <div className={`w-7 h-7 shrink-0 rounded-lg flex items-center justify-center ${item.color}`}>
                      <item.icon size={13} strokeWidth={2.5} />
                    </div>
                    <div>
                      <p className="text-[10.5px] font-black text-slate-700 leading-none mb-1">{item.label}</p>
                      <p className="text-[8.5px] text-slate-400 font-bold leading-tight uppercase tracking-tight">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Pagination บาร์ */}
            {totalPages > 1 && (
              <div className="px-6 py-5 bg-slate-50/50 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4">
                <span className="text-xs font-bold text-slate-400">
                  แสดงลำดับที่ <strong className="text-slate-700">{startIndex + 1}</strong> ถึง <strong className="text-slate-705">{Math.min(startIndex + itemsPerPage, sortedComplaints.length)}</strong> จากทั้งหมด <strong className="text-slate-700">{sortedComplaints.length}</strong> รายการ
                </span>
                <div className="flex items-center gap-1 select-none">
                  <button
                    type="button"
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(c => Math.max(c - 1, 1))}
                    className="p-2 bg-white text-slate-500 rounded-xl hover:text-emerald-600 border border-slate-200 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-slate-500 transition-all font-semibold"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  
                  {Array.from({ length: totalPages }).map((_, idx) => {
                    const pageNo = idx + 1;
                    if (totalPages > 6 && Math.abs(currentPage - pageNo) > 2 && pageNo !== 1 && pageNo !== totalPages) {
                      if (pageNo === 2 || pageNo === totalPages - 1) {
                         return <span key={pageNo} className="px-1.5 text-xs text-slate-400 font-black">...</span>;
                      }
                      return null;
                    }
                    return (
                      <button
                        key={pageNo}
                        onClick={() => setCurrentPage(pageNo)}
                        className={`w-9 h-9 rounded-xl text-xs font-black transition-all ${
                          currentPage === pageNo 
                            ? 'bg-emerald-600 text-white shadow-md shadow-emerald-100' 
                            : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200'
                        }`}
                      >
                        {pageNo}
                      </button>
                    );
                  })}

                  <button
                    type="button"
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage(c => Math.min(c + 1, totalPages))}
                    className="p-2 bg-white text-slate-500 rounded-xl hover:text-emerald-600 border border-slate-200 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-slate-500 transition-all font-semibold"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        </div>
      )}

      {/* รายละเอียดเรื่องร้องเรียน Modal ป๊อปอัพ */}
      {selectedComplaint && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="bg-white rounded-[32px] border border-slate-100 shadow-2xl w-full max-w-4xl max-h-[85vh] overflow-y-auto p-8 relative flex flex-col"
          >
            {/* ปุ่มปิด Modal */}
            <button
              onClick={() => setSelectedComplaint(null)}
              className="absolute right-6 top-6 w-10 h-10 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors z-10"
            >
              <X size={24} />
            </button>

            <div className="flex flex-wrap items-center gap-3 mb-2">
              <span className="text-[10px] font-black tracking-widest text-emerald-700 bg-emerald-50 border border-emerald-100 px-3.5 py-1.5 rounded-xl">
                รหัสร้องเรียน: {selectedComplaint.trackingId}
              </span>
              <span className={`px-3 py-1.5 rounded-xl text-[10px] font-extrabold uppercase tracking-widest ${
                selectedComplaint.severity === 'critical' ? 'bg-red-50 text-red-650 border border-red-100' : 
                selectedComplaint.severity === 'high' ? 'bg-orange-50 text-orange-655 border border-orange-100' : 
                selectedComplaint.severity === 'medium' ? 'bg-amber-50 text-amber-700 border border-amber-100' : 
                'bg-blue-50 text-blue-700 border border-blue-100'
              }`}>
                ความเร่งด่วน: {
                  selectedComplaint.severity === 'critical' ? 'วิกฤต' :
                  selectedComplaint.severity === 'high' ? 'สูง' :
                  selectedComplaint.severity === 'medium' ? 'กลาง' : 'ต่ำ'
                }
              </span>
            </div>

            <h2 className="text-xl md:text-2xl font-black text-slate-800 max-w-[90%] mb-6">{selectedComplaint.title}</h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-left">
              {/* ข้อมูลพื้นฐานผู้ร้อง */}
              <div className="md:col-span-1 bg-slate-50/70 rounded-[24px] p-6 border border-slate-100 space-y-4">
                <h4 className="text-sm font-black text-slate-700 pb-2 border-b border-slate-200/65 flex items-center gap-2">
                  <User size={16} className="text-emerald-600" />
                  <span>ข้อมูลทั่วไปผู้แจ้งเรื่อง</span>
                </h4>
                <div className="space-y-4">
                  <div className="space-y-0.5">
                    <p className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider">ชื่อผู้ส่งคำร้อง</p>
                    <p className="text-sm font-bold text-slate-800">{selectedComplaint.fullName || 'ไม่ประบุตัวตน'}</p>
                  </div>
                  {selectedComplaint.phone && (
                    <div className="space-y-0.5">
                      <p className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider">เบอร์โทรศัพท์ติดต่อ</p>
                      <p className="text-sm font-semibold text-slate-700">{selectedComplaint.phone}</p>
                    </div>
                  )}
                  {selectedComplaint.email && (
                    <div className="space-y-0.5">
                      <p className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider">อีเมลส่งแจ้ง</p>
                      <p className="text-sm font-semibold text-slate-700 truncate" title={selectedComplaint.email}>{selectedComplaint.email}</p>
                    </div>
                  )}
                  {selectedComplaint.occupation && (
                    <div className="space-y-0.5">
                      <p className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider">อาชีพผู้ร้อง</p>
                      <p className="text-sm font-semibold text-slate-700">{selectedComplaint.occupation}</p>
                    </div>
                  )}
                  {selectedComplaint.createdAt && (
                    <div className="space-y-0.5">
                      <p className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider">วันและเวลาที่แจ้งเรื่อง</p>
                      <p className="text-sm font-semibold text-slate-700">{(() => {
                        try {
                          return format(new Date(selectedComplaint.createdAt), 'dd MMMM yyyy HH:mm น.', { locale: th });
                        } catch (e) {
                          return 'ไม่ระบุ';
                        }
                      })()}</p>
                    </div>
                  )}
                  {selectedComplaint.channel && (
                    <div className="space-y-0.5">
                      <p className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider">ช่องทางการร้องเรียน</p>
                      <p className="text-xs font-black uppercase text-emerald-700 bg-emerald-50/50 py-1 px-2.5 rounded-lg inline-block border border-emerald-100">{selectedComplaint.channel}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* รายละเอียดปัญหา */}
              <div className="md:col-span-2 space-y-6">
                {/* รายละเอียดและเนื้อหาคำร้อง */}
                <div className="space-y-3">
                  <h4 className="text-sm font-black text-slate-800 flex items-center gap-2">
                    <FileText size={16} className="text-emerald-600" />
                    <span>คำอธิบายรายละเอียดข้อแนะนำ / เรื่องราวร้องเรียน</span>
                  </h4>
                  <div className="p-5 bg-slate-50/40 rounded-2xl border border-slate-100 text-slate-700 text-sm leading-relaxed whitespace-pre-wrap font-medium">
                    {selectedComplaint.details || 'ไม่มีข้อความอธิบายเพิ่มเติม'}
                  </div>
                </div>

                {/* ความต้องการความช่วยเหลือ */}
                {selectedComplaint.desiredAction && (
                  <div className="space-y-2">
                    <p className="text-[10px] text-slate-400 font-extrabold uppercase tracking-widest pl-1">สิ่งที่ต้องการให้ดำเนินการแก้ไข</p>
                    <p className="text-sm font-semibold text-slate-800 bg-emerald-50/35 border border-emerald-100/50 rounded-xl p-4">{selectedComplaint.desiredAction}</p>
                  </div>
                )}

                {/* พื้นที่เกิดเรื่อง/สถานที่ */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="bg-slate-50 border border-slate-100 p-4 rounded-xl space-y-1.5 flex items-start gap-3">
                    <MapPin size={18} className="text-slate-450 mt-1 flex-shrink-0" />
                    <div className="space-y-0.5 text-xs">
                      <p className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider">พิกัดและรายละเอียดสถานที่</p>
                      <p className="font-bold text-slate-700">{selectedComplaint.incidentLocation || 'ไม่ระบุสถานที่เกิดเหตุ'}</p>
                      <p className="text-[10px] text-slate-500 font-medium">ต.{selectedComplaint.subDistrict || '-'} อ.{selectedComplaint.district || '-'} จ.{selectedComplaint.province || '-'}</p>
                    </div>
                  </div>

                  {/* ข้อมูลด้านการเกษตรและพื้นที่เสียหาย */}
                  {(selectedComplaint.cropType || selectedComplaint.damagedAreaRai !== undefined) && (
                    <div className="bg-emerald-50/30 border border-emerald-100/30 p-4 rounded-xl space-y-1.5 flex items-start gap-3">
                      <div className="w-8 h-8 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 mt-0.5 flex-shrink-0">
                        <Tag size={16} />
                      </div>
                      <div className="space-y-0.5 text-xs text-slate-700">
                        <p className="text-[10px] text-emerald-800 font-extrabold uppercase tracking-wider">บริบทพื้นที่เกษตร / พื้นที่เสียหาย</p>
                        {selectedComplaint.cropType && <p className="font-bold text-slate-850">พืช/เกษตรที่ปลูก: <span className="font-black text-emerald-800">{selectedComplaint.cropType}</span></p>}
                        {selectedComplaint.damagedAreaRai !== undefined && (
                          <p className="font-semibold">พื้นที่เสียหาย: {selectedComplaint.damagedAreaRai || 0} ไร่ {selectedComplaint.damagedAreaNgan || 0} งาน</p>
                        )}
                        {selectedComplaint.damageValue !== undefined && selectedComplaint.damageValue > 0 && (
                          <p className="font-semibold text-rose-600">มูลค่าเสียหายประเมิน: {selectedComplaint.damageValue.toLocaleString()} บาท</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* เจ้าหน้าที่รับผิดชอบ */}
                <div className="border-t border-slate-100 pt-5 flex items-center justify-between">
                  <div className="space-y-1 text-left">
                    <p className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider pl-0.5">ผู้ประสานงาน/ส่วนปฏิบัติการ</p>
                    <p className="text-xs font-black text-slate-800">{selectedComplaint.departmentName || 'ไม่มีข้อมูลหน่วยงานรับงาน'}</p>
                  </div>
                  <div>
                    <span className={`px-4 py-2 rounded-xl text-xs font-black capitalize ${
                      selectedComplaint.status === 'resolved' ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' : 
                      selectedComplaint.status === 'received' ? 'bg-blue-100 text-blue-800 border border-blue-200' :
                      selectedComplaint.status === 'in_progress' ? 'bg-indigo-100 text-indigo-800 border border-indigo-200' :
                      'bg-slate-100 text-slate-705'
                    }`}>
                      {
                        selectedComplaint.status === 'pending' ? 'รอตรวจสอบ' :
                        selectedComplaint.status === 'received' ? 'รับเรื่องแล้ว' :
                        selectedComplaint.status === 'in_progress' ? 'กำลังดำเนินการ' :
                        selectedComplaint.status === 'resolved' ? 'แก้ไขเสร็จสิ้น' : 'ไม่รับเรื่องร้องสั่ง/ยกเลิก'
                      }
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* ปุ่มปิดด้านล่าง */}
            <div className="mt-8 pt-6 border-t border-slate-100 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedComplaint(null)}
                className="px-6 py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl font-black text-sm transition-colors"
              >
                ปิดหน้าต่างรายละเอียด
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </motion.div>
  );
}

function StatCard({ title, value, icon: Icon, color, delay }: any) {
  const colors: Record<string, string> = {
    emerald: 'bg-emerald-50 text-emerald-600 border-emerald-100',
    blue: 'bg-blue-50 text-blue-600 border-blue-100',
    amber: 'bg-amber-50 text-amber-600 border-amber-100',
    red: 'bg-red-50 text-red-600 border-red-100',
    slate: 'bg-slate-50 text-slate-600 border-slate-100',
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      whileHover={{ y: -5 }}
      className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100 hover:shadow-xl hover:shadow-slate-200 transition-all group flex items-center justify-between relative overflow-hidden"
    >
      <div className={`w-14 h-14 flex items-center justify-center rounded-2xl border ${colors[color] || colors.slate} transition-transform group-hover:scale-110 group-hover:rotate-6`}>
        <Icon size={28} />
      </div>
      <div className="text-right">
        <div className="text-4xl font-black text-slate-900 leading-none tracking-tighter mb-2">{value.toLocaleString()}</div>
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] leading-none">{title}</p>
      </div>
    </motion.div>
  );
}
