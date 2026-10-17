import { ArrowLeft, ArrowRight, Eye, EyeOff, LockKeyhole, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Button, FormField, LoadingState, ParkickLogo } from '../../components/ui';
import { useAuth } from '../../features/admin/auth-context';

export function AdminLoginPage() {
  const { login, session, loading } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  if (loading) return <LoadingState label="인증 상태를 확인하고 있습니다" />;
  if (session) return <Navigate to="/admin/dashboard" replace />;
  const submit = async (event: React.SubmitEvent<HTMLFormElement>) => {
    event.preventDefault(); setSubmitting(true); setError('');
    try { await login(email.trim(), password); setPassword(''); navigate('/admin/dashboard', { replace: true }); }
    catch (failure) { setError(failure instanceof Error ? failure.message : '로그인하지 못했습니다.'); }
    finally { setSubmitting(false); }
  };
  return <div className="login-page"><Link className="back-link login-back" to="/"><ArrowLeft size={16} />홈으로 돌아가기</Link><div className="login-card"><div className="login-card-brand"><ParkickLogo /></div><span className="login-shield"><ShieldCheck size={30} strokeWidth={1.5} /></span><h1>관리자 로그인</h1><p className="login-description">발급받은 관리자 계정으로 로그인해 주세요.</p><form onSubmit={event => void submit(event)}><FormField label="이메일" htmlFor="admin-email"><input id="admin-email" type="email" autoComplete="username" required value={email} maxLength={254} placeholder="관리자 이메일을 입력하세요" onChange={event => setEmail(event.target.value)} /></FormField><FormField label="비밀번호" htmlFor="admin-password"><div className="password-input"><input id="admin-password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" required value={password} maxLength={128} placeholder="비밀번호를 입력하세요" onChange={event => setPassword(event.target.value)} /><button type="button" className="icon-button" aria-label={showPassword ? '비밀번호 숨기기' : '비밀번호 보기'} aria-pressed={showPassword} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={19} /> : <Eye size={19} />}</button></div></FormField>{error && <div className="login-error" role="alert">{error}</div>}<Button type="submit" className="full-width" disabled={submitting}>{submitting ? '로그인 중…' : '관리자 로그인'}<ArrowRight size={18} /></Button></form><p className="login-restricted"><LockKeyhole size={14} />허가된 관리자만 이용할 수 있습니다.</p></div><p className="login-footer">Parkick · 함께 만드는 더 안전한 거리</p></div>;
}
