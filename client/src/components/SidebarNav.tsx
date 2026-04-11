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
  Tag,
  User,
  Users,
} from 'lucide-react';

type SidebarNavProps = {
  nav: string[];
  activePage: string;
  sidebarCollapsed: boolean;
  onSelectPage: (page: string) => void;
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
  'School Buildings': <Building2 size={15} />,
};

export function SidebarNav({ nav, activePage, sidebarCollapsed, onSelectPage }: SidebarNavProps) {
  return (
    <motion.aside
      animate={{ width: sidebarCollapsed ? 78 : 250 }}
      transition={{ duration: 0.22, ease: 'easeInOut' }}
      className="sticky top-0 h-screen border-r border-slate-300 bg-[var(--theme-menu)] text-slate-100"
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
    </motion.aside>
  );
}