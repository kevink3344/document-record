import type { LookupUser } from '../types';
import { roleBadgeClass, userTypeBadgeClass } from '../lib/ui';

type GreetingCardProps = {
  activeUser: LookupUser | null;
  greetingName: string;
  greetingUserType: string;
  activeTeamNames: string[];
};

export function GreetingCard({ activeUser, greetingName, greetingUserType, activeTeamNames }: GreetingCardProps) {
  if (!activeUser) return null;
  const showUserType = Boolean(greetingUserType.trim());

  return (
    <section className="rounded-[3px] border border-slate-200 bg-[var(--theme-card)] p-4 dark:border-slate-700">
      <p className="flex flex-wrap items-center gap-2 text-lg font-semibold">
        <span>Hello, {greetingName}</span>
        <span className={`rounded-[3px] px-2 py-0.5 text-xs font-semibold ${roleBadgeClass(activeUser.role)}`}>
          {activeUser.role}
        </span>
        {showUserType && (
          <span className={`rounded-[3px] px-2 py-0.5 text-xs font-semibold ${userTypeBadgeClass(greetingUserType)}`}>
            {greetingUserType}
          </span>
        )}
      </p>
    </section>
  );
}