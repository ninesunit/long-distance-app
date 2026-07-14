import { useCallback, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import type { PairResult } from '../../../../shared/types';

export function usePairing() {
  const [pairing, setPairing] = useState(false);

  const pairWithPartner = useCallback(async (code: string): Promise<PairResult> => {
    setPairing(true);
    try {
      const { data, error } = await supabase.rpc('pair_with_partner', { partner_code: code.trim() });
      if (error) return { success: false, error: error.message };
      return data as PairResult;
    } finally {
      setPairing(false);
    }
  }, []);

  const unpair = useCallback(async (): Promise<PairResult> => {
  setPairing(true);
  try {
    const { data, error } = await supabase.rpc('unpair_partner');
    if (error) return { success: false, error: error.message };
    if ((data as PairResult).success) {
      window.api.hideAllPopups();
    }
    return data as PairResult;
  } finally {
    setPairing(false);
  }
}, []);

  return { pairWithPartner, unpair, pairing };
}
