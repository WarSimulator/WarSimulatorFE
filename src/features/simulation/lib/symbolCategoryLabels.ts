const koreanCategoryNames: Record<string, string> = {
  'Activity/Event': '활동/사건',
  Air: '공중',
  'Air missile': '공중 미사일',
  'Control measure': '통제 수단',
  Cyberspace: '사이버 공간',
  'Dismounted individual': '하차 인원',
  'Dismounted individuals': '하차 인원',
  'Land civilian unit/Organization': '지상 민간 단체/조직',
  'Land equipment': '지상 장비',
  'Land installations': '지상 시설',
  'Land unit': '지상 부대',
  'Mine warfare': '기뢰전',
  'Sea subsurface': '수중',
  'Sea surface': '수상',
  'Signals Intelligence – Air': '신호정보 – 공중',
  'Signals Intelligence – Land': '신호정보 – 지상',
  'Signals Intelligence – Space': '신호정보 – 우주',
  'Signals Intelligence – Subsurface': '신호정보 – 수중',
  'Signals Intelligence – Surface': '신호정보 – 수상',
  Space: '우주',
  'Space Missile': '우주 미사일',
};

export function getSymbolCategoryLabel(category: string): string {
  const korean = koreanCategoryNames[category];
  return korean ? `${category} (${korean})` : category;
}
