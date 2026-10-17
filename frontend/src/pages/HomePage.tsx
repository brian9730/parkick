import { ArrowRight, BookOpen, Camera, Check, ChevronRight, ClipboardList, FileCheck2, MapPin, ScanLine, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { HeroIllustration } from '../components/HeroIllustration';
import { ActionLink } from '../components/ui';

const steps = [
  { title: 'QR 스캔', description: <>공유 킥보드에 부착된<br />QR 코드로 신고를 시작해요.</>, icon: ScanLine, className: 'blue' },
  { title: '현장 사진 등록', description: <>주차 상황이 잘 보이도록<br />사진으로 현장을 남겨주세요.</>, icon: Camera, className: 'green' },
  { title: '정보 확인 후 신고', description: <>위치와 상황을 확인하고<br />신고 내용을 완성해요.</>, icon: ClipboardList, className: 'blue' },
];

export function HomePage() {
  return <>
    <section className="hero-section" id="about"><div className="container hero-grid"><div className="hero-copy">
      <p className="eyebrow"><span />더 안전한 거리, 함께 만드는 변화</p>
      <h1>공유 킥보드 신고를<br /><span className="text-primary">더 빠르고</span> <span className="text-accent">쉽게</span></h1>
      <p className="hero-description">길을 막고 있는 킥보드, 그냥 지나치지 마세요.<br className="desktop-break" /> QR 확인부터 신고 접수까지,<br className="desktop-break" /> 파킥에서 간편하게 시작할 수 있어요.</p>
      <div className="hero-actions"><ActionLink to="/report" arrow>신고하기</ActionLink><ActionLink to="/report/status" variant="secondary" arrow>처리결과 조회</ActionLink></div>
      <div className="hero-assurances"><span><Check size={15} />회원가입 없이</span><span><Check size={15} />모바일에서 간편하게</span></div>
    </div><HeroIllustration /></div></section>
    <div className="preview-strip"><div className="container"><span className="preview-dot" /><strong>지금은 개발용 서비스예요.</strong><span>신고와 사진을 저장해 접수를 시험할 수 있어요. 지자체에는 전달되지 않아요.</span></div></div>
    <section className="how-section container" id="how-it-works"><div className="section-heading"><p className="overline">HOW IT WORKS</p><h2>작은 실천, 간편한 신고</h2><p>QR 확인부터 신고 내용 작성까지, 차근차근 안내할게요.</p></div>
      <div className="how-grid">{steps.map((step, index) => <article className="how-card" key={step.title}><div className="how-card-copy"><span className={`step-number ${step.className}`}>0{index + 1}</span><h3>{step.title}</h3><p>{step.description}</p></div><div className={`how-art ${step.className}`}><step.icon size={43} strokeWidth={1.6} /><span className="how-art-detail">{index === 0 ? 'SCAN' : index === 1 ? 'PHOTO' : 'REPORT'}</span></div>{index < 2 && <span className="between-arrow"><ChevronRight size={19} /></span>}</article>)}</div>
      <div className="help-grid">
        <a className="help-card" href="#guide"><span className="help-icon blue"><BookOpen size={23} /></span><h3>신고 방법 안내</h3><p>처음 이용하시나요?<br />신고 과정을 알아보세요.</p><span className="text-link">이용 방법 보기 <ArrowRight size={15} /></span></a>
        <a className="help-card" href="#privacy"><span className="help-icon green"><ShieldCheck size={23} /></span><h3>개인정보 주의</h3><p>사진을 찍기 전,<br />주변 개인정보를 확인해요.</p><span className="text-link">주의사항 보기 <ArrowRight size={15} /></span></a>
        <a className="help-card" href="#process"><span className="help-icon blue"><FileCheck2 size={23} /></span><h3>처리 절차 안내</h3><p>접수부터 처리까지,<br />어떤 과정을 거칠까요?</p><span className="text-link">처리 절차 보기 <ArrowRight size={15} /></span></a>
        <Link className="help-card" to="/report/status"><span className="help-icon green"><MapPin size={23} /></span><h3>내 신고 확인</h3><p>신고할 때 남긴 전화번호로<br />진행 상태를 확인해요.</p><span className="text-link">처리결과 조회 <ArrowRight size={15} /></span></Link>
      </div>
    </section>
    <section className="faq-section" id="faq"><div className="container faq-grid"><div><p className="overline">GOOD TO KNOW</p><h2>궁금한 점이<br />있으신가요?</h2><p>파킥 이용 전에 확인해 주세요.</p><div className="faq-decoration"><ShieldCheck size={42} strokeWidth={1.4} /><span>우리의 작은 관심이<br />모두의 길을 지켜요.</span></div></div><div className="faq-list">
      <details id="guide"><summary>회원가입 없이 신고할 수 있나요?</summary><p>파킥의 시민 신고는 회원가입 없이 이용하는 방식입니다. QR 확인, 현장 사진, 위치, 신고 유형, 신고문 확인 순서로 진행하며 마지막 연락처 입력은 선택사항이에요. 전화번호 없이도 신고할 수 있어요. 현재 제출한 신고와 사진은 개발용으로 저장되며 지자체에는 전달되지 않습니다.</p></details>
      <details id="privacy"><summary>현장 사진을 찍을 때 무엇을 주의해야 하나요?</summary><p>킥보드와 통행 상황이 잘 보이게 촬영해 주세요. 주변 사람의 얼굴, 자동차 번호판 등 개인정보가 불필요하게 포함되지 않도록 주의해 주세요. 현장 사진은 신고 증빙자료로만 사용하며, 현재 AI에 전달하지 않습니다.</p></details>
      <details id="process"><summary>신고 후에는 어떻게 처리되나요?</summary><p>전화번호를 남긴 신고는 해당 번호를 입력해 신고내역과 진행 상태를 조회할 수 있어요. 인증번호는 필요하지 않아요. 번호를 남기지 않은 신고는 전화번호로 조회할 수 없어요. 현재는 개발용 접수이며 관리자의 실제 처리 기능과 지자체 전달은 아직 연결되지 않았습니다.</p></details>
      <details><summary>QR 코드를 읽을 수 없다면 어떻게 하나요?</summary><p>카메라를 사용할 수 없거나 QR을 읽기 어려우면 업체명과 기기번호를 직접 입력해 주세요. 기기에 표시된 정보를 확인할 수 없다면 확인 불가를 선택해 진행할 수 있어요.</p></details>
    </div></div></section>
  </>;
}
