'use client';

import { useEffect } from 'react';

interface ViewTrackerProps {
  projectId: string;
}

export function ViewTracker({ projectId }: ViewTrackerProps) {
  useEffect(() => {
    void fetch(`/api/investor/deals/${projectId}/view`, { method: 'POST' });
  }, [projectId]);

  return null;
}

