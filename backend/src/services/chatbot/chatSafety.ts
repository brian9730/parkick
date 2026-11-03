// 상태 이름 자체와 일반적인 절차 설명은 차단 근거가 아니다.
export function requestsPersonalAction(question: string): boolean {
  const text = question.replace(/\s+/g, '');
  const english = question.replace(/\s+/g, ' ').toLowerCase();
  return /(내|제|개인|해당)신고.{0,30}(상태|결과|됐|되었|확인|조회|처리)/.test(text)
    || /(접수번호|신고번호).{0,20}(확인해|조회해|처리해)/.test(text)
    || /(조회|접수|전달|처리|수거|견인|신고)(해줘|해주세요|해줄래|해봐)/.test(text)
    || /\b(?:my|our|this|that)\s+(?:specific\s+)?(?:report|complaint|case|submission|ticket)\b.{0,60}\b(?:status|result|progress|update|(?:has\s+|have\s+|was\s+|is\s+|been\s+)(?:submitted|received|processed|completed|resolved|approved|rejected|collected|towed|forwarded|sent))\b/.test(english)
    || /\b(?:status|result|progress|update)\s+(?:of|for|on)\s+(?:my|our|this|that|the)\s+(?:report|complaint|case|submission|ticket)\b/.test(english)
    || /\b(?:can|could|would|will)\s+you\s+(?:please\s+)?(?:submit|file|register|forward|send|process|approve|reject|resolve|collect|tow)\b/.test(english)
    || /\b(?:can|could|would|will)\s+you\s+(?:please\s+)?(?:check|look\s+up|track|verify)\s+(?:(?:my|our|this|that|the)\s+)?(?:report|complaint|case|submission|ticket|status)\b/.test(english)
    || /\b(?:check|look\s+up|track|verify|find)\s+(?:the\s+status\s+of\s+)?(?:my|our|this|that|the)\s+(?:report|complaint|case|submission|ticket)\b/.test(english)
    || /\b(?:please\s+)?(?:submit|file|register|forward|send|process|approve|reject|resolve|collect|tow)\s+(?:my|our|this|that|the)\s+(?:report|complaint|case|submission|ticket)\b/.test(english)
    || /\b(?:send|forward)\s+(?:it|my\s+report|this\s+report)\s+to\s+(?:the\s+)?(?:municipality|city|government|authorit(?:y|ies))\b/.test(english);
}

export function claimsPerformedAction(answer: string): boolean {
  const text = answer.replace(/\s+/g, '');
  const english = answer.replace(/\s+/g, ' ').toLowerCase();
  // 수행했다는 단정과 개인 신고의 특정 상태 주장을 구분해서 검사한다.
  return /(조회|전달|접수|수거|견인|처리)(를|가|이)?(완료)?(했습니다|했어요|하였습니다|해드렸|되었습니다|되었어요|됐습니다|됐어요)/.test(text)
    || /지자체(에|로).{0,15}전달(이|을)?완료(입니다|예요|되었)/.test(text)
    || /(조회|확인)(해보니|한결과|해본결과)/.test(text)
    || /신고(의)?(현재)?상태는(접수|처리중|처리완료|수거완료|견인완료)(입니다|예요)/.test(text)
    || /(고객님|회원님|사용자님|당신|귀하|해당신고|이신고).{0,40}(접수|처리중|처리완료|수거완료|견인완료)(상태)?(입니다|예요)/.test(text)
    || /(고객님|회원님|사용자님|당신|귀하|해당|이신고|접수번호|신고번호).{0,40}(조회|전달|접수|수거|견인|처리).{0,20}(완료|됐|되었|확인했)/.test(text)
    || /(제가|저희가|챗봇이|도우미가).{0,30}(조회|전달|접수|수거|견인|처리).{0,20}(했|완료|하였|되었|됐)/.test(text)
    || /\b(?:i(?:['’]ve)?|we(?:['’]ve)?|our team|the chatbot|parkick)\s+(?:(?:have|has|had|already|just|successfully)\s+){0,3}(?:checked|looked\s+up|verified|confirmed|submitted|filed|registered|forwarded|sent|processed|approved|rejected|resolved|collected|towed)\b.{0,60}\b(?:(?:your|the|this|that|a)\s+)?(?:report|complaint|case|submission|ticket|status|it)\b/.test(english)
    || /\b(?:your|this|that)\s+(?:report|complaint|case|submission|ticket)\s+(?:(?:has|had)\s+been|was|is)\s+(?:(?:already|successfully|now|currently)\s+)?(?:submitted|filed|registered|forwarded|sent|processed|being processed|approved|rejected|resolved|collected|towed|completed|received|under review|in progress|pending|closed)\b/.test(english)
    || /\b(?:your|this|that)\s+(?:report|complaint|case|submission|ticket)(?:'s)?\s+(?:current\s+)?status\s+(?:is|was|shows?)\s+(?:received|processing|in progress|completed|under review|resolved|approved|rejected|collected|towed|pending|closed)\b/.test(english)
    || /\b(?:municipality|city|local government|authorit(?:y|ies))\s+(?:(?:has|have|had)\s+)?(?:received|accepted|processed|collected|towed)\s+(?:your|this|that)\s+(?:report|complaint|case|submission|ticket)\b/.test(english);
}
