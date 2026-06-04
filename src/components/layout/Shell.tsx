/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  LayoutDashboard, 
  FileText, 
  Search, 
  Users, 
  Settings, 
  LogOut, 
  Menu, 
  X,
  Sprout,
  BarChart3,
  ShieldAlert,
  ChevronRight
} from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { NotificationCenter } from './NotificationCenter';

interface NavItemProps {
  icon: React.ElementType;
  label: string;
  active: boolean;
  onClick: () => void;
  collapsed: boolean;
  key?: React.Key;
}

const NavItem = ({ icon: Icon, label, active, onClick, collapsed }: NavItemProps) => (
  <button
    onClick={onClick}
    className={`flex items-center w-full p-3 rounded-lg transition-colors ${
      active ? 'bg-emerald-600 text-white' : 'text-slate-600 hover:bg-emerald-50'
    } ${collapsed ? 'justify-center' : 'space-x-3'}`}
    title={collapsed ? label : undefined}
  >
    <Icon size={20} />
    {!collapsed && <span className="font-medium">{label}</span>}
  </button>
);

export function Shell({ 
  children, 
  activeView, 
  onViewChange 
}: { 
  children: React.ReactNode, 
  activeView: string,
  onViewChange: (view: any) => void
}) {
  const { profile, logout } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const userRole = profile?.role || 'citizen';
  const [reportsOpen, setReportsOpen] = useState(true);

  interface MenuItem {
    id: string;
    label: string;
    icon: React.ElementType;
    roles: string[];
    isParent?: boolean;
    subItems?: MenuItem[];
  }

  const menuItems: MenuItem[] = [
    { id: 'my-complaints', label: 'เรื่องร้องเรียนของฉัน', icon: FileText, roles: ['citizen'] },
    { id: 'all-complaints', label: 'จัดการเรื่องร้องเรียน', icon: FileText, roles: ['admin', 'manager', 'supervisor', 'officer'] },
    { id: 'file-report', label: 'ยื่นเรื่องร้องเรียน', icon: ShieldAlert, roles: ['citizen'] },
    { id: 'track', label: 'ติดตามสถานะเรื่อง', icon: Search, roles: ['citizen', 'officer', 'supervisor', 'manager', 'admin'] },
    {
      id: 'reports-parent',
      label: 'รายงาน',
      icon: BarChart3,
      roles: ['admin', 'manager', 'supervisor', 'officer'],
      isParent: true,
      subItems: [
        { id: 'dashboard', label: 'รายงานผู้บริหาร', icon: LayoutDashboard, roles: ['admin', 'manager', 'supervisor', 'officer'] },
        { id: 'reports', label: 'รายงานการปฏิบัติงาน', icon: BarChart3, roles: ['admin', 'manager'] }
      ]
    },
    { id: 'users', label: 'จัดการผู้ใช้งาน', icon: Users, roles: ['admin'] },
    { id: 'master-data', label: 'ข้อมูลพื้นฐานระบบ', icon: Settings, roles: ['admin'] },
  ];

  const menuGroups = [
    {
      label: 'ทั่วไป',
      items: menuItems.filter(item => 
        item.roles.includes(userRole) && 
        ['file-report', 'my-complaints', 'track'].includes(item.id)
      )
    },
    {
      label: 'การจัดการ',
      items: menuItems.filter(item => {
        if (item.id === 'reports-parent') {
          return item.roles.includes(userRole) && item.subItems?.some(sub => sub.roles.includes(userRole));
        }
        return item.roles.includes(userRole) && ['all-complaints'].includes(item.id);
      })
    },
    {
      label: 'ระบบ',
      items: menuItems.filter(item => 
        item.roles.includes(userRole) && 
        ['users', 'master-data'].includes(item.id)
      )
    }
  ].filter(group => group.items.length > 0);

  const getActiveViewLabel = () => {
    for (const item of menuItems) {
      if (item.id === activeView) return item.label;
      if (item.subItems) {
        const sub = item.subItems.find(sub => sub.id === activeView);
        if (sub) return sub.label;
      }
    }
    return activeView.replace('-', ' ');
  };

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden font-sans">
      {/* Desktop Sidebar */}
      <aside 
        className={`${collapsed ? 'w-20' : 'w-72'} bg-white border-r border-slate-200 transition-all duration-300 hidden md:flex flex-col shadow-sm relative group`}
      >
        {/* Role highlight bar */}
        <div className={`absolute top-0 left-0 w-1.5 h-full ${
          profile?.role === 'admin' ? 'bg-indigo-500' : 
          profile?.role === 'officer' ? 'bg-emerald-500' : 'bg-slate-300'
        }`} />

        <div className="p-6 flex items-center justify-between">
          {!collapsed && (
            <div className="flex items-center space-x-3 text-emerald-700">
              <div className="bg-emerald-600 text-white p-1.5 rounded-lg shadow-lg shadow-emerald-200">
                <Sprout size={24} strokeWidth={2.5} />
              </div>
              <span className="font-black text-xl tracking-tighter text-slate-800">NFC <span className="text-emerald-600">Complaint</span></span>
            </div>
          )}
          {collapsed && (
            <div className="mx-auto bg-emerald-600 text-white p-2.5 rounded-xl shadow-lg shadow-emerald-200">
              <Sprout size={24} strokeWidth={2.5} />
            </div>
          )}
          <button 
            onClick={() => setCollapsed(!collapsed)} 
            className="absolute -right-3 top-20 bg-white border border-slate-200 text-slate-400 hover:text-emerald-600 p-1.5 rounded-full shadow-sm md:opacity-0 group-hover:opacity-100 transition-opacity z-50"
          >
            {collapsed ? <ChevronRight size={16} /> : <X size={16} />}
          </button>
        </div>

        <nav className="flex-1 px-4 py-6 space-y-8 overflow-y-auto scrollbar-hide">
          {menuGroups.map((group, gIdx) => (
            <div key={gIdx} className="space-y-2">
              {!collapsed && (
                <div className="flex items-center gap-2 px-3 mb-4">
                  <div className="w-1 h-3 bg-emerald-500 rounded-full" />
                  <h4 className="text-[11px] font-black text-slate-600 uppercase tracking-[0.2em]">
                    {group.label}
                  </h4>
                </div>
              )}
              <div className="space-y-1">
                {group.items.map((item) => {
                  if (item.isParent && item.subItems) {
                    const hasActiveSub = item.subItems.some(sub => activeView === sub.id);
                    const visibleSubItems = item.subItems.filter(sub => sub.roles.includes(userRole));
                    
                    if (visibleSubItems.length === 0) return null;
                    
                    return (
                      <div key={item.id} className="space-y-1">
                        <button
                          onClick={() => {
                            if (collapsed) {
                              setCollapsed(false);
                              setReportsOpen(true);
                              const firstAllowed = visibleSubItems[0];
                              if (firstAllowed && firstAllowed.id !== activeView) {
                                onViewChange(firstAllowed.id);
                              }
                            } else {
                              setReportsOpen(!reportsOpen);
                            }
                          }}
                          className={`flex items-center justify-between w-full p-3 rounded-lg transition-all duration-200 ${
                            hasActiveSub 
                              ? 'bg-emerald-50 text-emerald-800 font-bold border-l-4 border-emerald-600 pl-2' 
                              : 'text-slate-600 hover:bg-emerald-50'
                          } ${collapsed ? 'justify-center' : ''}`}
                          title={collapsed ? item.label : undefined}
                        >
                          <div className={`flex items-center ${collapsed ? '' : 'space-x-3'}`}>
                            <item.icon size={20} className={hasActiveSub ? 'text-emerald-600' : 'text-slate-500'} />
                            {!collapsed && <span className="font-medium text-sm">{item.label}</span>}
                          </div>
                          {!collapsed && (
                            <motion.div
                              animate={{ rotate: reportsOpen ? 90 : 0 }}
                              transition={{ duration: 0.2 }}
                              className="text-slate-400 group-hover:text-emerald-600"
                            >
                              <ChevronRight size={14} />
                            </motion.div>
                          )}
                        </button>
                        
                        {!collapsed && reportsOpen && (
                          <motion.div 
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="pl-6 space-y-1 mt-1"
                          >
                            {visibleSubItems.map((sub) => {
                              const isSubActive = activeView === sub.id;
                              return (
                                <button
                                  key={sub.id}
                                  onClick={() => onViewChange(sub.id)}
                                  className={`flex items-center w-full p-2 rounded-md text-xs font-semibold transition-all duration-150 ${
                                    isSubActive 
                                      ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-100 font-bold' 
                                      : 'text-slate-500 hover:bg-emerald-50/50 hover:text-emerald-700'
                                  } space-x-2 pl-4`}
                                >
                                  <sub.icon size={14} />
                                  <span>{sub.label}</span>
                                </button>
                              );
                            })}
                          </motion.div>
                        )}
                      </div>
                    );
                  }
                  
                  return (
                    <NavItem
                      key={item.id}
                      icon={item.icon}
                      label={item.label}
                      active={activeView === item.id}
                      onClick={() => onViewChange(item.id)}
                      collapsed={collapsed}
                    />
                  );
                })}
              </div>
              {!collapsed && gIdx < menuGroups.length - 1 && <div className="mx-3 h-px bg-slate-100 mt-6" />}
            </div>
          ))}
        </nav>

        <div className="p-6 border-t border-slate-100 space-y-4">
          {profile && !collapsed && (
            <div className="bg-slate-50 rounded-2xl p-4 flex items-center gap-3">
              <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-emerald-700 font-black border border-slate-200 shadow-sm">
                {profile.fullName?.[0]}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-black text-slate-800 truncate leading-tight">{profile.fullName}</ p>
                <div className={`mt-1 inline-block px-1.5 py-0.5 rounded-md text-[8px] font-black uppercase tracking-widest ${
                  profile.role === 'admin' ? 'bg-indigo-100 text-indigo-700' : 'bg-emerald-100 text-emerald-700'
                }`}>
                  {profile.role}
                </div>
              </div>
            </div>
          )}
          <NavItem
            icon={LogOut}
            label="ลงชื่อออก"
            active={false}
            onClick={logout}
            collapsed={collapsed}
          />
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Desktop Header */}
        <header className="hidden md:flex bg-white border-b border-slate-200 px-8 py-4 items-center justify-between shadow-sm z-10">
          <div className="flex items-center gap-2">
            <span className="text-xs font-black text-slate-400 uppercase tracking-[0.2em]">หน้าหลัก</span>
            <ChevronRight size={12} className="text-slate-300" />
            <span className="text-xs font-black text-emerald-600 uppercase tracking-[0.2em]">{getActiveViewLabel()}</span>
          </div>
          <div className="flex items-center gap-4">
            <NotificationCenter />
            <div className="w-px h-6 bg-slate-200 mx-2"></div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <p className="text-xs font-black text-slate-800 leading-none mb-1">{profile?.fullName}</p>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{profile?.role}</p>
              </div>
              <div className="w-10 h-10 bg-emerald-100 rounded-2xl flex items-center justify-center text-emerald-700 font-black border border-emerald-200 shadow-inner">
                {profile?.fullName?.[0]}
              </div>
            </div>
          </div>
        </header>

        {/* Mobile Header */}
        <header className="md:hidden bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between shadow-sm sticky top-0 z-20">
          <div className="flex items-center space-x-2 text-emerald-700">
            <Sprout size={28} strokeWidth={2.5} />
            <span className="font-bold text-lg">NFC Complaint</span>
          </div>
          <div className="flex items-center gap-3">
             <NotificationCenter />
             <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="p-1 text-slate-600">
               {mobileMenuOpen ? <X size={28} /> : <Menu size={28} />}
             </button>
          </div>
        </header>

        {/* Dynamic Page Content */}
        <div className="flex-1 overflow-y-auto p-4 md:p-8">
          <div className="max-w-7xl mx-auto h-full">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeView}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className="h-full"
              >
                {children}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </main>

      {/* Mobile Drawer (Overlay) */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.3 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black z-30 md:hidden"
              onClick={() => setMobileMenuOpen(false)}
            />
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed inset-y-0 left-0 w-3/4 max-w-sm bg-white z-40 md:hidden flex flex-col p-6 shadow-2xl"
            >
              <div className="flex items-center space-x-3 mb-10 text-emerald-700">
                <Sprout size={40} />
                <span className="text-2xl font-bold">NFC Complaint</span>
              </div>
              <div className="flex-1 space-y-3 overflow-y-auto pr-1">
                {menuItems
                  .filter(item => {
                    if (item.id === 'reports-parent') {
                      return item.roles.includes(userRole) && item.subItems?.some(sub => sub.roles.includes(userRole));
                    }
                    return item.roles.includes(userRole);
                  })
                  .map((item) => {
                    if (item.isParent && item.subItems) {
                      const hasActiveSub = item.subItems.some(sub => activeView === sub.id);
                      const visibleSubItems = item.subItems.filter(sub => sub.roles.includes(userRole));
                      
                      return (
                        <div key={item.id} className="space-y-1">
                          <button
                            onClick={() => setReportsOpen(!reportsOpen)}
                            className={`flex flex-row items-center justify-between w-full p-3.5 rounded-xl text-md font-bold transition-all duration-150 ${
                              hasActiveSub 
                                ? 'bg-emerald-50 text-emerald-800 border-l-4 border-emerald-600 pl-2.5' 
                                : 'text-slate-700 hover:bg-emerald-50'
                            }`}
                          >
                            <div className="flex items-center space-x-3">
                              <item.icon size={22} className={hasActiveSub ? 'text-emerald-600' : 'text-slate-500'} />
                              <span>{item.label}</span>
                            </div>
                            <motion.div
                              animate={{ rotate: reportsOpen ? 90 : 0 }}
                              transition={{ duration: 0.2 }}
                              className="text-slate-400"
                            >
                              <ChevronRight size={18} />
                            </motion.div>
                          </button>
                          
                          {reportsOpen && (
                            <div className="pl-6 space-y-1 select-none animate-fadeIn">
                              {visibleSubItems.map((sub) => {
                                const isSubActive = activeView === sub.id;
                                return (
                                  <button
                                    key={sub.id}
                                    onClick={() => {
                                      onViewChange(sub.id);
                                      setMobileMenuOpen(false);
                                    }}
                                    className={`flex items-center w-full p-2.5 rounded-lg text-sm font-semibold transition-all duration-150 ${
                                      isSubActive 
                                        ? 'bg-emerald-600 text-white shadow-sm' 
                                        : 'text-slate-600 hover:bg-emerald-50'
                                    } space-x-3 pl-4`}
                                  >
                                    <sub.icon size={18} />
                                    <span>{sub.label}</span>
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    }
                    
                    return (
                      <button
                        key={item.id}
                        onClick={() => {
                          onViewChange(item.id);
                          setMobileMenuOpen(false);
                        }}
                        className={`flex items-center w-full p-3.5 rounded-xl text-md font-bold transition-colors ${
                          activeView === item.id ? 'bg-emerald-600 text-white shadow-lg' : 'text-slate-700 hover:bg-emerald-50'
                        }`}
                      >
                        <item.icon className="mr-3 text-slate-500" size={22} style={{ color: activeView === item.id ? 'white' : undefined }} />
                        <span>{item.label}</span>
                      </button>
                    );
                  })}
              </div>
              <button 
                onClick={logout}
                className="flex items-center w-full p-4 text-slate-600 hover:text-red-500 transition-colors mt-auto border-t pt-6"
              >
                <LogOut className="mr-4" size={24} />
                <span className="text-lg font-bold">Logout</span>
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
