import { createContext, useContext } from 'react';
import type { ReportLookupResult } from '../../api/report-lookup';

export interface ReportLookupState {
  phoneInput: string;
  searchedPhone: string;
  result: ReportLookupResult | null;
  loading: boolean;
  error: string;
  changePhone: (value: string) => void;
  loadPage: (page?: number) => Promise<void>;
}

export const ReportLookupContext = createContext<ReportLookupState | null>(null);

export function useReportLookup(): ReportLookupState {
  const context = useContext(ReportLookupContext);
  if (!context) throw new Error('Report lookup routes require ReportLookupProvider.');
  return context;
}
