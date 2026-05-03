/**
 * ISO 4217 Currency codes.
 * Each entry contains the 3-letter code, numeric code, currency name,
 * symbol, and decimal places (minor unit).
 *
 * The list is sorted with African & platform-primary currencies first,
 * followed by major global currencies, then remaining currencies alphabetically.
 */

export interface Currency {
  /** ISO 4217 alphabetic code (e.g. "GHS") */
  code: string;
  /** ISO 4217 numeric code (e.g. 936) */
  numeric: string;
  /** Full currency name */
  name: string;
  /** Common symbol (e.g. "GH\u20B5") */
  symbol: string;
  /** Number of decimal places (minor unit) */
  decimals: number;
  /** Whether this is a platform-primary currency (African markets) */
  primary?: boolean;
}

// ── Platform-primary currencies (African markets) ─────────────────────
const PRIMARY_CURRENCIES: Currency[] = [
  { code: 'GHS', numeric: '936', name: 'Ghanaian Cedi', symbol: 'GH\u20B5', decimals: 2, primary: true },
  { code: 'KES', numeric: '404', name: 'Kenyan Shilling', symbol: 'KSh', decimals: 2, primary: true },
  { code: 'NGN', numeric: '566', name: 'Nigerian Naira', symbol: '\u20A6', decimals: 2, primary: true },
  { code: 'UGX', numeric: '800', name: 'Ugandan Shilling', symbol: 'USh', decimals: 0, primary: true },
  { code: 'TZS', numeric: '834', name: 'Tanzanian Shilling', symbol: 'TSh', decimals: 2, primary: true },
  { code: 'USD', numeric: '840', name: 'US Dollar', symbol: '$', decimals: 2, primary: true },
];

// ── Other African currencies ──────────────────────────────────────────
const AFRICAN_CURRENCIES: Currency[] = [
  { code: 'AOA', numeric: '973', name: 'Angolan Kwanza', symbol: 'Kz', decimals: 2 },
  { code: 'BIF', numeric: '108', name: 'Burundian Franc', symbol: 'FBu', decimals: 0 },
  { code: 'BWP', numeric: '072', name: 'Botswana Pula', symbol: 'P', decimals: 2 },
  { code: 'CDF', numeric: '976', name: 'Congolese Franc', symbol: 'FC', decimals: 2 },
  { code: 'CVE', numeric: '132', name: 'Cape Verdean Escudo', symbol: 'Esc', decimals: 2 },
  { code: 'DJF', numeric: '262', name: 'Djiboutian Franc', symbol: 'Fdj', decimals: 0 },
  { code: 'DZD', numeric: '012', name: 'Algerian Dinar', symbol: 'DA', decimals: 2 },
  { code: 'EGP', numeric: '818', name: 'Egyptian Pound', symbol: 'E\u00A3', decimals: 2 },
  { code: 'ERN', numeric: '232', name: 'Eritrean Nakfa', symbol: 'Nfk', decimals: 2 },
  { code: 'ETB', numeric: '230', name: 'Ethiopian Birr', symbol: 'Br', decimals: 2 },
  { code: 'GMD', numeric: '270', name: 'Gambian Dalasi', symbol: 'D', decimals: 2 },
  { code: 'GNF', numeric: '324', name: 'Guinean Franc', symbol: 'FG', decimals: 0 },
  { code: 'KMF', numeric: '174', name: 'Comorian Franc', symbol: 'CF', decimals: 0 },
  { code: 'LRD', numeric: '430', name: 'Liberian Dollar', symbol: 'L$', decimals: 2 },
  { code: 'LSL', numeric: '426', name: 'Lesotho Loti', symbol: 'L', decimals: 2 },
  { code: 'LYD', numeric: '434', name: 'Libyan Dinar', symbol: 'LD', decimals: 3 },
  { code: 'MAD', numeric: '504', name: 'Moroccan Dirham', symbol: 'MAD', decimals: 2 },
  { code: 'MGA', numeric: '969', name: 'Malagasy Ariary', symbol: 'Ar', decimals: 2 },
  { code: 'MRU', numeric: '929', name: 'Mauritanian Ouguiya', symbol: 'UM', decimals: 2 },
  { code: 'MUR', numeric: '480', name: 'Mauritian Rupee', symbol: 'Rs', decimals: 2 },
  { code: 'MWK', numeric: '454', name: 'Malawian Kwacha', symbol: 'MK', decimals: 2 },
  { code: 'MZN', numeric: '943', name: 'Mozambican Metical', symbol: 'MT', decimals: 2 },
  { code: 'NAD', numeric: '516', name: 'Namibian Dollar', symbol: 'N$', decimals: 2 },
  { code: 'RWF', numeric: '646', name: 'Rwandan Franc', symbol: 'RF', decimals: 0 },
  { code: 'SCR', numeric: '690', name: 'Seychellois Rupee', symbol: 'SRe', decimals: 2 },
  { code: 'SDG', numeric: '938', name: 'Sudanese Pound', symbol: 'SDG', decimals: 2 },
  { code: 'SHP', numeric: '654', name: 'Saint Helena Pound', symbol: '\u00A3', decimals: 2 },
  { code: 'SLE', numeric: '925', name: 'Sierra Leonean Leone', symbol: 'Le', decimals: 2 },
  { code: 'SOS', numeric: '706', name: 'Somali Shilling', symbol: 'Sh', decimals: 2 },
  { code: 'SSP', numeric: '728', name: 'South Sudanese Pound', symbol: 'SSP', decimals: 2 },
  { code: 'STN', numeric: '930', name: 'S\u00E3o Tom\u00E9 and Pr\u00EDncipe Dobra', symbol: 'Db', decimals: 2 },
  { code: 'SZL', numeric: '748', name: 'Eswatini Lilangeni', symbol: 'E', decimals: 2 },
  { code: 'TND', numeric: '788', name: 'Tunisian Dinar', symbol: 'DT', decimals: 3 },
  { code: 'XAF', numeric: '950', name: 'Central African CFA Franc', symbol: 'FCFA', decimals: 0 },
  { code: 'XOF', numeric: '952', name: 'West African CFA Franc', symbol: 'CFA', decimals: 0 },
  { code: 'ZAR', numeric: '710', name: 'South African Rand', symbol: 'R', decimals: 2 },
  { code: 'ZMW', numeric: '967', name: 'Zambian Kwacha', symbol: 'ZK', decimals: 2 },
  { code: 'ZWL', numeric: '932', name: 'Zimbabwean Dollar', symbol: 'Z$', decimals: 2 },
];

// ── Major global currencies ──────────────────────────────────────────
const GLOBAL_CURRENCIES: Currency[] = [
  { code: 'EUR', numeric: '978', name: 'Euro', symbol: '\u20AC', decimals: 2 },
  { code: 'GBP', numeric: '826', name: 'British Pound Sterling', symbol: '\u00A3', decimals: 2 },
  { code: 'JPY', numeric: '392', name: 'Japanese Yen', symbol: '\u00A5', decimals: 0 },
  { code: 'CHF', numeric: '756', name: 'Swiss Franc', symbol: 'CHF', decimals: 2 },
  { code: 'CAD', numeric: '124', name: 'Canadian Dollar', symbol: 'CA$', decimals: 2 },
  { code: 'AUD', numeric: '036', name: 'Australian Dollar', symbol: 'A$', decimals: 2 },
  { code: 'CNY', numeric: '156', name: 'Chinese Yuan', symbol: '\u00A5', decimals: 2 },
  { code: 'INR', numeric: '356', name: 'Indian Rupee', symbol: '\u20B9', decimals: 2 },
  { code: 'BRL', numeric: '986', name: 'Brazilian Real', symbol: 'R$', decimals: 2 },
  { code: 'AED', numeric: '784', name: 'UAE Dirham', symbol: 'AED', decimals: 2 },
  { code: 'SAR', numeric: '682', name: 'Saudi Riyal', symbol: 'SAR', decimals: 2 },
  { code: 'SGD', numeric: '702', name: 'Singapore Dollar', symbol: 'S$', decimals: 2 },
  { code: 'HKD', numeric: '344', name: 'Hong Kong Dollar', symbol: 'HK$', decimals: 2 },
  { code: 'NZD', numeric: '554', name: 'New Zealand Dollar', symbol: 'NZ$', decimals: 2 },
  { code: 'SEK', numeric: '752', name: 'Swedish Krona', symbol: 'kr', decimals: 2 },
  { code: 'NOK', numeric: '578', name: 'Norwegian Krone', symbol: 'kr', decimals: 2 },
  { code: 'DKK', numeric: '208', name: 'Danish Krone', symbol: 'kr', decimals: 2 },
  { code: 'MXN', numeric: '484', name: 'Mexican Peso', symbol: 'MX$', decimals: 2 },
  { code: 'PLN', numeric: '985', name: 'Polish Zloty', symbol: 'z\u0142', decimals: 2 },
  { code: 'THB', numeric: '764', name: 'Thai Baht', symbol: '\u0E3F', decimals: 2 },
  { code: 'IDR', numeric: '360', name: 'Indonesian Rupiah', symbol: 'Rp', decimals: 2 },
  { code: 'MYR', numeric: '458', name: 'Malaysian Ringgit', symbol: 'RM', decimals: 2 },
  { code: 'PHP', numeric: '608', name: 'Philippine Peso', symbol: '\u20B1', decimals: 2 },
  { code: 'TRY', numeric: '949', name: 'Turkish Lira', symbol: '\u20BA', decimals: 2 },
  { code: 'KRW', numeric: '410', name: 'South Korean Won', symbol: '\u20A9', decimals: 0 },
  { code: 'COP', numeric: '170', name: 'Colombian Peso', symbol: 'COL$', decimals: 2 },
  { code: 'ARS', numeric: '032', name: 'Argentine Peso', symbol: 'AR$', decimals: 2 },
  { code: 'CLP', numeric: '152', name: 'Chilean Peso', symbol: 'CLP$', decimals: 0 },
  { code: 'PEN', numeric: '604', name: 'Peruvian Sol', symbol: 'S/', decimals: 2 },
  { code: 'CZK', numeric: '203', name: 'Czech Koruna', symbol: 'K\u010D', decimals: 2 },
  { code: 'HUF', numeric: '348', name: 'Hungarian Forint', symbol: 'Ft', decimals: 2 },
  { code: 'ILS', numeric: '376', name: 'Israeli New Shekel', symbol: '\u20AA', decimals: 2 },
  { code: 'QAR', numeric: '634', name: 'Qatari Riyal', symbol: 'QR', decimals: 2 },
  { code: 'KWD', numeric: '414', name: 'Kuwaiti Dinar', symbol: 'KD', decimals: 3 },
  { code: 'BHD', numeric: '048', name: 'Bahraini Dinar', symbol: 'BD', decimals: 3 },
  { code: 'OMR', numeric: '512', name: 'Omani Rial', symbol: 'OMR', decimals: 3 },
  { code: 'JOD', numeric: '400', name: 'Jordanian Dinar', symbol: 'JD', decimals: 3 },
  { code: 'PKR', numeric: '586', name: 'Pakistani Rupee', symbol: 'Rs', decimals: 2 },
  { code: 'BDT', numeric: '050', name: 'Bangladeshi Taka', symbol: '\u09F3', decimals: 2 },
  { code: 'LKR', numeric: '144', name: 'Sri Lankan Rupee', symbol: 'Rs', decimals: 2 },
  { code: 'VND', numeric: '704', name: 'Vietnamese Dong', symbol: '\u20AB', decimals: 0 },
  { code: 'TWD', numeric: '901', name: 'New Taiwan Dollar', symbol: 'NT$', decimals: 2 },
  { code: 'RON', numeric: '946', name: 'Romanian Leu', symbol: 'lei', decimals: 2 },
  { code: 'BGN', numeric: '975', name: 'Bulgarian Lev', symbol: 'лв', decimals: 2 },
  { code: 'HRK', numeric: '191', name: 'Croatian Kuna', symbol: 'kn', decimals: 2 },
  { code: 'UAH', numeric: '980', name: 'Ukrainian Hryvnia', symbol: '\u20B4', decimals: 2 },
  { code: 'RUB', numeric: '643', name: 'Russian Ruble', symbol: '\u20BD', decimals: 2 },
];

/** Complete list of all ISO 4217 currencies */
export const ALL_CURRENCIES: Currency[] = [
  ...PRIMARY_CURRENCIES,
  ...AFRICAN_CURRENCIES,
  ...GLOBAL_CURRENCIES,
];

/** Platform-primary currencies (used as defaults in African market dropdowns) */
export const PRIMARY_CURRENCY_LIST: Currency[] = PRIMARY_CURRENCIES;

/** All African currencies (primary + other African) */
export const AFRICAN_CURRENCY_LIST: Currency[] = [
  ...PRIMARY_CURRENCIES,
  ...AFRICAN_CURRENCIES,
];

/** Flat array of all currency codes */
export const ALL_CURRENCY_CODES: string[] = ALL_CURRENCIES.map((c) => c.code);

/** Flat array of primary currency codes */
export const PRIMARY_CURRENCY_CODES: string[] = PRIMARY_CURRENCIES.map((c) => c.code);

/** Lookup map: code -> Currency */
export const CURRENCY_MAP: Record<string, Currency> = Object.fromEntries(
  ALL_CURRENCIES.map((c) => [c.code, c]),
);

/** Get display label for a currency: "GHS - Ghanaian Cedi (GH₵)" */
export function currencyLabel(code: string): string {
  const c = CURRENCY_MAP[code];
  if (!c) return code;
  return `${c.code} - ${c.name}`;
}

/** Get symbol for a currency code */
export function currencySymbol(code: string): string {
  return CURRENCY_MAP[code]?.symbol ?? code;
}
