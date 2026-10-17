import { useCallback, useEffect, useRef, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { lookupReports, reportLookupError } from '../../api/report-lookup';
import type { ReportLookupResult } from '../../api/report-lookup';
import { ReportLookupContext } from './lookup-context';
import { formatPhone } from './model';

/** Mounted only for lookup list/detail routes. Nothing is written to browser storage or URLs. */
export function ReportLookupProvider() {
  const [phoneInput, setPhoneInput] = useState('');
  const [searchedPhone, setSearchedPhone] = useState('');
  const [result, setResult] = useState<ReportLookupResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const activeRequest = useRef<AbortController | null>(null);
  const generation = useRef(0);

  const changePhone = useCallback((value: string) => {
    generation.current += 1;
    activeRequest.current?.abort();
    setPhoneInput(formatPhone(value));
    setSearchedPhone('');
    setResult(null);
    setError('');
    setLoading(false);
  }, []);

  const loadPage = useCallback(async (page = 1) => {
    const phone = phoneInput.replace(/\D/g, '');
    generation.current += 1;
    const requestGeneration = generation.current;
    activeRequest.current?.abort();
    setResult(null);
    setSearchedPhone('');
    setError('');
    if (!/^010\d{8}$/.test(phone) || !Number.isInteger(page) || page < 1 || page > 1000) {
      setLoading(false);
      setError('신고할 때 입력한 010 휴대전화 번호 11자리를 확인해 주세요.');
      return;
    }
    const controller = new AbortController();
    activeRequest.current = controller;
    setLoading(true);
    try {
      const response = await lookupReports(phone, page, controller.signal);
      if (controller.signal.aborted || requestGeneration !== generation.current) return;
      setResult(response);
      setSearchedPhone(phone);
    } catch (failure) {
      if (!controller.signal.aborted && requestGeneration === generation.current) setError(reportLookupError(failure));
    } finally {
      if (requestGeneration === generation.current) setLoading(false);
    }
  }, [phoneInput]);

  useEffect(() => () => {
    generation.current += 1;
    activeRequest.current?.abort();
  }, []);

  return <ReportLookupContext.Provider value={{ phoneInput, searchedPhone, result, loading, error, changePhone, loadPage }}><Outlet /></ReportLookupContext.Provider>;
}
