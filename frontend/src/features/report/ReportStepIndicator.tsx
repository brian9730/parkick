import { Check } from 'lucide-react';
import { reportSteps } from './model';

export function ReportStepIndicator({ step }: { step: number }) {
  return <nav aria-label="신고 단계" className="step-indicator"><ol>{reportSteps.map((label, index) => <li key={label} className={index === step ? 'current' : index < step ? 'visited' : ''} aria-current={index === step ? 'step' : undefined}><span className="step-circle">{index < step ? <Check size={16} /> : index + 1}</span><span className="step-label">{label}</span></li>)}</ol></nav>;
}
