import type { ProjectStatus, UserRole } from '@/types';

describe('T1 types', () => {
  it('UserRole contains all 6 roles', () => {
    const roles: UserRole[] = ['superadmin', 'admin', 'moderator', 'manager', 'investor', 'project'];
    expect(roles).toHaveLength(6);
  });

  it('ProjectStatus contains approved', () => {
    const s: ProjectStatus = 'approved';
    expect(s).toBe('approved');
  });
});
