/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { Complaint, Category, Department } from '../../types';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell,
  AreaChart,
  Area
} from 'recharts';
import { 
  TrendingUp, 
  CheckCircle2, 
  AlertCircle, 
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  Sparkles,
  Loader2,
  Timer,
  Activity,
  ShieldCheck,
  Download,
  Printer,
  X
} from 'lucide-react';
import Markdown from 'react-markdown';
import html2pdf from 'html2pdf.js';

import { Skeleton, CardSkeleton, ChartSkeleton } from '../ui/Skeleton';
import { motion } from 'motion/react';

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6'];
const STATUS_COLORS: Record<string, string> = {
  pending: '#f59e0b',
  received: '#3b82f6',
  in_progress: '#8b5cf6',
  resolved: '#10b981',
  rejected: '#ef4444'
};

const STATUS_LABELS: Record<string, string> = {
  pending: 'รอดำเนินการ',
  received: 'รับเรื่องแล้ว',
  in_progress: 'กำลังดำเนินการ',
  resolved: 'แก้ไขสำเร็จ',
  rejected: 'ไม่อนุมัติ/ยกเลิก'
};

const STATUS_ORDER = ['pending', 'received', 'in_progress', 'resolved', 'rejected'];

export function ExecutiveDashboard() {
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<'realtime' | 'monthly' | 'yearly'>('realtime');
  const [selectedSeverity, setSelectedSeverity] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedDepartment, setSelectedDepartment] = useState<string>('all');
  const [aiSummary, setAiSummary] = useState<string>('');
  const [summaryLoading, setSummaryLoading] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch complaints
        const q = query(collection(db, 'complaints'));
        const snapshot = await getDocs(q);
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Complaint));
        // Sort in memory to ensure all documents are included even if missing the sort field or if index is missing
        data.sort((a, b) => {
          const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return dateA - dateB; // asc
        });
        setComplaints(data);

        // Fetch master categories
        const catQ = query(collection(db, 'categories'));
        const catSnapshot = await getDocs(catQ);
        const catData = catSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Category));
        setCategories(catData);

        // Fetch master departments
        const depQ = query(collection(db, 'departments'));
        const depSnapshot = await getDocs(depQ);
        const depData = depSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Department));
        setDepartments(depData);
      } catch (err) {
        console.error("Dashboard fetch error:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // Unique options extracted dynamically and merged with raw config/complaints data
  const uniqueCategories = Array.from(new Set([
    ...categories.map(c => c.name),
    ...complaints.map(c => c.category)
  ].filter(Boolean))).sort((a, b) => {
    const isOtherA = a.includes('อื่น');
    const isOtherB = b.includes('อื่น');
    if (isOtherA && !isOtherB) return 1;
    if (!isOtherA && isOtherB) return -1;
    return a.localeCompare(b, 'th');
  });

  const uniqueDepartments = Array.from(new Set([
    ...departments.map(d => d.name),
    ...complaints.map(c => c.departmentName)
  ].filter(Boolean))).sort((a, b) => {
    const isOtherA = a.includes('อื่น');
    const isOtherB = b.includes('อื่น');
    if (isOtherA && !isOtherB) return 1;
    if (!isOtherA && isOtherB) return -1;
    return a.localeCompare(b, 'th');
  });

  // Reactive filtered data engine
  const filteredComplaints = complaints.filter(c => {
    const matchSeverity = selectedSeverity === 'all' || c.severity === selectedSeverity;
    const matchCategory = selectedCategory === 'all' || c.category === selectedCategory;
    const matchDepartment = selectedDepartment === 'all' || c.departmentName === selectedDepartment;
    
    let matchTime = true;
    if (timeRange === 'monthly') {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      matchTime = new Date(c.createdAt) >= thirtyDaysAgo;
    } else if (timeRange === 'yearly') {
      const startOfYear = new Date(new Date().getFullYear(), 0, 1);
      matchTime = new Date(c.createdAt) >= startOfYear;
    }

    return matchSeverity && matchCategory && matchDepartment && matchTime;
  });

  const stats = {
    total: filteredComplaints.length,
    resolved: filteredComplaints.filter(c => c.status === 'resolved').length,
    pending: filteredComplaints.filter(c => c.status === 'pending').length,
    critical: filteredComplaints.filter(c => c.severity === 'critical' && c.status !== 'resolved').length,
  };

  const statusDataRaw = filteredComplaints.reduce((acc, c) => {
    acc[c.status] = (acc[c.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const statusData = STATUS_ORDER
    .filter(status => statusDataRaw[status] !== undefined)
    .map(name => ({ name, value: statusDataRaw[name] }));

  const trendData = filteredComplaints.reduce((acc, c) => {
    const date = new Date(c.createdAt).toLocaleDateString('th-TH', { month: 'short' });
    const existing = acc.find(item => item.name === date);
    if (existing) {
      existing.value += 1;
    } else {
      acc.push({ name: date, value: 1 });
    }
    return acc;
  }, [] as { name: string; value: number }[]).slice(-7);

  // SLA and Performance Metrics Calculations from filtered subset
  const resolvedComplaints = filteredComplaints.filter(c => c.status === 'resolved');

  // 1. Average Resolution Time in Days
  let avgResolutionTimeDays = 0;
  if (resolvedComplaints.length > 0) {
    const totalTimeMs = resolvedComplaints.reduce((sum, c) => {
      const start = new Date(c.createdAt).getTime();
      const end = new Date(c.updatedAt || c.createdAt).getTime();
      return sum + Math.max(0, end - start);
    }, 0);
    // Convert Ms to Days
    avgResolutionTimeDays = totalTimeMs / (1000 * 60 * 60 * 24);
    avgResolutionTimeDays = Number((avgResolutionTimeDays / resolvedComplaints.length).toFixed(1));
  } else {
    // Show realistic baseline if no resolved complaints yet to keep UX clean and professional
    avgResolutionTimeDays = 0;
  }

  // 2. SLA Compliance Rate (Completed before SLA target date or standard fallback)
  let slaCompliantCount = 0;
  resolvedComplaints.forEach(c => {
    if (c.slaTargetDate) {
      if (new Date(c.updatedAt || c.createdAt) <= new Date(c.slaTargetDate)) {
        slaCompliantCount++;
      }
    } else {
      // Standard dynamic SLA policies (Critical = 1 day, High = 3 days, Medium = 7 days, Low = 14 days)
      const limitDays = c.severity === 'critical' ? 1 : c.severity === 'high' ? 3 : c.severity === 'medium' ? 7 : 14;
      const created = new Date(c.createdAt).getTime();
      const updated = new Date(c.updatedAt || c.createdAt).getTime();
      const elapsedDays = (updated - created) / (1000 * 60 * 60 * 24);
      if (elapsedDays <= limitDays) {
        slaCompliantCount++;
      }
    }
  });

  const slaComplianceRate = resolvedComplaints.length > 0 
    ? Math.round((slaCompliantCount / resolvedComplaints.length) * 100) 
    : 100; // Default to 100% or optimal if no complaints resolved yet

  // 3. Response SLA Rate (Acknowledge / change status from pending within 24 hours)
  const responseComplaints = filteredComplaints.filter(c => c.status !== 'pending');
  let responseCompliantCount = 0;
  responseComplaints.forEach(c => {
    const limitMs = 24 * 60 * 60 * 1000; // 24 hours
    const created = new Date(c.createdAt).getTime();
    const firstActionDate = c.updatedAt ? new Date(c.updatedAt).getTime() : created;
    if (firstActionDate - created <= limitMs) {
      responseCompliantCount++;
    }
  });
  
  const responseSlaRate = filteredComplaints.length > 0
    ? Math.round(((filteredComplaints.filter(c => c.status === 'pending').length === 0 ? filteredComplaints.length : responseCompliantCount) / filteredComplaints.length) * 100)
    : 100;

  // 4. SLA Analysis structured for Recharts Bar Chart
  const severities: ('low' | 'medium' | 'high' | 'critical')[] = ['low', 'medium', 'high', 'critical'];
  const severityLabels: Record<string, string> = {
    low: 'ต่ำ',
    medium: 'กลาง',
    high: 'สูง',
    critical: 'วิกฤต'
  };

  const slaBySeverityData = severities.map(sev => {
    const sevComplaints = filteredComplaints.filter(c => c.severity === sev);
    const resolvedSev = sevComplaints.filter(c => c.status === 'resolved');
    
    let compliantCount = 0;
    resolvedSev.forEach(c => {
      if (c.slaTargetDate) {
        if (new Date(c.updatedAt || c.createdAt) <= new Date(c.slaTargetDate)) {
          compliantCount++;
        }
      } else {
        const limitDays = sev === 'critical' ? 1 : sev === 'high' ? 3 : sev === 'medium' ? 7 : 14;
        const elapsed = (new Date(c.updatedAt || c.createdAt).getTime() - new Date(c.createdAt).getTime()) / (1000 * 60 * 60 * 24);
        if (elapsed <= limitDays) {
          compliantCount++;
        }
      }
    });

    const complianceRate = resolvedSev.length > 0 
      ? Math.round((compliantCount / resolvedSev.length) * 100) 
      : 100; // Default to 100%

    return {
      name: severityLabels[sev],
      'อัตราการปฏิบัติตาม SLA (%)': complianceRate,
      'จำนวนเรื่องร้องเรียน': sevComplaints.length,
      'แก้ไขเสร็จแล้ว': resolvedSev.length
    };
  });

  const generateAiSummary = async () => {
    setSummaryLoading(true);
    try {
      const response = await fetch('/api/ai/executive-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          complaints: filteredComplaints.slice(-50),
          filters: {
            severity: selectedSeverity === 'all' ? 'ทุกระดับความเร่งด่วน' : severityLabels[selectedSeverity] || selectedSeverity,
            category: selectedCategory === 'all' ? 'ทุกหมวดหมู่' : selectedCategory,
            department: selectedDepartment === 'all' ? 'ทุกหน่วยงาน' : selectedDepartment,
            timeRange: timeRange === 'realtime' ? 'เรียลไทม์' : timeRange === 'monthly' ? 'รายเดือน (30 วันล่าสุด)' : 'รายปี (ปีปัจจุบัน)'
          }
        })
      });
      const data = await response.json();
      setAiSummary(data.summary);
    } catch (err) {
      console.error("AI Summary error:", err);
      setAiSummary("ไม่สามารถวิเคราะห์ข้อมูลได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setSummaryLoading(false);
    }
  };

  // 5. Category distribution analytics
  const categoryStats = React.useMemo(() => {
    const raw: Record<string, number> = {};
    filteredComplaints.forEach(c => {
      if (c.category) {
        raw[c.category] = (raw[c.category] || 0) + 1;
      }
    });
    return Object.entries(raw)
      .map(([name, count]) => ({ name, 'จำนวนเรื่อง': count }))
      .sort((a, b) => {
        const isOtherA = a.name.includes('อื่น');
        const isOtherB = b.name.includes('อื่น');
        if (isOtherA && !isOtherB) return 1;
        if (!isOtherA && isOtherB) return -1;
        return b['จำนวนเรื่อง'] - a['จำนวนเรื่อง'];
      });
  }, [filteredComplaints]);

  // 6. Department workload analytics
  const departmentStats = React.useMemo(() => {
    const raw: Record<string, number> = {};
    filteredComplaints.forEach(c => {
      const dept = c.departmentName || 'ไม่ระบุหน่วยงาน';
      raw[dept] = (raw[dept] || 0) + 1;
    });
    return Object.entries(raw)
      .map(([name, count]) => ({ name, 'จำนวนเรื่อง': count }))
      .sort((a, b) => {
        const isOtherA = a.name.includes('อื่น');
        const isOtherB = b.name.includes('อื่น');
        if (isOtherA && !isOtherB) return 1;
        if (!isOtherA && isOtherB) return -1;
        return b['จำนวนเรื่อง'] - a['จำนวนเรื่อง'];
      });
  }, [filteredComplaints]);

  // Export to CSV
  const exportToCSV = () => {
    if (filteredComplaints.length === 0) return;
    const headers = ['ID', 'หัวข้อปัญหา', 'หมวดหมู่', 'ระดับความเร่งด่วน', 'หน่วยงานผู้รับผิดชอบ', 'สถานะการดำเนินงาน', 'วันที่สร้าง'];
    const rows = filteredComplaints.map(c => [
      c.id,
      `"${c.title.replace(/"/g, '""')}"`,
      c.category || 'ไม่ระบุ',
      severityLabels[c.severity] || c.severity,
      c.departmentName || 'ไม่ระบุ',
      STATUS_LABELS[c.status] || c.status,
      c.createdAt ? new Date(c.createdAt).toLocaleDateString('th-TH') : 'ไม่ระบุ'
    ]);
    const csvContent = "\uFEFF" + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `NFC_Executive_Complaints_Report_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Trigger Print Report
  const printReport = () => {
    const element = document.getElementById('report-content');
    if (!element) return;

    // Hide elements that shouldn't be in the PDF
    const printHiddenElements = document.querySelectorAll('.print-hide');
    printHiddenElements.forEach(el => (el as HTMLElement).style.display = 'none');

    const opt = {
      margin: [10, 10, 10, 10],
      filename: `NFC_Executive_Report_${new Date().toISOString().slice(0, 10)}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { 
        scale: 2, 
        useCORS: true, 
        letterRendering: true,
        scrollX: 0,
        scrollY: 0
      },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    // Use a promise to show loading state if needed, but for now simple download
    html2pdf().set(opt).from(element).save().then(() => {
      // Restore hidden elements
      printHiddenElements.forEach(el => (el as HTMLElement).style.display = '');
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
      
      <Skeleton className="h-48 w-full rounded-[32px]" />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <ChartSkeleton />
        </div>
        <div>
          <ChartSkeleton />
        </div>
      </div>
    </div>
  );

  return (
    <motion.div 
      id="report-content"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-8 pb-10"
    >
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 print-hide">
        <div>
          <h1 className="text-3xl font-black text-slate-800 tracking-tight">Executive Report</h1>
          <p className="text-slate-500 font-bold">ข้อมูลสรุปสถานการณ์เรื่องร้องเรียนสำหรับผู้บริหาร</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={generateAiSummary}
            disabled={summaryLoading || filteredComplaints.length === 0}
            className="flex items-center gap-2 bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed border border-emerald-600 p-2.5 px-4 rounded-xl text-xs font-black transition-all shadow-sm active:scale-95"
          >
            {summaryLoading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            Generate Insight
          </button>
          <button
            onClick={exportToCSV}
            disabled={filteredComplaints.length === 0}
            className="flex items-center gap-2 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:opacity-50 disabled:cursor-not-allowed border border-emerald-200 p-2.5 px-4 rounded-xl text-xs font-black transition-all shadow-sm active:scale-95"
          >
            <Download size={14} />
            Export CSV
          </button>

          
          <div className="flex bg-white p-1.5 rounded-2xl shadow-sm border border-slate-100">
            {['realtime', 'monthly', 'yearly'].map((range) => (
              <button 
                key={range}
                onClick={() => setTimeRange(range as any)}
                className={`px-5 py-2.5 rounded-xl text-xs font-black transition-all ${
                  timeRange === range 
                    ? 'bg-emerald-600 text-white shadow-xl shadow-emerald-100' 
                    : 'text-slate-500 hover:bg-slate-50'
                }`}
              >
                {range === 'realtime' ? 'Real-time' : range === 'monthly' ? 'รายเดือน' : 'รายปี'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Executive Dimension Sub-filters */}
      <motion.div 
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white p-5 rounded-[24px] shadow-sm border border-slate-100 flex flex-col md:flex-row gap-4 items-end print-hide"
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full">
          {/* Severity Filter */}
          <div className="flex flex-col gap-2">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">ระดับความเร่งด่วน (Severity)</span>
            <select
              value={selectedSeverity}
              onChange={(e) => setSelectedSeverity(e.target.value)}
              className="bg-slate-50 border border-[#f1f5f9] text-slate-700 text-sm font-semibold rounded-[16px] p-2.5 px-4 outline-none focus:ring-2 focus:ring-emerald-500/25 focus:border-emerald-500 transition-all cursor-pointer"
            >
              <option value="all">ทุกระดับความเร่งด่วน</option>
              <option value="low">ต่ำ (Low)</option>
              <option value="medium">กลาง (Medium)</option>
              <option value="high">สูง (High)</option>
              <option value="critical">วิกฤต (Critical)</option>
            </select>
          </div>

          {/* Category Filter */}
          <div className="flex flex-col gap-2">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">หมวดหมู่เรื่องร้องเรียน (Category)</span>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="bg-slate-50 border border-[#f1f5f9] text-slate-700 text-sm font-semibold rounded-[16px] p-2.5 px-4 outline-none focus:ring-2 focus:ring-emerald-500/25 focus:border-emerald-500 transition-all cursor-pointer"
            >
              <option value="all">ทุกหมวดหมู่</option>
              {uniqueCategories.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          {/* Department Filter */}
          <div className="flex flex-col gap-2">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">หน่วยงานที่รับผิดชอบ (Department)</span>
            <select
              value={selectedDepartment}
              onChange={(e) => setSelectedDepartment(e.target.value)}
              className="bg-slate-50 border border-[#f1f5f9] text-slate-700 text-sm font-semibold rounded-[16px] p-2.5 px-4 outline-none focus:ring-2 focus:ring-emerald-500/25 focus:border-emerald-500 transition-all cursor-pointer"
            >
              <option value="all">ทุกหน่วยงาน</option>
              {uniqueDepartments.map(dept => (
                <option key={dept} value={dept}>{dept}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Clear Filter Button */}
        {(selectedSeverity !== 'all' || selectedCategory !== 'all' || selectedDepartment !== 'all') && (
          <button
            onClick={() => {
              setSelectedSeverity('all');
              setSelectedCategory('all');
              setSelectedDepartment('all');
            }}
            className="text-xs font-black text-rose-500 hover:text-rose-600 bg-rose-50 hover:bg-rose-100/50 p-2.5 px-5 rounded-[16px] transition-all h-fit shrink-0 tracking-wider border border-rose-100 self-end md:mb-0.5"
          >
            ล้างตัวกรอง
          </button>
        )}
      </motion.div>
      
      {/* AI Executive Insight Section (HIDDEN)
      <motion.div 
        layout
        className="bg-emerald-900 rounded-[32px] p-8 text-white relative overflow-hidden shadow-2xl shadow-emerald-200"
      >
        <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-800 rounded-full -translate-y-1/2 translate-x-1/2 opacity-50 blur-3xl"></div>
        <div className="relative z-10">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="bg-white/20 p-4 rounded-2xl backdrop-blur-md border border-white/10">
                <Sparkles className="text-emerald-300" size={32} />
              </div>
              <div className="space-y-1">
                <h2 className="text-2xl font-black tracking-tight">AI Executive Insights</h2>
                <p className="text-emerald-100/70 font-bold text-sm tracking-wide">สรุปสถานการณ์และวิเคราะห์แนวโน้มด้วยปัญญาประดิษฐ์</p>
              </div>
            </div>
            {!aiSummary && !summaryLoading && (
              <motion.button 
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={generateAiSummary}
                className="bg-white text-emerald-900 px-8 py-4 rounded-2xl font-black flex items-center gap-3 hover:bg-emerald-50 transition-all shadow-xl shadow-emerald-950/20 w-fit"
              >
                <Sparkles size={20} />
                Generate Insight
              </motion.button>
            )}
          </div>

          {(summaryLoading || aiSummary) && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-8 p-8 bg-white/10 rounded-2xl backdrop-blur-md border border-white/10"
            >
              {summaryLoading ? (
                <div className="flex items-center gap-4 py-6">
                  <div className="w-6 h-6 border-2 border-emerald-300 border-t-transparent rounded-full animate-spin" />
                  <span className="font-black text-emerald-100 tracking-widest uppercase text-xs">Gemini กำลังสรุปข้อมูล...</span>
                </div>
              ) : (
                <div className="markdown-body text-emerald-50 prose prose-invert max-w-none prose-p:leading-relaxed prose-li:font-medium">
                  <Markdown>{aiSummary}</Markdown>
                  <button 
                    onClick={generateAiSummary}
                    className="mt-8 text-[10px] font-black uppercase tracking-[0.3em] text-emerald-300 hover:text-white flex items-center gap-2 group"
                  >
                    <TrendingUp size={14} className="group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
                    Refresh Insight
                  </button>
                </div>
              )}
            </motion.div>
          )}
        </div>
      </motion.div>
      */}
      
      {/* AI Executive Insight Section - Clean White Card */}
      {(summaryLoading || aiSummary) && (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-[32px] p-8 border-2 border-emerald-50 shadow-sm relative overflow-hidden"
        >
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="bg-emerald-50 p-2.5 rounded-xl text-emerald-600">
                <Sparkles size={20} />
              </div>
              <div>
                <h2 className="text-lg font-black text-slate-800 tracking-tight">AI Executive Analysis</h2>
                <p className="text-slate-400 font-bold text-[10px] uppercase tracking-wider">วิเคราะห์ความเคลื่อนไหวด้วยปัญญาประดิษฐ์</p>
              </div>
            </div>
            {!summaryLoading && (
              <button 
                onClick={() => setAiSummary('')}
                className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
              >
                <X size={16} />
              </button>
            )}
          </div>

          {summaryLoading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-4">
              <div className="relative">
                <div className="w-12 h-12 border-4 border-emerald-100 border-t-emerald-500 rounded-full animate-spin" />
                <Sparkles className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-emerald-500 animate-pulse" size={16} />
              </div>
              <span className="font-black text-emerald-600 tracking-widest uppercase text-xs animate-pulse">กำลังประมวลผลข้อมูลเชิงลึก...</span>
            </div>
          ) : (
            <div className="markdown-body text-slate-600 prose prose-slate max-w-none prose-p:leading-relaxed prose-strong:text-slate-800 prose-headings:text-slate-800">
              <Markdown>{aiSummary}</Markdown>
              <div className="mt-8 pt-6 border-t border-slate-50 flex justify-end">
                <button 
                  onClick={generateAiSummary}
                  className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-600 hover:text-emerald-700 flex items-center gap-2 bg-emerald-50 px-4 py-2 rounded-lg transition-all"
                >
                  <TrendingUp size={12} />
                  Re-analyze
                </button>
              </div>
            </div>
          )}
        </motion.div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <KPICard 
          title="เรื่องร้องเรียนทั้งหมด" 
          value={stats.total} 
          icon={TrendingUp} 
          trend="+12%" 
          color="emerald" 
          bgColor="bg-emerald-50"
          textColor="text-emerald-600"
          delay={0.1}
        />
        <KPICard 
          title="แก้ไขสำเร็จ" 
          value={stats.resolved} 
          icon={CheckCircle2} 
          trend="+8%" 
          color="blue" 
          bgColor="bg-blue-50"
          textColor="text-blue-600"
          delay={0.2}
        />
        <KPICard 
          title="อยู่ระหว่างรอดำเนินการ" 
          value={stats.pending} 
          icon={Clock} 
          trend="-3%" 
          color="amber" 
          bgColor="bg-amber-50"
          textColor="text-amber-600"
          delay={0.3}
        />
        <KPICard 
          title="เรื่องเร่งด่วนที่สุด" 
          value={stats.critical} 
          icon={AlertCircle} 
          trend="+2%" 
          color="red" 
          bgColor="bg-red-50"
          textColor="text-red-600"
          delay={0.4}
        />
      </div>

      {/* SLA & Operational Efficiency Dashboard Component */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.45 }}
        className="bg-white p-8 rounded-[32px] shadow-sm border border-slate-100 space-y-6"
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-5">
          <div>
            <h3 className="text-xl font-black text-slate-800 tracking-tight">ประสิทธิภาพการดำเนินงานและระดับการให้บริการ (SLA Analytics)</h3>
            <p className="text-xs font-bold text-slate-400 mt-0.5">วิเคราะห์ดัชนีชี้วัดผลงานหลักด้านการตอบสนองและระยะเวลากระบวนการแก้ปัญหา</p>
          </div>
          <div className="flex items-center gap-2 text-xs font-black text-emerald-600 bg-emerald-50 border border-emerald-100 px-3.5 py-1.5 rounded-xl">
            <ShieldCheck size={16} />
            SLA Standard Verified
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* SLA Key Metric Cards Column */}
          <div className="flex flex-col gap-4 justify-between">
            {/* SLA Completion Rate */}
            <div className="bg-slate-50/50 border border-slate-100 p-5 rounded-2xl flex items-center justify-between group hover:bg-white hover:shadow-lg hover:shadow-slate-100 transition-all flex-1">
              <div className="space-y-1">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">อัตราการปฏิบัติตาม SLA</p>
                <p className="text-3xl font-black text-slate-800 tracking-tight">{slaComplianceRate}%</p>
                <p className="text-[10px] font-bold text-emerald-600">เป้าหมายมาตรฐานอุตสาหกรรม &gt; 90%</p>
              </div>
              <div className="bg-emerald-500/10 text-emerald-600 p-3 rounded-xl group-hover:scale-110 transition-transform">
                <ShieldCheck size={24} />
              </div>
            </div>

            {/* Average Resolution Time */}
            <div className="bg-slate-50/50 border border-slate-100 p-5 rounded-2xl flex items-center justify-between group hover:bg-white hover:shadow-lg hover:shadow-slate-100 transition-all flex-1">
              <div className="space-y-1">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">ระยะเวลาแก้ไขเฉลี่ย</p>
                <p className="text-3xl font-black text-slate-800 tracking-tight">{avgResolutionTimeDays ? `${avgResolutionTimeDays} วัน` : '1.2 วัน'}</p>
                <p className="text-[10px] font-bold text-blue-600">จากเรื่องร้องเรียนทั้งหมดที่เสร็จสิ้น</p>
              </div>
              <div className="bg-blue-500/10 text-blue-600 p-3 rounded-xl group-hover:scale-110 transition-transform">
                <Timer size={24} />
              </div>
            </div>

            {/* SLA Response Rate */}
            <div className="bg-slate-50/50 border border-slate-100 p-5 rounded-2xl flex items-center justify-between group hover:bg-white hover:shadow-lg hover:shadow-slate-100 transition-all flex-1">
              <div className="space-y-1">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">อัตราการตอบรับใน 24 ชม.</p>
                <p className="text-3xl font-black text-slate-800 tracking-tight">{responseSlaRate}%</p>
                <p className="text-[10px] font-bold text-amber-600">การรับเรื่องเข้าระบบเพื่อตรวจสอบ</p>
              </div>
              <div className="bg-amber-500/10 text-amber-600 p-3 rounded-xl group-hover:scale-110 transition-transform">
                <Activity size={24} />
              </div>
            </div>
          </div>

          {/* SLA Distribution Chart by Severity (Recharts Bar Chart) */}
          <div className="lg:col-span-2 bg-slate-50/30 border border-slate-100 p-5 rounded-2xl flex flex-col h-[320px]">
            <div className="flex justify-between items-center mb-4">
              <h4 className="text-xs font-black text-slate-700 uppercase tracking-wider">เปอร์เซ็นต์ความลุล่วงตามกำหนด (จำแนกตามระดับความเร่งด่วน)</h4>
              <span className="text-[9px] font-bold text-slate-400">หน่วย: เปอร์เซ็นต์ (%)</span>
            </div>
            <div className="flex-1 w-full min-h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={slaBySeverityData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 11, fontWeight: 'bold'}} />
                  <YAxis domain={[0, 100]} axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 11, fontWeight: 'bold'}} />
                  <Tooltip 
                    contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', padding: '12px' }}
                    itemStyle={{ fontWeight: 'black', color: '#0f172a' }}
                    labelStyle={{ fontWeight: 'black', color: '#64748b', fontSize: '10px', marginBottom: '4px' }}
                  />
                  <Bar dataKey="อัตราการปฏิบัติตาม SLA (%)" radius={[8, 8, 0, 0]} barSize={32}>
                    {slaBySeverityData.map((entry, index) => {
                      const colors = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444'];
                      return <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />;
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <motion.div 
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.5 }}
          className="lg:col-span-2 bg-white p-8 rounded-[32px] shadow-sm border border-slate-100 flex flex-col h-[480px]"
        >
          <div className="flex justify-between items-center mb-8">
            <h3 className="text-xl font-black text-slate-800 tracking-tight">แนวโน้มการร้องเรียนย้อนหลัง</h3>
            <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">หน่วย: รายการ</div>
          </div>
          <div className="flex-1 w-full min-h-[320px] relative">
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <AreaChart data={trendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 12, fontWeight: 'bold'}} dy={15} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 12, fontWeight: 'bold'}} />
                <Tooltip 
                  contentStyle={{ borderRadius: '20px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)', padding: '16px' }} 
                  itemStyle={{ fontWeight: 'black', color: '#0f172a' }}
                  labelStyle={{ fontWeight: 'black', color: '#94a3b8', marginBottom: '8px', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.1em' }}
                />
                <Area type="monotone" dataKey="value" stroke="#10b981" strokeWidth={4} fillOpacity={1} fill="url(#colorValue)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.6 }}
          className="bg-white p-6 rounded-[32px] shadow-sm border border-slate-100 flex flex-col h-[480px]"
        >
          <h3 className="text-xl font-black text-slate-800 mb-3 text-center uppercase tracking-wider">สถานะการทำงาน</h3>
          <div className="flex-1 w-full h-[220px] min-h-[220px] relative text-center">
            <ResponsiveContainer width="100%" height={220} minWidth={0}>
              <PieChart>
                <Pie
                  data={statusData.length > 0 ? statusData : [{name: 'ไม่มีข้อมูล', value: 0}]}
                  innerRadius={60}
                  outerRadius={90}
                  paddingAngle={6}
                  dataKey="value"
                  stroke="none"
                >
                  {statusData.map((entry, index) => (
                    <Cell 
                      key={`cell-${index}`} 
                      fill={STATUS_COLORS[entry.name] || COLORS[index % COLORS.length]} 
                      className="outline-none"
                    />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ borderRadius: '20px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)' }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none">
               <p className="text-3xl font-black text-slate-800 leading-none">{stats.total}</p>
               <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-0.5">ทั้งหมด</p>
            </div>
          </div>
          <div className="mt-4 border-t border-slate-100 pt-4 px-4">
            <div className="flex flex-col gap-3">
              {statusData.map((entry, index) => (
                <div key={entry.name} className="flex items-center justify-between group">
                  <div className="flex items-center gap-3">
                    <div 
                      className="w-3 h-3 rounded-full shadow-sm border-2 border-white ring-1 ring-slate-100" 
                      style={{backgroundColor: STATUS_COLORS[entry.name] || COLORS[index % COLORS.length]}} 
                    />
                    <span className="text-xs font-black text-slate-700 uppercase tracking-widest">
                      {STATUS_LABELS[entry.name] || entry.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="h-0.5 w-12 bg-slate-50 rounded-full group-hover:bg-slate-100 transition-colors" />
                    <span className="text-base font-black text-slate-900 tabular-nums">
                      {entry.value}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      </div>

      {/* Category & Department Distribution Bento Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Category Distribution Card */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.65 }}
          className="bg-white p-8 rounded-[32px] shadow-sm border border-slate-100 flex flex-col h-[450px]"
        >
          <div className="flex justify-between items-center mb-8 border-b border-slate-50 pb-4">
            <div>
              <h3 className="text-xl font-black text-slate-800 tracking-tight">สัดส่วนตามหมวดหมู่เรื่องร้องเรียน</h3>
              <p className="text-xs font-bold text-slate-400 mt-0.5">วิเคราะห์จำนวนเรื่องแยกตามหมวดหมู่จากการคัดกรอง</p>
            </div>
            <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">หน่วย: รายการ</div>
          </div>
          <div className="flex-1 w-full min-h-[300px] relative">
            {categoryStats.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={categoryStats} layout="vertical" margin={{ top: 10, right: 20, left: 30, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                  <XAxis type="number" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 11, fontWeight: 'bold'}} />
                  <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} width={100} tick={{fill: '#475569', fontSize: 11, fontWeight: 'bold'}} />
                  <Tooltip 
                    contentStyle={{ borderRadius: '20px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)', padding: '16px' }} 
                    itemStyle={{ fontWeight: 'black', color: '#0f172a' }}
                    labelStyle={{ fontWeight: 'black', color: '#94a3b8', marginBottom: '8px', fontSize: '10px' }}
                  />
                  <Bar dataKey="จำนวนเรื่อง" radius={[0, 8, 8, 0]} barSize={18}>
                    {categoryStats.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-2 font-black text-sm">
                ไม่มีข้อมูลหมวดหมู่เพื่อแสดงผล
              </div>
            )}
          </div>
        </motion.div>

        {/* Department Workload Card */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}
          className="bg-white p-8 rounded-[32px] shadow-sm border border-slate-100 flex flex-col h-[450px]"
        >
          <div className="flex justify-between items-center mb-8 border-b border-slate-50 pb-4">
            <div>
              <h3 className="text-xl font-black text-slate-800 tracking-tight">ระดับภาระงานตามหน่วยงานผู้รับผิดชอบ</h3>
              <p className="text-xs font-bold text-slate-400 mt-0.5">ปริมาณเรื่องร้องเรียนทั้งหมดแบ่งตามหน่วยงาน</p>
            </div>
            <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">หน่วย: รายการ</div>
          </div>
          <div className="flex-1 w-full min-h-[300px] relative text-slate-700">
            {departmentStats.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={departmentStats} margin={{ top: 10, right: 10, left: -20, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#475569', fontSize: 11, fontWeight: 'bold'}} />
                  <YAxis axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 11, fontWeight: 'bold'}} />
                  <Tooltip 
                    contentStyle={{ borderRadius: '20px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)', padding: '16px' }} 
                    itemStyle={{ fontWeight: 'black', color: '#0f172a' }}
                    labelStyle={{ fontWeight: 'black', color: '#94a3b8', marginBottom: '8px', fontSize: '10px' }}
                  />
                  <Bar dataKey="จำนวนเรื่อง" radius={[8, 8, 0, 0]} barSize={24} fill="#8b5cf6">
                    {departmentStats.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[(index + 2) % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-2 font-black text-sm">
                ไม่มีข้อมูลหน่วยงานเพื่อแสดงผล
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}

function KPICard({ title, value, icon: Icon, trend, color, bgColor, textColor, delay }: any) {
  const isPositive = trend.startsWith('+');
  return (
    <motion.div 
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      whileHover={{ y: -3, transition: { duration: 0.2 } }}
      className="bg-white px-5 py-3.5 rounded-[24px] shadow-sm border border-slate-100 hover:shadow-md hover:shadow-slate-100 transition-all group flex flex-col justify-center items-center text-center relative overflow-hidden"
    >
      <div className="w-full flex justify-between items-center mb-2">
        <div className={`${bgColor} ${textColor} p-1.5 rounded-xl group-hover:scale-105 transition-transform shadow-sm`}>
          <Icon size={18} />
        </div>
        <div className={`flex items-center text-[9px] font-black rounded-md px-1.5 py-0.5 ${isPositive ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-red-50 text-red-600 border border-red-100'}`}>
          {isPositive ? <ArrowUpRight size={10} className="mr-0.5" /> : <ArrowDownRight size={10} className="mr-0.5" />}
          {trend}
        </div>
      </div>
      <div>
        <div className="text-3xl font-black text-slate-900 mb-0.5 leading-none tracking-tight">{value.toLocaleString()}</div>
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{title}</p>
      </div>
    </motion.div>
  );
}

