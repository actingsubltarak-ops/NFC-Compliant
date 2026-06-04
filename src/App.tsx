/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { AuthProvider, useAuth } from './components/auth/AuthProvider';
import { Shell } from './components/layout/Shell';
import { ComplaintForm } from './components/complaints/ComplaintForm';
import { ComplaintList } from './components/complaints/ComplaintList';
import { ComplaintStatusTracking } from './components/complaints/ComplaintStatusTracking';
import { ExecutiveDashboard } from './components/dashboard/ExecutiveDashboard';
import { OfficerReport } from './components/dashboard/OfficerReport';
import { UserManagement } from './components/admin/UserManagement';
import { MasterData } from './components/admin/MasterData';
import { Sprout, LogIn, Sparkles, AlertCircle, ArrowLeft, Loader2 } from 'lucide-react';
import { db } from './lib/firebase';
import { collection, query, getDocs } from 'firebase/firestore';

function AppContent() {
  const { 
    user, 
    profile, 
    loading, 
    isSigningIn, 
    authError,
    signInWithGoogle, 
    signInWithEmail, 
    signUpWithEmail,
    setAuthError
  } = useAuth();
  const [activeView, setActiveView] = useState('dashboard');
  const [isLandingTrack, setIsLandingTrack] = useState(false);
  const [globalStats, setGlobalStats] = useState({ total: 0, resolved: 0 });
  const [authMode, setAuthMode] = useState<'login' | 'signup' | 'google'>('google');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');

  // Fetch global stats for landing page - only if not logged in
  React.useEffect(() => {
    if (user) return;
    
    let isMounted = true;
    const fetchStats = async () => {
      try {
        const complaintsRef = collection(db, "complaints");
        const q = query(complaintsRef);
        const snapshot = await getDocs(q);

        if (isMounted) {
          const totalCount = snapshot.size;
          const resolvedCount = snapshot.docs.filter(d => d.data().status === "resolved").length;
          setGlobalStats({ total: totalCount, resolved: resolvedCount });
        }
      } catch (err: any) {
        // Silent fail for stats on landing page
      }
    };
    fetchStats();
    return () => { isMounted = false; };
  }, [user]);

  // Auto-set initial view based on role or URL
  React.useEffect(() => {
    const path = window.location.pathname;
    if (path.startsWith('/track/')) {
      setActiveView('track');
      return;
    }

    if (profile) {
      if (profile.role === 'citizen') {
        setActiveView('file-report');
      } else {
        setActiveView('dashboard');
      }
    }
  }, [profile]);

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-emerald-50">
        <div className="flex flex-col items-center gap-4">
          <Sprout size={64} className="text-emerald-600 animate-bounce" />
          <p className="text-emerald-800 font-black tracking-widest uppercase text-xs">NFC Complaint System</p>
        </div>
      </div>
    );
  }

  // Handle public tracking from landing page
  if (!user && isLandingTrack) {
    return (
      <div className="min-h-screen bg-slate-50">
        <nav className="fixed top-0 left-0 right-0 z-50 bg-white border-b border-slate-100 px-6 py-4">
          <div className="max-w-7xl mx-auto flex justify-between items-center">
            <div className="flex items-center gap-2 group cursor-pointer" onClick={() => setIsLandingTrack(false)}>
              <div className="bg-emerald-600 text-white p-2 rounded-xl group-hover:rotate-6 transition-transform">
                <Sprout size={24} strokeWidth={2.5} />
              </div>
              <span className="text-xl font-black tracking-tighter text-slate-800">
                NFC <span className="text-emerald-600">Complaint</span>
              </span>
            </div>
            <button 
              onClick={() => setIsLandingTrack(false)}
              className="text-slate-500 font-bold hover:text-emerald-600 transition-all flex items-center gap-2"
            >
              <ArrowLeft size={18} />
              กลับหน้าหลัก
            </button>
          </div>
        </nav>
        <div className="pt-24 px-6 max-w-4xl mx-auto">
          <ComplaintStatusTracking />
        </div>
      </div>
    );
  }

  if (!user && window.location.pathname.startsWith('/track/')) {
    return (
      <div className="min-h-screen bg-slate-50 p-4 md:p-8 flex items-center justify-center">
        <div className="max-w-2xl w-full">
           <ComplaintStatusTracking />
           <div className="mt-8 text-center">
              <button 
                onClick={() => window.location.href = '/'}
                className="text-emerald-600 font-bold hover:underline"
              >
                เข้าสู่ระบบเพื่อใช้งานส่วนอื่น
              </button>
           </div>
        </div>
      </div>
    );
  }

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (authMode === 'login') {
        await signInWithEmail(email, password);
      } else if (authMode === 'signup') {
        await signUpWithEmail(email, password, fullName);
      }
    } catch (err: any) {
      // Error handled by AuthProvider
    }
  };

  if (!user && !window.location.pathname.startsWith('/track/')) {
    return (
      <div className="min-h-screen bg-white font-sans text-slate-900 selection:bg-emerald-100 selection:text-emerald-900">
        {/* Navigation */}
        <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-xl border-b border-slate-100 px-6 py-4">
          <div className="max-w-7xl mx-auto flex justify-between items-center">
            <div className="flex items-center gap-2 group cursor-pointer">
              <div className="bg-emerald-600 text-white p-2 rounded-xl group-hover:rotate-6 transition-transform">
                <Sprout size={24} strokeWidth={2.5} />
              </div>
              <span className="text-xl font-black tracking-tighter text-slate-800">
                NFC <span className="text-emerald-600">Complaint</span>
              </span>
            </div>
            <button 
              onClick={() => setAuthMode('login')}
              className="bg-slate-900 text-white px-6 py-2.5 rounded-xl font-black text-sm hover:bg-slate-800 transition-all active:scale-95 shadow-lg shadow-slate-200"
            >
              เข้าสู่ระบบ
            </button>
          </div>
        </nav>

        {/* Hero Section */}
        <main className="pt-32 pb-20 px-6">
          <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            <div className="lg:col-span-7 space-y-8">
              <div className="inline-flex items-center gap-2 bg-emerald-50 text-emerald-700 px-4 py-2 rounded-full text-xs font-black uppercase tracking-widest border border-emerald-100">
                <Sparkles size={14} />
                Smart Farmers, Stronger Future
              </div>
              <h1 className="text-6xl md:text-7xl font-black text-slate-900 leading-[1.1] tracking-tight">
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-emerald-500">
                  ร่วมฟัง ร่วมคิด
                </span>
                <br /> 
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-500 to-orange-500">
                  พลิกวิกฤตเกษตรไทย
                </span>
              </h1>
              <p className="text-xl text-slate-500 font-medium leading-relaxed max-w-2xl">
                การเสนอความคิดเห็นและจัดการปัญหาเกษตรกร 
                ที่คุณสามารถแจ้งปัญหา ติดตามสถานะ และเข้าถึงการช่วยเหลือจากหน่วยงานรัฐได้อย่างรวดเร็วและโปร่งใส
              </p>

              {authError && !profile && (
                <div className="bg-red-50 text-red-600 text-sm font-bold p-4 rounded-2xl flex items-center gap-3 animate-pulse">
                  <AlertCircle size={20} />
                  {authError}
                </div>
              )}
              
              <div className="flex flex-col sm:flex-row gap-4 pt-4">
                <button 
                  onClick={signInWithGoogle}
                  disabled={isSigningIn}
                  className="bg-emerald-600 text-white px-10 py-5 rounded-[2rem] font-black text-lg hover:bg-emerald-700 transition-all shadow-2xl shadow-emerald-200 flex items-center justify-center gap-3 active:scale-95 disabled:opacity-50 disabled:cursor-wait"
                >
                  {isSigningIn ? (
                    <Loader2 className="animate-spin" size={24} />
                  ) : (
                    <LogIn size={24} />
                  )}
                  {isSigningIn ? 'กรุณารอสักครู่...' : 'เริ่มใช้งานทันที'}
                </button>
                <button 
                  onClick={() => setIsLandingTrack(true)}
                  className="bg-white text-slate-700 border-2 border-slate-200 px-10 py-5 rounded-[2rem] font-black text-lg hover:border-emerald-500 hover:text-emerald-600 transition-all flex items-center justify-center gap-3 active:scale-95"
                >
                  ติดตามสถานะ
                </button>
              </div>

              <div className="pt-8 flex items-center gap-8 border-t border-slate-100">
                <div>
                  <p className="text-3xl font-black text-emerald-600">{(globalStats.total).toLocaleString()}</p>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">รับแจ้งแล้ว</p>
                </div>
                <div className="w-px h-10 bg-slate-100"></div>
                <div>
                  <p className="text-3xl font-black text-emerald-600">{globalStats.total > 0 ? Math.round((globalStats.resolved / globalStats.total) * 100) : 0}%</p>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">แก้ไขสำเร็จ</p>
                </div>
                <div className="w-px h-10 bg-slate-100"></div>
                <div>
                  <p className="text-3xl font-black text-emerald-600">24hr</p>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">คัดกรองด้วย AI</p>
                </div>
              </div>
            </div>

            {/* Login/Signup Box */}
            <div className="lg:col-span-5">
              <div className="bg-white rounded-[3rem] p-8 md:p-10 shadow-[0_32px_64px_-16px_rgba(0,0,0,0.1)] border border-slate-100 relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-50 rounded-full -translate-y-1/2 translate-x-1/2 opacity-50 blur-2xl group-hover:bg-emerald-100 transition-colors"></div>
                
                <h2 className="text-2xl font-black text-slate-800 mb-2">
                  {authMode === 'signup' ? 'สร้างบัญชีใหม่' : 'เข้าสู่ระบบ'}
                </h2>
                <p className="text-slate-400 font-bold text-sm mb-8">
                  เพื่อเริ่มร้องเรียนหรือติดตามงานของคุณ
                </p>

                {authError && (
                  <div className="bg-red-50 text-red-600 text-xs font-bold p-3 rounded-xl mb-6 flex items-center gap-2">
                    <AlertCircle size={16} />
                    {authError}
                  </div>
                )}

                {authMode === 'google' ? (
                  <div className="space-y-4">
                    <button 
                      onClick={signInWithGoogle}
                      disabled={isSigningIn}
                      className="w-full flex items-center justify-center gap-4 bg-white border-2 border-slate-200 p-5 rounded-2xl font-bold text-slate-700 hover:bg-slate-50 hover:border-emerald-500 transition-all shadow-sm active:scale-95 disabled:opacity-50 disabled:cursor-wait"
                    >
                      {isSigningIn ? (
                        <Loader2 className="animate-spin" size={20} />
                      ) : (
                        <img src="https://www.google.com/favicon.ico" className="w-5 h-5" alt="Google" />
                      )}
                      {isSigningIn ? 'กำลังเชื่อมต่อ...' : 'เข้าสู่ระบบด้วย Google'}
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleEmailAuth} className="space-y-4 text-left">
                    {authMode === 'signup' && (
                      <div>
                        <label className="block text-xs font-black text-slate-400 uppercase mb-2 tracking-widest pl-1">ชื่อ-นามสกุล</label>
                        <input 
                          type="text" required
                          className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-emerald-500 transition-all font-medium"
                          value={fullName}
                          onChange={(e) => setFullName(e.target.value)}
                        />
                      </div>
                    )}
                    <div>
                      <label className="block text-xs font-black text-slate-400 uppercase mb-2 tracking-widest pl-1">อีเมล</label>
                      <input 
                        type="email" required
                        className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-emerald-500 transition-all font-medium"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-black text-slate-400 uppercase mb-2 tracking-widest pl-1">รหัสผ่าน</label>
                      <input 
                        type="password" required
                        className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-emerald-500 transition-all font-medium"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                      />
                    </div>
                    
                    <button 
                      type="submit"
                      className="w-full bg-slate-900 text-white p-5 rounded-[1.5rem] font-black hover:bg-slate-800 transition-all shadow-xl shadow-slate-200 active:scale-95"
                    >
                      {authMode === 'login' ? 'เข้าสู่ระบบ' : 'ลงชื่อสมัครสมาชิก'}
                    </button>

                    <div className="flex flex-col gap-3 pt-6 border-t border-slate-50">
                       <button 
                        type="button"
                        onClick={signInWithGoogle}
                        className="text-center text-sm font-bold text-emerald-600 hover:underline"
                      >
                        หรือ เข้าสู่ระบบด้วย Google Account
                      </button>
                      <button 
                        type="button"
                        onClick={() => {
                          setAuthError(null);
                          setAuthMode(authMode === 'login' ? 'signup' : 'login');
                        }}
                        className="text-center text-xs font-black text-slate-400 uppercase hover:text-emerald-600 tracking-widest"
                      >
                        {authMode === 'login' ? 'ไม่มีบัญชี? สมัครสมาชิกที่นี่' : 'มีบัญชีอยู่แล้ว? เข้าสู่ระบบที่นี่'}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          </div>
        </main>
        
        <footer className="py-12 border-t border-slate-100 px-6">
          <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="text-slate-400 text-xs font-bold uppercase tracking-[0.3em]">
              © 2026 National Farmers Council. All rights reserved.
            </div>
            <div className="flex gap-8">
              <a href="#" className="text-xs font-black text-slate-400 uppercase tracking-widest hover:text-emerald-600 transition-colors">Privacy Policy</a>
              <a href="#" className="text-xs font-black text-slate-400 uppercase tracking-widest hover:text-emerald-600 transition-colors">Contact Support</a>
            </div>
          </div>
        </footer>
      </div>
    );
  }

  const renderView = () => {
    switch (activeView) {
      case 'dashboard':
        return <ExecutiveDashboard />;
      case 'file-report':
        return <ComplaintForm />;
      case 'my-complaints':
        return <ComplaintList viewType="personal" />;
      case 'all-complaints':
        return <ComplaintList viewType="management" />;
      case 'track':
        return <ComplaintStatusTracking />;
      case 'reports':
        return <OfficerReport />;
      case 'users':
        return <UserManagement />;
      case 'master-data':
        return <MasterData />;
      default:
        return (
          <div className="flex items-center justify-center h-full">
            <div className="text-center p-12">
              <h2 className="text-2xl font-bold text-slate-300">Feature Coming Soon</h2>
              <p className="text-slate-400">"{activeView}" is currently under development.</p>
              <button 
                onClick={() => setActiveView('dashboard')}
                className="mt-6 text-emerald-600 font-bold hover:underline"
              >
                Go to Dashboard
              </button>
            </div>
          </div>
        );
    }
  };

  return (
    <Shell activeView={activeView} onViewChange={setActiveView}>
      {renderView()}
    </Shell>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

