import { AnimatePresence, motion } from 'motion/react';
import type { AdminUser, EditPanelState, LookupItem, School, UserType } from '../types';

type EditPanelProps = {
  editPanel: EditPanelState | null;
  users: AdminUser[];
  schools: School[];
  userTypes: UserType[];
  lookupUserTypes: LookupItem[];
  onChangePayload: (patch: Record<string, unknown>) => void;
  onSave: () => void;
  onClose: () => void;
};

export function EditPanel({
  editPanel,
  users,
  schools,
  userTypes,
  lookupUserTypes,
  onChangePayload,
  onSave,
  onClose,
}: EditPanelProps) {
  const payloadString = (key: string, fallback = ''): string => {
    if (!editPanel) return fallback;
    const value = editPanel.payload[key];
    return typeof value === 'string' ? value : fallback;
  };

  const payloadNumberArray = (key: string): number[] => {
    if (!editPanel) return [];
    const value = editPanel.payload[key];
    return Array.isArray(value) ? (value as number[]) : [];
  };

  return (
    <AnimatePresence>
      {editPanel && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-slate-900/20"
          />
          <motion.aside
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ duration: 0.24, ease: 'easeInOut' }}
            className="fixed right-0 top-0 z-50 h-screen w-full max-w-2xl overflow-y-auto border-l border-slate-300 bg-white p-4 dark:border-slate-700 dark:bg-slate-950"
          >
            <div className="mb-4 flex items-center justify-between border-b border-slate-200 pb-2 dark:border-slate-700">
              <h3 className="text-lg font-semibold">{editPanel.title}</h3>
              <button onClick={onClose} className="text-sm text-slate-500 hover:text-slate-800">
                Close
              </button>
            </div>

            <div className="space-y-3 text-sm">
              {editPanel.entity === 'TEAM' && (
                <>
                  <label className="block">
                    <span className="mb-1 block text-xs uppercase text-slate-500">Team Name</span>
                    <input
                      value={payloadString('name')}
                      onChange={(e) => onChangePayload({ name: e.target.value })}
                      className="w-full border border-slate-300 px-2 py-2 dark:border-slate-700"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs uppercase text-slate-500">Description</span>
                    <textarea
                      value={payloadString('description')}
                      onChange={(e) => onChangePayload({ description: e.target.value })}
                      className="w-full border border-slate-300 px-2 py-2 dark:border-slate-700"
                      rows={3}
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs uppercase text-slate-500">Managers</span>
                    <select
                      multiple
                      value={payloadNumberArray('managerUserIds').map(String)}
                      onChange={(e) => {
                        const managerUserIds = Array.from(e.target.selectedOptions).map((opt) => Number(opt.value));
                        onChangePayload({ managerUserIds });
                      }}
                      className="h-28 w-full border border-slate-300 px-2 py-2 dark:border-slate-700"
                    >
                      {users.map((user) => (
                        <option key={user.id} value={user.id}>
                          {user.full_name}
                        </option>
                      ))}
                    </select>
                    <p className="mt-1 text-xs text-slate-500">Hold Ctrl/Cmd to select multiple managers.</p>
                  </label>
                </>
              )}

              {editPanel.entity === 'USER_TYPE' && (
                <label className="block">
                  <span className="mb-1 block text-xs uppercase text-slate-500">User Type Name</span>
                  <input
                    value={payloadString('name')}
                    onChange={(e) => onChangePayload({ name: e.target.value })}
                    className="w-full border border-slate-300 px-2 py-2 dark:border-slate-700"
                  />
                </label>
              )}

              {editPanel.entity === 'SCHOOL' && (
                <label className="block">
                  <span className="mb-1 block text-xs uppercase text-slate-500">School Name</span>
                  <input
                    value={payloadString('name')}
                    onChange={(e) => onChangePayload({ name: e.target.value })}
                    className="w-full border border-slate-300 px-2 py-2 dark:border-slate-700"
                  />
                </label>
              )}

              {editPanel.entity === 'USER' && (
                <>
                  <label className="block">
                    <span className="mb-1 block text-xs uppercase text-slate-500">Full Name</span>
                    <input
                      value={payloadString('fullName')}
                      onChange={(e) => onChangePayload({ fullName: e.target.value })}
                      className="w-full border border-slate-300 px-2 py-2 dark:border-slate-700"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs uppercase text-slate-500">Email</span>
                    <input
                      value={payloadString('email')}
                      onChange={(e) => onChangePayload({ email: e.target.value })}
                      className="w-full border border-slate-300 px-2 py-2 dark:border-slate-700"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs uppercase text-slate-500">Role</span>
                    <select
                      value={payloadString('role', 'USER')}
                      onChange={(e) => onChangePayload({ role: e.target.value })}
                      className="w-full border border-slate-300 px-2 py-2 dark:border-slate-700"
                    >
                      <option value="ADMINISTRATOR">ADMINISTRATOR</option>
                      <option value="TEAM_MANAGER">TEAM_MANAGER</option>
                      <option value="USER">USER</option>
                    </select>
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block">
                      <span className="mb-1 block text-xs uppercase text-slate-500">School</span>
                      <select
                        value={payloadString('schoolId')}
                        onChange={(e) => onChangePayload({ schoolId: e.target.value })}
                        className="w-full border border-slate-300 px-2 py-2 dark:border-slate-700"
                      >
                        <option value="">None</option>
                        {schools.map((school) => (
                          <option key={school.id} value={school.id}>
                            {school.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-xs uppercase text-slate-500">User Type</span>
                      <select
                        value={payloadString('userTypeId')}
                        onChange={(e) => onChangePayload({ userTypeId: e.target.value })}
                        className="w-full border border-slate-300 px-2 py-2 dark:border-slate-700"
                      >
                        <option value="">None</option>
                        {userTypes.map((userType) => (
                          <option key={userType.id} value={userType.id}>
                            {userType.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <label className="block">
                    <span className="mb-1 block text-xs uppercase text-slate-500">Active</span>
                    <select
                      value={payloadString('isActive', '1')}
                      onChange={(e) => onChangePayload({ isActive: e.target.value })}
                      className="w-full border border-slate-300 px-2 py-2 dark:border-slate-700"
                    >
                      <option value="1">Active</option>
                      <option value="0">Inactive</option>
                    </select>
                  </label>
                </>
              )}

              {editPanel.entity === 'DOCUMENT' && (
                <>
                  <label className="block">
                    <span className="mb-1 block text-xs uppercase text-slate-500">Title</span>
                    <input
                      value={payloadString('title')}
                      onChange={(e) => onChangePayload({ title: e.target.value })}
                      className="w-full border border-slate-300 px-2 py-2 dark:border-slate-700"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs uppercase text-slate-500">Description</span>
                    <textarea
                      value={payloadString('description')}
                      onChange={(e) => onChangePayload({ description: e.target.value })}
                      className="w-full border border-slate-300 px-2 py-2 dark:border-slate-700"
                      rows={3}
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs uppercase text-slate-500">Document URL</span>
                    <input
                      value={payloadString('fileUrl')}
                      onChange={(e) => onChangePayload({ fileUrl: e.target.value })}
                      className="w-full border border-slate-300 px-2 py-2 dark:border-slate-700"
                      placeholder="https://..."
                    />
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block">
                      <span className="mb-1 block text-xs uppercase text-slate-500">Due Date</span>
                      <input
                        type="date"
                        value={payloadString('dueDate')}
                        onChange={(e) => onChangePayload({ dueDate: e.target.value })}
                        className="w-full border border-slate-300 px-2 py-2 dark:border-slate-700"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-xs uppercase text-slate-500">Schedule</span>
                      <select
                        value={payloadString('schedule', 'YEARLY')}
                        onChange={(e) => onChangePayload({ schedule: e.target.value })}
                        className="w-full border border-slate-300 px-2 py-2 dark:border-slate-700"
                      >
                        <option value="MONTHLY">MONTHLY</option>
                        <option value="QUARTERLY">QUARTERLY</option>
                        <option value="YEARLY">YEARLY</option>
                      </select>
                    </label>
                  </div>
                  <label className="block">
                    <span className="mb-1 block text-xs uppercase text-slate-500">User Types</span>
                    <select
                      multiple
                      value={payloadNumberArray('userTypeIds').map(String)}
                      onChange={(e) => {
                        const userTypeIds = Array.from(e.target.selectedOptions).map((opt) => Number(opt.value));
                        onChangePayload({ userTypeIds });
                      }}
                      className="h-28 w-full border border-slate-300 px-2 py-2 dark:border-slate-700"
                    >
                      {lookupUserTypes.map((userType) => (
                        <option key={userType.id} value={userType.id}>
                          {userType.name}
                        </option>
                      ))}
                    </select>
                    <p className="mt-1 text-xs text-slate-500">Hold Ctrl/Cmd to select multiple user types.</p>
                  </label>
                </>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  onClick={onSave}
                  className="rounded-[3px] border border-blue-400 bg-blue-600 px-3 py-2 text-xs font-semibold text-white"
                >
                  Save Changes
                </button>
                <button
                  onClick={onClose}
                  className="rounded-[3px] border border-slate-300 px-3 py-2 text-xs hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
              </div>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}