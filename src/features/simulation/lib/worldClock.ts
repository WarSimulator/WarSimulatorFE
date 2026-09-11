export type WorldClockCountry = {
  code: string;
  timeZone: string;
};

// Each country uses its capital or primary civil time zone. Countries with
// multiple zones can still be selected as one operational reference clock.
const COUNTRY_TIME_ZONES: Array<[string, string]> = [
  ['AF', 'Asia/Kabul'], ['AL', 'Europe/Tirane'], ['DZ', 'Africa/Algiers'], ['AD', 'Europe/Andorra'], ['AO', 'Africa/Luanda'], ['AG', 'America/Antigua'], ['AR', 'America/Argentina/Buenos_Aires'], ['AM', 'Asia/Yerevan'], ['AU', 'Australia/Sydney'], ['AT', 'Europe/Vienna'], ['AZ', 'Asia/Baku'], ['BS', 'America/Nassau'], ['BH', 'Asia/Bahrain'], ['BD', 'Asia/Dhaka'], ['BB', 'America/Barbados'], ['BY', 'Europe/Minsk'], ['BE', 'Europe/Brussels'], ['BZ', 'America/Belize'], ['BJ', 'Africa/Porto-Novo'], ['BT', 'Asia/Thimphu'], ['BO', 'America/La_Paz'], ['BA', 'Europe/Sarajevo'], ['BW', 'Africa/Gaborone'], ['BR', 'America/Sao_Paulo'], ['BN', 'Asia/Brunei'], ['BG', 'Europe/Sofia'], ['BF', 'Africa/Ouagadougou'], ['BI', 'Africa/Bujumbura'], ['CV', 'Atlantic/Cape_Verde'], ['KH', 'Asia/Phnom_Penh'], ['CM', 'Africa/Douala'], ['CA', 'America/Toronto'], ['CF', 'Africa/Bangui'], ['TD', 'Africa/Ndjamena'], ['CL', 'America/Santiago'], ['CN', 'Asia/Shanghai'], ['CO', 'America/Bogota'], ['KM', 'Indian/Comoro'], ['CG', 'Africa/Brazzaville'], ['CD', 'Africa/Kinshasa'], ['CR', 'America/Costa_Rica'], ['CI', 'Africa/Abidjan'], ['HR', 'Europe/Zagreb'], ['CU', 'America/Havana'], ['CY', 'Asia/Nicosia'], ['CZ', 'Europe/Prague'], ['DK', 'Europe/Copenhagen'], ['DJ', 'Africa/Djibouti'], ['DM', 'America/Dominica'], ['DO', 'America/Santo_Domingo'], ['EC', 'America/Guayaquil'], ['EG', 'Africa/Cairo'], ['SV', 'America/El_Salvador'], ['GQ', 'Africa/Malabo'], ['ER', 'Africa/Asmara'], ['EE', 'Europe/Tallinn'], ['SZ', 'Africa/Mbabane'], ['ET', 'Africa/Addis_Ababa'], ['FJ', 'Pacific/Fiji'], ['FI', 'Europe/Helsinki'], ['FR', 'Europe/Paris'], ['GA', 'Africa/Libreville'], ['GM', 'Africa/Banjul'], ['GE', 'Asia/Tbilisi'], ['DE', 'Europe/Berlin'], ['GH', 'Africa/Accra'], ['GR', 'Europe/Athens'], ['GD', 'America/Grenada'], ['GT', 'America/Guatemala'], ['GN', 'Africa/Conakry'], ['GW', 'Africa/Bissau'], ['GY', 'America/Guyana'], ['HT', 'America/Port-au-Prince'], ['HN', 'America/Tegucigalpa'], ['HU', 'Europe/Budapest'], ['IS', 'Atlantic/Reykjavik'], ['IN', 'Asia/Kolkata'], ['ID', 'Asia/Jakarta'], ['IR', 'Asia/Tehran'], ['IQ', 'Asia/Baghdad'], ['IE', 'Europe/Dublin'], ['IL', 'Asia/Jerusalem'], ['IT', 'Europe/Rome'], ['JM', 'America/Jamaica'], ['JP', 'Asia/Tokyo'], ['JO', 'Asia/Amman'], ['KZ', 'Asia/Almaty'], ['KE', 'Africa/Nairobi'], ['KI', 'Pacific/Tarawa'], ['KP', 'Asia/Pyongyang'], ['KR', 'Asia/Seoul'], ['KW', 'Asia/Kuwait'], ['KG', 'Asia/Bishkek'], ['LA', 'Asia/Vientiane'], ['LV', 'Europe/Riga'], ['LB', 'Asia/Beirut'], ['LS', 'Africa/Maseru'], ['LR', 'Africa/Monrovia'], ['LY', 'Africa/Tripoli'], ['LI', 'Europe/Vaduz'], ['LT', 'Europe/Vilnius'], ['LU', 'Europe/Luxembourg'], ['MG', 'Indian/Antananarivo'], ['MW', 'Africa/Blantyre'], ['MY', 'Asia/Kuala_Lumpur'], ['MV', 'Indian/Maldives'], ['ML', 'Africa/Bamako'], ['MT', 'Europe/Malta'], ['MH', 'Pacific/Majuro'], ['MR', 'Africa/Nouakchott'], ['MU', 'Indian/Mauritius'], ['MX', 'America/Mexico_City'], ['FM', 'Pacific/Chuuk'], ['MD', 'Europe/Chisinau'], ['MC', 'Europe/Monaco'], ['MN', 'Asia/Ulaanbaatar'], ['ME', 'Europe/Podgorica'], ['MA', 'Africa/Casablanca'], ['MZ', 'Africa/Maputo'], ['MM', 'Asia/Yangon'], ['NA', 'Africa/Windhoek'], ['NR', 'Pacific/Nauru'], ['NP', 'Asia/Kathmandu'], ['NL', 'Europe/Amsterdam'], ['NZ', 'Pacific/Auckland'], ['NI', 'America/Managua'], ['NE', 'Africa/Niamey'], ['NG', 'Africa/Lagos'], ['MK', 'Europe/Skopje'], ['NO', 'Europe/Oslo'], ['OM', 'Asia/Muscat'], ['PK', 'Asia/Karachi'], ['PW', 'Pacific/Palau'], ['PA', 'America/Panama'], ['PG', 'Pacific/Port_Moresby'], ['PY', 'America/Asuncion'], ['PE', 'America/Lima'], ['PH', 'Asia/Manila'], ['PL', 'Europe/Warsaw'], ['PT', 'Europe/Lisbon'], ['QA', 'Asia/Qatar'], ['RO', 'Europe/Bucharest'], ['RU', 'Europe/Moscow'], ['RW', 'Africa/Kigali'], ['KN', 'America/St_Kitts'], ['LC', 'America/St_Lucia'], ['VC', 'America/St_Vincent'], ['WS', 'Pacific/Apia'], ['SM', 'Europe/San_Marino'], ['ST', 'Africa/Sao_Tome'], ['SA', 'Asia/Riyadh'], ['SN', 'Africa/Dakar'], ['RS', 'Europe/Belgrade'], ['SC', 'Indian/Mahe'], ['SL', 'Africa/Freetown'], ['SG', 'Asia/Singapore'], ['SK', 'Europe/Bratislava'], ['SI', 'Europe/Ljubljana'], ['SB', 'Pacific/Guadalcanal'], ['SO', 'Africa/Mogadishu'], ['ZA', 'Africa/Johannesburg'], ['SS', 'Africa/Juba'], ['ES', 'Europe/Madrid'], ['LK', 'Asia/Colombo'], ['SD', 'Africa/Khartoum'], ['SR', 'America/Paramaribo'], ['SE', 'Europe/Stockholm'], ['CH', 'Europe/Zurich'], ['SY', 'Asia/Damascus'], ['TJ', 'Asia/Dushanbe'], ['TZ', 'Africa/Dar_es_Salaam'], ['TH', 'Asia/Bangkok'], ['TL', 'Asia/Dili'], ['TG', 'Africa/Lome'], ['TO', 'Pacific/Tongatapu'], ['TT', 'America/Port_of_Spain'], ['TN', 'Africa/Tunis'], ['TR', 'Europe/Istanbul'], ['TM', 'Asia/Ashgabat'], ['TV', 'Pacific/Funafuti'], ['UG', 'Africa/Kampala'], ['UA', 'Europe/Kyiv'], ['AE', 'Asia/Dubai'], ['GB', 'Europe/London'], ['US', 'America/New_York'], ['UY', 'America/Montevideo'], ['UZ', 'Asia/Tashkent'], ['VU', 'Pacific/Efate'], ['VA', 'Europe/Vatican'], ['VE', 'America/Caracas'], ['VN', 'Asia/Ho_Chi_Minh'], ['YE', 'Asia/Aden'], ['ZM', 'Africa/Lusaka'], ['ZW', 'Africa/Harare'],
  ['PS', 'Asia/Gaza'], ['TW', 'Asia/Taipei'], ['XK', 'Europe/Belgrade'],
];

export const WORLD_CLOCK_COUNTRIES: WorldClockCountry[] = COUNTRY_TIME_ZONES.map(([code, timeZone]) => ({ code, timeZone }));

const countryNames = new Intl.DisplayNames(['ko-KR'], { type: 'region' });

export function getWorldClockCountry(code: string): WorldClockCountry {
  return WORLD_CLOCK_COUNTRIES.find((country) => country.code === code) ?? WORLD_CLOCK_COUNTRIES.find((country) => country.code === 'KR')!;
}

export function getCountryFlag(code: string) {
  return String.fromCodePoint(...code.toUpperCase().split('').map((letter) => letter.charCodeAt(0) + 127_397));
}

export function getCountryName(code: string) {
  return countryNames.of(code) ?? code;
}

export function formatWorldClock(timeZone: string, now = new Date()) {
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
    timeZoneName: 'short',
  }).format(now);
}
