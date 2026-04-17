import type { ReactNode } from 'react';
import { motion } from 'motion/react';
import {
  Activity,
  BarChart2,
  BookOpen,
  Building2,
  Clock,
  File,
  FolderOpen,
  GraduationCap,
  LayoutGrid,
  Settings,
  Shield,
  Signature,
  Tag,
  User,
  Users,
} from 'lucide-react';

type SidebarNavProps = {
  nav: string[];
  activePage: string;
  sidebarCollapsed: boolean;
  onSelectPage: (page: string) => void;
  onToggleSidebar: () => void;
};

const navIconMap: Record<string, ReactNode> = {
  Dashboard: <LayoutGrid size={15} />,
  Teams: <Users size={15} />,
  'User Types': <Tag size={15} />,
  Schools: <GraduationCap size={15} />,
  Users: <User size={15} />,
  Documents: <BookOpen size={15} />,
  Reports: <BarChart2 size={15} />,
  Settings: <Settings size={15} />,
  'My Team Docs': <FolderOpen size={15} />,
  'My Documents': <File size={15} />,
  Activity: <Activity size={15} />,
  History: <Clock size={15} />,
  Signatures: <Signature size={15} />,
  'School Buildings': <Building2 size={15} />,
};

const APP_VERSION = '1.0.0';

export function SidebarNav({ nav, activePage, sidebarCollapsed, onSelectPage, onToggleSidebar }: SidebarNavProps) {
  return (
    <>
      {/* Mobile overlay backdrop - shown when menu is open on mobile */}
      {!sidebarCollapsed && (
        <div 
          className="fixed inset-0 z-30 bg-black/30 md:hidden cursor-pointer" 
          onClick={onToggleSidebar}
        />
      )}
      
      <motion.aside
        animate={{ width: sidebarCollapsed ? 0 : 250 }}
        transition={{ duration: 0.22, ease: 'easeInOut' }}
        className="fixed left-0 top-0 z-40 h-screen border-r border-slate-300 bg-[var(--theme-menu)] text-slate-100 overflow-hidden md:hidden"
      >
        <div className="flex h-14 items-center border-b border-slate-500 px-3 font-semibold tracking-wide">
          <Shield size={18} />
          {!sidebarCollapsed && <span className="ml-2">DocRecord</span>}
        </div>
        <nav className="space-y-1 p-2 text-sm">
          {nav.map((item) => (
            <button
              key={item}
              onClick={() => onSelectPage(item)}
              className={`flex w-full items-center rounded-[3px] border px-3 py-2 text-left ${activePage === item ? 'border-slate-300 bg-slate-800' : 'border-transparent hover:border-slate-300 hover:bg-slate-800'}`}
            >
              {navIconMap[item] ?? <LayoutGrid size={15} />}
              {!sidebarCollapsed && <span className="ml-2">{item}</span>}
            </button>
          ))}
        </nav>
        <div className="absolute bottom-0 left-0 right-0 border-t border-slate-500 p-3 text-center text-[10px] uppercase tracking-widest text-slate-400">
          v{APP_VERSION}
        </div>
      </motion.aside>
      
          {/* Desktop sidebar - collapses to icon-only mode */}
          <aside
            className={`hidden md:block sticky top-0 z-40 h-screen border-r border-slate-300 bg-[var(--theme-menu)] text-slate-100 transition-[width] duration-200 ${sidebarCollapsed ? 'w-[64px]' : 'w-[250px]'}`}
          >
            <div className={`flex h-14 items-center border-b border-slate-500 px-3 font-semibold tracking-wide ${sidebarCollapsed ? 'justify-center' : ''}`}>
              <Shield size={18} />
              {!sidebarCollapsed && <span className="ml-2">DocRecord</span>}
            </div>
            <nav className="space-y-1 p-2 text-sm">
              {nav.map((item) => (
                <button
                  key={item}
                  onClick={() => onSelectPage(item)}
                  className={`flex w-full items-center rounded-[3px] border px-3 py-2 text-left ${sidebarCollapsed ? 'justify-center px-2' : ''} ${activePage === item ? 'border-slate-300 bg-slate-800' : 'border-transparent hover:border-slate-300 hover:bg-slate-800'}`}
                  title={item}
                >
                  {navIconMap[item] ?? <LayoutGrid size={15} />}
                  {!sidebarCollapsed && <span className="ml-2">{item}</span>}
                </button>
              ))}
            </nav>
            <div className="absolute bottom-0 left-0 right-0 border-t border-slate-500 p-3 text-center text-[10px] uppercase tracking-widest text-slate-400">
              {sidebarCollapsed ? `v${APP_VERSION}` : `Version ${APP_VERSION}`}
            </div>
          </aside>
    </>
  );
}