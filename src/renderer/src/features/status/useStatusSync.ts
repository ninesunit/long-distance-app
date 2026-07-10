import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabaseClient';
import type { StatusValue, StatusBroadcastPayload } from '../../../../shared/types';

export function useStatusSync(
  myId: string,
  partnerId: string,
  sendStatusChanged: (payload: StatusBroadcastPayload) => void,
  incomingStatus: StatusBroadcastPayload | null
) {
  const [myStatus, setMyStatus] = useState<StatusValue>('free');
  const [partnerStatus, setPartnerStatus] = useState<StatusValue>('free');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function loadStatuses() {
      const mine = await supabase.from('statuses').select('status').eq('user_id', myId).maybeSingle();
      const theirs = await supabase.from('statuses').select('status').eq('user_id', partnerId).maybeSingle();

      if (!mounted) return;

      if (mine.data) setMyStatus(mine.data.status as StatusValue);
      if (theirs.data) setPartnerStatus(theirs.data.status as StatusValue);
      setLoading(false);
    }

    loadStatuses();
    return () => {
      mounted = false;
    };
  }, [myId, partnerId]);

  // React to incoming broadcast payload whenever it changes
  useEffect(() => {
    if (incomingStatus && incomingStatus.userId === partnerId) {
      setPartnerStatus(incomingStatus.status);
    }
  }, [incomingStatus, partnerId]);

  const updateMyStatus = useCallback(
    async (status: StatusValue) => {
      setMyStatus(status);

      const { error } = await supabase
        .from('statuses')
        .upsert({ user_id: myId, status: status, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });

      if (error) {
        console.error('Failed to update status:', error.message);
        return;
      }

      sendStatusChanged({ status: status, userId: myId });
    },
    [myId, sendStatusChanged]
  );

  return { myStatus: myStatus, partnerStatus: partnerStatus, loading: loading, updateMyStatus: updateMyStatus };
}
