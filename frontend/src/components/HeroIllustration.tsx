import { Check, MapPin, ScanLine } from 'lucide-react';

/** Original interface illustration, not a camera feed, map or valid QR code. */
export function HeroIllustration() {
  return <div className="hero-illustration" aria-label="휴대전화로 킥보드 QR을 확인하는 과정을 표현한 일러스트" role="img">
    <div className="illustration-orbit orbit-one" /><div className="illustration-orbit orbit-two" />
    <svg className="scooter-art" viewBox="0 0 440 450" fill="none" aria-hidden="true">
      <ellipse cx="247" cy="405" rx="174" ry="17" fill="#CCDED9" opacity=".6" />
      <path d="M64 326h-29v59h29v-59ZM407 251h-28v132h28V251Z" fill="#DFEAE6" />
      <path d="M14 388H427" stroke="#C5D9D2" strokeWidth="3" />
      <circle cx="124" cy="370" r="33" fill="#263947" /><circle cx="124" cy="370" r="19" fill="#F4F8F9" /><circle cx="124" cy="370" r="9" fill="#94ABB6" />
      <circle cx="348" cy="370" r="33" fill="#263947" /><circle cx="348" cy="370" r="19" fill="#F4F8F9" /><circle cx="348" cy="370" r="9" fill="#94ABB6" />
      <path d="M126 367 191 112" stroke="#273D4B" strokeWidth="19" strokeLinecap="round" />
      <path d="M143 305 174 182" stroke="#40B838" strokeWidth="21" />
      <path d="M183 125 190 96 227 96" stroke="#273D4B" strokeWidth="13" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M158 96h82" stroke="#172D3C" strokeWidth="15" strokeLinecap="round" />
      <path d="M146 336 169 360h154l13-16" stroke="#365564" strokeWidth="14" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M174 357h141" stroke="#40B838" strokeWidth="6" strokeLinecap="round" />
      <path d="M194 104c20 55-52 168-33 224" stroke="#758D95" strokeWidth="3" />
      <rect x="152" y="199" width="36" height="47" rx="5" transform="rotate(14 152 199)" fill="white" />
      <path d="m158 210 16 4m-18 4 8 2m-10 6 16 4" stroke="#0048A0" strokeWidth="4" />
    </svg>
    <div className="illustration-phone"><div className="phone-speaker" /><div className="phone-topline"><ScanLine size={18} /><span>QR 확인</span></div><div className="phone-camera"><div className="camera-stem" /><div className="scan-corner corner-tl" /><div className="scan-corner corner-tr" /><div className="scan-corner corner-bl" /><div className="scan-corner corner-br" /><div className="qr-symbol"><ScanLine size={66} strokeWidth={1.4} /></div><div className="scan-beam" /></div><div className="phone-caption">기기의 QR을 화면에 맞춰주세요</div><span className="phone-shutter" /></div>
    <div className="floating-label label-location"><span><MapPin size={19} /></span><div><strong>더 안전한 거리</strong><small>작은 관심으로 시작해요</small></div></div>
    <div className="floating-label label-check"><span><Check size={19} /></span><strong>QR로 간편하게 시작</strong></div>
    <span className="illustration-caption">작은 신고가 만드는, 큰 변화.</span>
  </div>;
}
