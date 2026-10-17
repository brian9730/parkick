import { MapPinOff } from 'lucide-react';
import { ActionLink, EmptyState } from '../components/ui';

export function NotFoundPage() {
  return <div className="flow-page"><div className="status-container"><EmptyState icon={<MapPinOff size={29} />} title="찾으시는 페이지가 없어요" description="주소가 올바른지 확인해 주세요. 홈에서 다시 시작할 수 있어요."><ActionLink to="/">홈으로 돌아가기</ActionLink></EmptyState></div></div>;
}
