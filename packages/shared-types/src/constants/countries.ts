/**
 * ISO 3166-1 alpha-2 Country codes.
 * Each entry contains the 2-letter code, 3-letter code, numeric code,
 * country name, dial code, and optional flag emoji.
 *
 * Sorted with African countries first (platform focus),
 * then remaining countries alphabetically.
 */

export interface Country {
  /** ISO 3166-1 alpha-2 code (e.g. "GH") */
  code: string;
  /** ISO 3166-1 alpha-3 code (e.g. "GHA") */
  alpha3: string;
  /** ISO 3166-1 numeric code (e.g. "288") */
  numeric: string;
  /** Country name */
  name: string;
  /** International dial code (e.g. "+233") */
  dialCode: string;
  /** Flag emoji */
  flag: string;
  /** Whether this is a platform-primary country (African markets) */
  primary?: boolean;
}

// ── Platform-primary countries (core African markets) ─────────────────
const PRIMARY_COUNTRIES: Country[] = [
  { code: 'GH', alpha3: 'GHA', numeric: '288', name: 'Ghana', dialCode: '+233', flag: '\uD83C\uDDEC\uD83C\uDDED', primary: true },
  { code: 'KE', alpha3: 'KEN', numeric: '404', name: 'Kenya', dialCode: '+254', flag: '\uD83C\uDDF0\uD83C\uDDEA', primary: true },
  { code: 'NG', alpha3: 'NGA', numeric: '566', name: 'Nigeria', dialCode: '+234', flag: '\uD83C\uDDF3\uD83C\uDDEC', primary: true },
  { code: 'UG', alpha3: 'UGA', numeric: '800', name: 'Uganda', dialCode: '+256', flag: '\uD83C\uDDFA\uD83C\uDDEC', primary: true },
  { code: 'TZ', alpha3: 'TZA', numeric: '834', name: 'Tanzania', dialCode: '+255', flag: '\uD83C\uDDF9\uD83C\uDDFF', primary: true },
];

// ── Other African countries ───────────────────────────────────────────
const AFRICAN_COUNTRIES: Country[] = [
  { code: 'DZ', alpha3: 'DZA', numeric: '012', name: 'Algeria', dialCode: '+213', flag: '\uD83C\uDDE9\uD83C\uDDFF' },
  { code: 'AO', alpha3: 'AGO', numeric: '024', name: 'Angola', dialCode: '+244', flag: '\uD83C\uDDE6\uD83C\uDDF4' },
  { code: 'BJ', alpha3: 'BEN', numeric: '204', name: 'Benin', dialCode: '+229', flag: '\uD83C\uDDE7\uD83C\uDDEF' },
  { code: 'BW', alpha3: 'BWA', numeric: '072', name: 'Botswana', dialCode: '+267', flag: '\uD83C\uDDE7\uD83C\uDDFC' },
  { code: 'BF', alpha3: 'BFA', numeric: '854', name: 'Burkina Faso', dialCode: '+226', flag: '\uD83C\uDDE7\uD83C\uDDEB' },
  { code: 'BI', alpha3: 'BDI', numeric: '108', name: 'Burundi', dialCode: '+257', flag: '\uD83C\uDDE7\uD83C\uDDEE' },
  { code: 'CV', alpha3: 'CPV', numeric: '132', name: 'Cabo Verde', dialCode: '+238', flag: '\uD83C\uDDE8\uD83C\uDDFB' },
  { code: 'CM', alpha3: 'CMR', numeric: '120', name: 'Cameroon', dialCode: '+237', flag: '\uD83C\uDDE8\uD83C\uDDF2' },
  { code: 'CF', alpha3: 'CAF', numeric: '140', name: 'Central African Republic', dialCode: '+236', flag: '\uD83C\uDDE8\uD83C\uDDEB' },
  { code: 'TD', alpha3: 'TCD', numeric: '148', name: 'Chad', dialCode: '+235', flag: '\uD83C\uDDF9\uD83C\uDDE9' },
  { code: 'KM', alpha3: 'COM', numeric: '174', name: 'Comoros', dialCode: '+269', flag: '\uD83C\uDDF0\uD83C\uDDF2' },
  { code: 'CG', alpha3: 'COG', numeric: '178', name: 'Congo', dialCode: '+242', flag: '\uD83C\uDDE8\uD83C\uDDEC' },
  { code: 'CD', alpha3: 'COD', numeric: '180', name: 'DR Congo', dialCode: '+243', flag: '\uD83C\uDDE8\uD83C\uDDE9' },
  { code: 'CI', alpha3: 'CIV', numeric: '384', name: "C\u00F4te d'Ivoire", dialCode: '+225', flag: '\uD83C\uDDE8\uD83C\uDDEE' },
  { code: 'DJ', alpha3: 'DJI', numeric: '262', name: 'Djibouti', dialCode: '+253', flag: '\uD83C\uDDE9\uD83C\uDDEF' },
  { code: 'EG', alpha3: 'EGY', numeric: '818', name: 'Egypt', dialCode: '+20', flag: '\uD83C\uDDEA\uD83C\uDDEC' },
  { code: 'GQ', alpha3: 'GNQ', numeric: '226', name: 'Equatorial Guinea', dialCode: '+240', flag: '\uD83C\uDDEC\uD83C\uDDF6' },
  { code: 'ER', alpha3: 'ERI', numeric: '232', name: 'Eritrea', dialCode: '+291', flag: '\uD83C\uDDEA\uD83C\uDDF7' },
  { code: 'SZ', alpha3: 'SWZ', numeric: '748', name: 'Eswatini', dialCode: '+268', flag: '\uD83C\uDDF8\uD83C\uDDFF' },
  { code: 'ET', alpha3: 'ETH', numeric: '231', name: 'Ethiopia', dialCode: '+251', flag: '\uD83C\uDDEA\uD83C\uDDF9' },
  { code: 'GA', alpha3: 'GAB', numeric: '266', name: 'Gabon', dialCode: '+241', flag: '\uD83C\uDDEC\uD83C\uDDE6' },
  { code: 'GM', alpha3: 'GMB', numeric: '270', name: 'Gambia', dialCode: '+220', flag: '\uD83C\uDDEC\uD83C\uDDF2' },
  { code: 'GN', alpha3: 'GIN', numeric: '324', name: 'Guinea', dialCode: '+224', flag: '\uD83C\uDDEC\uD83C\uDDF3' },
  { code: 'GW', alpha3: 'GNB', numeric: '624', name: 'Guinea-Bissau', dialCode: '+245', flag: '\uD83C\uDDEC\uD83C\uDDFC' },
  { code: 'LS', alpha3: 'LSO', numeric: '426', name: 'Lesotho', dialCode: '+266', flag: '\uD83C\uDDF1\uD83C\uDDF8' },
  { code: 'LR', alpha3: 'LBR', numeric: '430', name: 'Liberia', dialCode: '+231', flag: '\uD83C\uDDF1\uD83C\uDDF7' },
  { code: 'LY', alpha3: 'LBY', numeric: '434', name: 'Libya', dialCode: '+218', flag: '\uD83C\uDDF1\uD83C\uDDFE' },
  { code: 'MG', alpha3: 'MDG', numeric: '450', name: 'Madagascar', dialCode: '+261', flag: '\uD83C\uDDF2\uD83C\uDDEC' },
  { code: 'MW', alpha3: 'MWI', numeric: '454', name: 'Malawi', dialCode: '+265', flag: '\uD83C\uDDF2\uD83C\uDDFC' },
  { code: 'ML', alpha3: 'MLI', numeric: '466', name: 'Mali', dialCode: '+223', flag: '\uD83C\uDDF2\uD83C\uDDF1' },
  { code: 'MR', alpha3: 'MRT', numeric: '478', name: 'Mauritania', dialCode: '+222', flag: '\uD83C\uDDF2\uD83C\uDDF7' },
  { code: 'MU', alpha3: 'MUS', numeric: '480', name: 'Mauritius', dialCode: '+230', flag: '\uD83C\uDDF2\uD83C\uDDFA' },
  { code: 'MA', alpha3: 'MAR', numeric: '504', name: 'Morocco', dialCode: '+212', flag: '\uD83C\uDDF2\uD83C\uDDE6' },
  { code: 'MZ', alpha3: 'MOZ', numeric: '508', name: 'Mozambique', dialCode: '+258', flag: '\uD83C\uDDF2\uD83C\uDDFF' },
  { code: 'NA', alpha3: 'NAM', numeric: '516', name: 'Namibia', dialCode: '+264', flag: '\uD83C\uDDF3\uD83C\uDDE6' },
  { code: 'NE', alpha3: 'NER', numeric: '562', name: 'Niger', dialCode: '+227', flag: '\uD83C\uDDF3\uD83C\uDDEA' },
  { code: 'RW', alpha3: 'RWA', numeric: '646', name: 'Rwanda', dialCode: '+250', flag: '\uD83C\uDDF7\uD83C\uDDFC' },
  { code: 'ST', alpha3: 'STP', numeric: '678', name: 'S\u00E3o Tom\u00E9 and Pr\u00EDncipe', dialCode: '+239', flag: '\uD83C\uDDF8\uD83C\uDDF9' },
  { code: 'SN', alpha3: 'SEN', numeric: '686', name: 'Senegal', dialCode: '+221', flag: '\uD83C\uDDF8\uD83C\uDDF3' },
  { code: 'SC', alpha3: 'SYC', numeric: '690', name: 'Seychelles', dialCode: '+248', flag: '\uD83C\uDDF8\uD83C\uDDE8' },
  { code: 'SL', alpha3: 'SLE', numeric: '694', name: 'Sierra Leone', dialCode: '+232', flag: '\uD83C\uDDF8\uD83C\uDDF1' },
  { code: 'SO', alpha3: 'SOM', numeric: '706', name: 'Somalia', dialCode: '+252', flag: '\uD83C\uDDF8\uD83C\uDDF4' },
  { code: 'ZA', alpha3: 'ZAF', numeric: '710', name: 'South Africa', dialCode: '+27', flag: '\uD83C\uDDFF\uD83C\uDDE6' },
  { code: 'SS', alpha3: 'SSD', numeric: '728', name: 'South Sudan', dialCode: '+211', flag: '\uD83C\uDDF8\uD83C\uDDF8' },
  { code: 'SD', alpha3: 'SDN', numeric: '729', name: 'Sudan', dialCode: '+249', flag: '\uD83C\uDDF8\uD83C\uDDE9' },
  { code: 'TG', alpha3: 'TGO', numeric: '768', name: 'Togo', dialCode: '+228', flag: '\uD83C\uDDF9\uD83C\uDDEC' },
  { code: 'TN', alpha3: 'TUN', numeric: '788', name: 'Tunisia', dialCode: '+216', flag: '\uD83C\uDDF9\uD83C\uDDF3' },
  { code: 'ZM', alpha3: 'ZMB', numeric: '894', name: 'Zambia', dialCode: '+260', flag: '\uD83C\uDDFF\uD83C\uDDF2' },
  { code: 'ZW', alpha3: 'ZWE', numeric: '716', name: 'Zimbabwe', dialCode: '+263', flag: '\uD83C\uDDFF\uD83C\uDDFC' },
];

// ── Rest of the world (alphabetical) ─────────────────────────────────
const GLOBAL_COUNTRIES: Country[] = [
  { code: 'AF', alpha3: 'AFG', numeric: '004', name: 'Afghanistan', dialCode: '+93', flag: '\uD83C\uDDE6\uD83C\uDDEB' },
  { code: 'AL', alpha3: 'ALB', numeric: '008', name: 'Albania', dialCode: '+355', flag: '\uD83C\uDDE6\uD83C\uDDF1' },
  { code: 'AD', alpha3: 'AND', numeric: '020', name: 'Andorra', dialCode: '+376', flag: '\uD83C\uDDE6\uD83C\uDDE9' },
  { code: 'AG', alpha3: 'ATG', numeric: '028', name: 'Antigua and Barbuda', dialCode: '+1-268', flag: '\uD83C\uDDE6\uD83C\uDDEC' },
  { code: 'AR', alpha3: 'ARG', numeric: '032', name: 'Argentina', dialCode: '+54', flag: '\uD83C\uDDE6\uD83C\uDDF7' },
  { code: 'AM', alpha3: 'ARM', numeric: '051', name: 'Armenia', dialCode: '+374', flag: '\uD83C\uDDE6\uD83C\uDDF2' },
  { code: 'AU', alpha3: 'AUS', numeric: '036', name: 'Australia', dialCode: '+61', flag: '\uD83C\uDDE6\uD83C\uDDFA' },
  { code: 'AT', alpha3: 'AUT', numeric: '040', name: 'Austria', dialCode: '+43', flag: '\uD83C\uDDE6\uD83C\uDDF9' },
  { code: 'AZ', alpha3: 'AZE', numeric: '031', name: 'Azerbaijan', dialCode: '+994', flag: '\uD83C\uDDE6\uD83C\uDDFF' },
  { code: 'BS', alpha3: 'BHS', numeric: '044', name: 'Bahamas', dialCode: '+1-242', flag: '\uD83C\uDDE7\uD83C\uDDF8' },
  { code: 'BH', alpha3: 'BHR', numeric: '048', name: 'Bahrain', dialCode: '+973', flag: '\uD83C\uDDE7\uD83C\uDDED' },
  { code: 'BD', alpha3: 'BGD', numeric: '050', name: 'Bangladesh', dialCode: '+880', flag: '\uD83C\uDDE7\uD83C\uDDE9' },
  { code: 'BB', alpha3: 'BRB', numeric: '052', name: 'Barbados', dialCode: '+1-246', flag: '\uD83C\uDDE7\uD83C\uDDE7' },
  { code: 'BY', alpha3: 'BLR', numeric: '112', name: 'Belarus', dialCode: '+375', flag: '\uD83C\uDDE7\uD83C\uDDFE' },
  { code: 'BE', alpha3: 'BEL', numeric: '056', name: 'Belgium', dialCode: '+32', flag: '\uD83C\uDDE7\uD83C\uDDEA' },
  { code: 'BZ', alpha3: 'BLZ', numeric: '084', name: 'Belize', dialCode: '+501', flag: '\uD83C\uDDE7\uD83C\uDDFF' },
  { code: 'BT', alpha3: 'BTN', numeric: '064', name: 'Bhutan', dialCode: '+975', flag: '\uD83C\uDDE7\uD83C\uDDF9' },
  { code: 'BO', alpha3: 'BOL', numeric: '068', name: 'Bolivia', dialCode: '+591', flag: '\uD83C\uDDE7\uD83C\uDDF4' },
  { code: 'BA', alpha3: 'BIH', numeric: '070', name: 'Bosnia and Herzegovina', dialCode: '+387', flag: '\uD83C\uDDE7\uD83C\uDDE6' },
  { code: 'BR', alpha3: 'BRA', numeric: '076', name: 'Brazil', dialCode: '+55', flag: '\uD83C\uDDE7\uD83C\uDDF7' },
  { code: 'BN', alpha3: 'BRN', numeric: '096', name: 'Brunei', dialCode: '+673', flag: '\uD83C\uDDE7\uD83C\uDDF3' },
  { code: 'BG', alpha3: 'BGR', numeric: '100', name: 'Bulgaria', dialCode: '+359', flag: '\uD83C\uDDE7\uD83C\uDDEC' },
  { code: 'KH', alpha3: 'KHM', numeric: '116', name: 'Cambodia', dialCode: '+855', flag: '\uD83C\uDDF0\uD83C\uDDED' },
  { code: 'CA', alpha3: 'CAN', numeric: '124', name: 'Canada', dialCode: '+1', flag: '\uD83C\uDDE8\uD83C\uDDE6' },
  { code: 'CL', alpha3: 'CHL', numeric: '152', name: 'Chile', dialCode: '+56', flag: '\uD83C\uDDE8\uD83C\uDDF1' },
  { code: 'CN', alpha3: 'CHN', numeric: '156', name: 'China', dialCode: '+86', flag: '\uD83C\uDDE8\uD83C\uDDF3' },
  { code: 'CO', alpha3: 'COL', numeric: '170', name: 'Colombia', dialCode: '+57', flag: '\uD83C\uDDE8\uD83C\uDDF4' },
  { code: 'CR', alpha3: 'CRI', numeric: '188', name: 'Costa Rica', dialCode: '+506', flag: '\uD83C\uDDE8\uD83C\uDDF7' },
  { code: 'HR', alpha3: 'HRV', numeric: '191', name: 'Croatia', dialCode: '+385', flag: '\uD83C\uDDED\uD83C\uDDF7' },
  { code: 'CU', alpha3: 'CUB', numeric: '192', name: 'Cuba', dialCode: '+53', flag: '\uD83C\uDDE8\uD83C\uDDFA' },
  { code: 'CY', alpha3: 'CYP', numeric: '196', name: 'Cyprus', dialCode: '+357', flag: '\uD83C\uDDE8\uD83C\uDDFE' },
  { code: 'CZ', alpha3: 'CZE', numeric: '203', name: 'Czechia', dialCode: '+420', flag: '\uD83C\uDDE8\uD83C\uDDFF' },
  { code: 'DK', alpha3: 'DNK', numeric: '208', name: 'Denmark', dialCode: '+45', flag: '\uD83C\uDDE9\uD83C\uDDF0' },
  { code: 'DM', alpha3: 'DMA', numeric: '212', name: 'Dominica', dialCode: '+1-767', flag: '\uD83C\uDDE9\uD83C\uDDF2' },
  { code: 'DO', alpha3: 'DOM', numeric: '214', name: 'Dominican Republic', dialCode: '+1-809', flag: '\uD83C\uDDE9\uD83C\uDDF4' },
  { code: 'EC', alpha3: 'ECU', numeric: '218', name: 'Ecuador', dialCode: '+593', flag: '\uD83C\uDDEA\uD83C\uDDE8' },
  { code: 'SV', alpha3: 'SLV', numeric: '222', name: 'El Salvador', dialCode: '+503', flag: '\uD83C\uDDF8\uD83C\uDDFB' },
  { code: 'EE', alpha3: 'EST', numeric: '233', name: 'Estonia', dialCode: '+372', flag: '\uD83C\uDDEA\uD83C\uDDEA' },
  { code: 'FJ', alpha3: 'FJI', numeric: '242', name: 'Fiji', dialCode: '+679', flag: '\uD83C\uDDEB\uD83C\uDDEF' },
  { code: 'FI', alpha3: 'FIN', numeric: '246', name: 'Finland', dialCode: '+358', flag: '\uD83C\uDDEB\uD83C\uDDEE' },
  { code: 'FR', alpha3: 'FRA', numeric: '250', name: 'France', dialCode: '+33', flag: '\uD83C\uDDEB\uD83C\uDDF7' },
  { code: 'GE', alpha3: 'GEO', numeric: '268', name: 'Georgia', dialCode: '+995', flag: '\uD83C\uDDEC\uD83C\uDDEA' },
  { code: 'DE', alpha3: 'DEU', numeric: '276', name: 'Germany', dialCode: '+49', flag: '\uD83C\uDDE9\uD83C\uDDEA' },
  { code: 'GR', alpha3: 'GRC', numeric: '300', name: 'Greece', dialCode: '+30', flag: '\uD83C\uDDEC\uD83C\uDDF7' },
  { code: 'GT', alpha3: 'GTM', numeric: '320', name: 'Guatemala', dialCode: '+502', flag: '\uD83C\uDDEC\uD83C\uDDF9' },
  { code: 'GY', alpha3: 'GUY', numeric: '328', name: 'Guyana', dialCode: '+592', flag: '\uD83C\uDDEC\uD83C\uDDFE' },
  { code: 'HT', alpha3: 'HTI', numeric: '332', name: 'Haiti', dialCode: '+509', flag: '\uD83C\uDDED\uD83C\uDDF9' },
  { code: 'HN', alpha3: 'HND', numeric: '340', name: 'Honduras', dialCode: '+504', flag: '\uD83C\uDDED\uD83C\uDDF3' },
  { code: 'HU', alpha3: 'HUN', numeric: '348', name: 'Hungary', dialCode: '+36', flag: '\uD83C\uDDED\uD83C\uDDFA' },
  { code: 'IS', alpha3: 'ISL', numeric: '352', name: 'Iceland', dialCode: '+354', flag: '\uD83C\uDDEE\uD83C\uDDF8' },
  { code: 'IN', alpha3: 'IND', numeric: '356', name: 'India', dialCode: '+91', flag: '\uD83C\uDDEE\uD83C\uDDF3' },
  { code: 'ID', alpha3: 'IDN', numeric: '360', name: 'Indonesia', dialCode: '+62', flag: '\uD83C\uDDEE\uD83C\uDDE9' },
  { code: 'IR', alpha3: 'IRN', numeric: '364', name: 'Iran', dialCode: '+98', flag: '\uD83C\uDDEE\uD83C\uDDF7' },
  { code: 'IQ', alpha3: 'IRQ', numeric: '368', name: 'Iraq', dialCode: '+964', flag: '\uD83C\uDDEE\uD83C\uDDF6' },
  { code: 'IE', alpha3: 'IRL', numeric: '372', name: 'Ireland', dialCode: '+353', flag: '\uD83C\uDDEE\uD83C\uDDEA' },
  { code: 'IL', alpha3: 'ISR', numeric: '376', name: 'Israel', dialCode: '+972', flag: '\uD83C\uDDEE\uD83C\uDDF1' },
  { code: 'IT', alpha3: 'ITA', numeric: '380', name: 'Italy', dialCode: '+39', flag: '\uD83C\uDDEE\uD83C\uDDF9' },
  { code: 'JM', alpha3: 'JAM', numeric: '388', name: 'Jamaica', dialCode: '+1-876', flag: '\uD83C\uDDEF\uD83C\uDDF2' },
  { code: 'JP', alpha3: 'JPN', numeric: '392', name: 'Japan', dialCode: '+81', flag: '\uD83C\uDDEF\uD83C\uDDF5' },
  { code: 'JO', alpha3: 'JOR', numeric: '400', name: 'Jordan', dialCode: '+962', flag: '\uD83C\uDDEF\uD83C\uDDF4' },
  { code: 'KZ', alpha3: 'KAZ', numeric: '398', name: 'Kazakhstan', dialCode: '+7', flag: '\uD83C\uDDF0\uD83C\uDDFF' },
  { code: 'KW', alpha3: 'KWT', numeric: '414', name: 'Kuwait', dialCode: '+965', flag: '\uD83C\uDDF0\uD83C\uDDFC' },
  { code: 'KG', alpha3: 'KGZ', numeric: '417', name: 'Kyrgyzstan', dialCode: '+996', flag: '\uD83C\uDDF0\uD83C\uDDEC' },
  { code: 'LA', alpha3: 'LAO', numeric: '418', name: 'Laos', dialCode: '+856', flag: '\uD83C\uDDF1\uD83C\uDDE6' },
  { code: 'LV', alpha3: 'LVA', numeric: '428', name: 'Latvia', dialCode: '+371', flag: '\uD83C\uDDF1\uD83C\uDDFB' },
  { code: 'LB', alpha3: 'LBN', numeric: '422', name: 'Lebanon', dialCode: '+961', flag: '\uD83C\uDDF1\uD83C\uDDE7' },
  { code: 'LI', alpha3: 'LIE', numeric: '438', name: 'Liechtenstein', dialCode: '+423', flag: '\uD83C\uDDF1\uD83C\uDDEE' },
  { code: 'LT', alpha3: 'LTU', numeric: '440', name: 'Lithuania', dialCode: '+370', flag: '\uD83C\uDDF1\uD83C\uDDF9' },
  { code: 'LU', alpha3: 'LUX', numeric: '442', name: 'Luxembourg', dialCode: '+352', flag: '\uD83C\uDDF1\uD83C\uDDFA' },
  { code: 'MY', alpha3: 'MYS', numeric: '458', name: 'Malaysia', dialCode: '+60', flag: '\uD83C\uDDF2\uD83C\uDDFE' },
  { code: 'MV', alpha3: 'MDV', numeric: '462', name: 'Maldives', dialCode: '+960', flag: '\uD83C\uDDF2\uD83C\uDDFB' },
  { code: 'MT', alpha3: 'MLT', numeric: '470', name: 'Malta', dialCode: '+356', flag: '\uD83C\uDDF2\uD83C\uDDF9' },
  { code: 'MX', alpha3: 'MEX', numeric: '484', name: 'Mexico', dialCode: '+52', flag: '\uD83C\uDDF2\uD83C\uDDFD' },
  { code: 'MD', alpha3: 'MDA', numeric: '498', name: 'Moldova', dialCode: '+373', flag: '\uD83C\uDDF2\uD83C\uDDE9' },
  { code: 'MC', alpha3: 'MCO', numeric: '492', name: 'Monaco', dialCode: '+377', flag: '\uD83C\uDDF2\uD83C\uDDE8' },
  { code: 'MN', alpha3: 'MNG', numeric: '496', name: 'Mongolia', dialCode: '+976', flag: '\uD83C\uDDF2\uD83C\uDDF3' },
  { code: 'ME', alpha3: 'MNE', numeric: '499', name: 'Montenegro', dialCode: '+382', flag: '\uD83C\uDDF2\uD83C\uDDEA' },
  { code: 'MM', alpha3: 'MMR', numeric: '104', name: 'Myanmar', dialCode: '+95', flag: '\uD83C\uDDF2\uD83C\uDDF2' },
  { code: 'NP', alpha3: 'NPL', numeric: '524', name: 'Nepal', dialCode: '+977', flag: '\uD83C\uDDF3\uD83C\uDDF5' },
  { code: 'NL', alpha3: 'NLD', numeric: '528', name: 'Netherlands', dialCode: '+31', flag: '\uD83C\uDDF3\uD83C\uDDF1' },
  { code: 'NZ', alpha3: 'NZL', numeric: '554', name: 'New Zealand', dialCode: '+64', flag: '\uD83C\uDDF3\uD83C\uDDFF' },
  { code: 'NI', alpha3: 'NIC', numeric: '558', name: 'Nicaragua', dialCode: '+505', flag: '\uD83C\uDDF3\uD83C\uDDEE' },
  { code: 'KP', alpha3: 'PRK', numeric: '408', name: 'North Korea', dialCode: '+850', flag: '\uD83C\uDDF0\uD83C\uDDF5' },
  { code: 'MK', alpha3: 'MKD', numeric: '807', name: 'North Macedonia', dialCode: '+389', flag: '\uD83C\uDDF2\uD83C\uDDF0' },
  { code: 'NO', alpha3: 'NOR', numeric: '578', name: 'Norway', dialCode: '+47', flag: '\uD83C\uDDF3\uD83C\uDDF4' },
  { code: 'OM', alpha3: 'OMN', numeric: '512', name: 'Oman', dialCode: '+968', flag: '\uD83C\uDDF4\uD83C\uDDF2' },
  { code: 'PK', alpha3: 'PAK', numeric: '586', name: 'Pakistan', dialCode: '+92', flag: '\uD83C\uDDF5\uD83C\uDDF0' },
  { code: 'PA', alpha3: 'PAN', numeric: '591', name: 'Panama', dialCode: '+507', flag: '\uD83C\uDDF5\uD83C\uDDE6' },
  { code: 'PG', alpha3: 'PNG', numeric: '598', name: 'Papua New Guinea', dialCode: '+675', flag: '\uD83C\uDDF5\uD83C\uDDEC' },
  { code: 'PY', alpha3: 'PRY', numeric: '600', name: 'Paraguay', dialCode: '+595', flag: '\uD83C\uDDF5\uD83C\uDDFE' },
  { code: 'PE', alpha3: 'PER', numeric: '604', name: 'Peru', dialCode: '+51', flag: '\uD83C\uDDF5\uD83C\uDDEA' },
  { code: 'PH', alpha3: 'PHL', numeric: '608', name: 'Philippines', dialCode: '+63', flag: '\uD83C\uDDF5\uD83C\uDDED' },
  { code: 'PL', alpha3: 'POL', numeric: '616', name: 'Poland', dialCode: '+48', flag: '\uD83C\uDDF5\uD83C\uDDF1' },
  { code: 'PT', alpha3: 'PRT', numeric: '620', name: 'Portugal', dialCode: '+351', flag: '\uD83C\uDDF5\uD83C\uDDF9' },
  { code: 'QA', alpha3: 'QAT', numeric: '634', name: 'Qatar', dialCode: '+974', flag: '\uD83C\uDDF6\uD83C\uDDE6' },
  { code: 'RO', alpha3: 'ROU', numeric: '642', name: 'Romania', dialCode: '+40', flag: '\uD83C\uDDF7\uD83C\uDDF4' },
  { code: 'RU', alpha3: 'RUS', numeric: '643', name: 'Russia', dialCode: '+7', flag: '\uD83C\uDDF7\uD83C\uDDFA' },
  { code: 'KN', alpha3: 'KNA', numeric: '659', name: 'Saint Kitts and Nevis', dialCode: '+1-869', flag: '\uD83C\uDDF0\uD83C\uDDF3' },
  { code: 'LC', alpha3: 'LCA', numeric: '662', name: 'Saint Lucia', dialCode: '+1-758', flag: '\uD83C\uDDF1\uD83C\uDDE8' },
  { code: 'WS', alpha3: 'WSM', numeric: '882', name: 'Samoa', dialCode: '+685', flag: '\uD83C\uDDFC\uD83C\uDDF8' },
  { code: 'SM', alpha3: 'SMR', numeric: '674', name: 'San Marino', dialCode: '+378', flag: '\uD83C\uDDF8\uD83C\uDDF2' },
  { code: 'SA', alpha3: 'SAU', numeric: '682', name: 'Saudi Arabia', dialCode: '+966', flag: '\uD83C\uDDF8\uD83C\uDDE6' },
  { code: 'RS', alpha3: 'SRB', numeric: '688', name: 'Serbia', dialCode: '+381', flag: '\uD83C\uDDF7\uD83C\uDDF8' },
  { code: 'SG', alpha3: 'SGP', numeric: '702', name: 'Singapore', dialCode: '+65', flag: '\uD83C\uDDF8\uD83C\uDDEC' },
  { code: 'SK', alpha3: 'SVK', numeric: '703', name: 'Slovakia', dialCode: '+421', flag: '\uD83C\uDDF8\uD83C\uDDF0' },
  { code: 'SI', alpha3: 'SVN', numeric: '705', name: 'Slovenia', dialCode: '+386', flag: '\uD83C\uDDF8\uD83C\uDDEE' },
  { code: 'SB', alpha3: 'SLB', numeric: '090', name: 'Solomon Islands', dialCode: '+677', flag: '\uD83C\uDDF8\uD83C\uDDE7' },
  { code: 'KR', alpha3: 'KOR', numeric: '410', name: 'South Korea', dialCode: '+82', flag: '\uD83C\uDDF0\uD83C\uDDF7' },
  { code: 'ES', alpha3: 'ESP', numeric: '724', name: 'Spain', dialCode: '+34', flag: '\uD83C\uDDEA\uD83C\uDDF8' },
  { code: 'LK', alpha3: 'LKA', numeric: '144', name: 'Sri Lanka', dialCode: '+94', flag: '\uD83C\uDDF1\uD83C\uDDF0' },
  { code: 'SR', alpha3: 'SUR', numeric: '740', name: 'Suriname', dialCode: '+597', flag: '\uD83C\uDDF8\uD83C\uDDF7' },
  { code: 'SE', alpha3: 'SWE', numeric: '752', name: 'Sweden', dialCode: '+46', flag: '\uD83C\uDDF8\uD83C\uDDEA' },
  { code: 'CH', alpha3: 'CHE', numeric: '756', name: 'Switzerland', dialCode: '+41', flag: '\uD83C\uDDE8\uD83C\uDDED' },
  { code: 'SY', alpha3: 'SYR', numeric: '760', name: 'Syria', dialCode: '+963', flag: '\uD83C\uDDF8\uD83C\uDDFE' },
  { code: 'TW', alpha3: 'TWN', numeric: '158', name: 'Taiwan', dialCode: '+886', flag: '\uD83C\uDDF9\uD83C\uDDFC' },
  { code: 'TJ', alpha3: 'TJK', numeric: '762', name: 'Tajikistan', dialCode: '+992', flag: '\uD83C\uDDF9\uD83C\uDDEF' },
  { code: 'TH', alpha3: 'THA', numeric: '764', name: 'Thailand', dialCode: '+66', flag: '\uD83C\uDDF9\uD83C\uDDED' },
  { code: 'TL', alpha3: 'TLS', numeric: '626', name: 'Timor-Leste', dialCode: '+670', flag: '\uD83C\uDDF9\uD83C\uDDF1' },
  { code: 'TO', alpha3: 'TON', numeric: '776', name: 'Tonga', dialCode: '+676', flag: '\uD83C\uDDF9\uD83C\uDDF4' },
  { code: 'TT', alpha3: 'TTO', numeric: '780', name: 'Trinidad and Tobago', dialCode: '+1-868', flag: '\uD83C\uDDF9\uD83C\uDDF9' },
  { code: 'TR', alpha3: 'TUR', numeric: '792', name: 'Turkey', dialCode: '+90', flag: '\uD83C\uDDF9\uD83C\uDDF7' },
  { code: 'TM', alpha3: 'TKM', numeric: '795', name: 'Turkmenistan', dialCode: '+993', flag: '\uD83C\uDDF9\uD83C\uDDF2' },
  { code: 'TV', alpha3: 'TUV', numeric: '798', name: 'Tuvalu', dialCode: '+688', flag: '\uD83C\uDDF9\uD83C\uDDFB' },
  { code: 'UA', alpha3: 'UKR', numeric: '804', name: 'Ukraine', dialCode: '+380', flag: '\uD83C\uDDFA\uD83C\uDDE6' },
  { code: 'AE', alpha3: 'ARE', numeric: '784', name: 'United Arab Emirates', dialCode: '+971', flag: '\uD83C\uDDE6\uD83C\uDDEA' },
  { code: 'GB', alpha3: 'GBR', numeric: '826', name: 'United Kingdom', dialCode: '+44', flag: '\uD83C\uDDEC\uD83C\uDDE7' },
  { code: 'US', alpha3: 'USA', numeric: '840', name: 'United States', dialCode: '+1', flag: '\uD83C\uDDFA\uD83C\uDDF8' },
  { code: 'UY', alpha3: 'URY', numeric: '858', name: 'Uruguay', dialCode: '+598', flag: '\uD83C\uDDFA\uD83C\uDDFE' },
  { code: 'UZ', alpha3: 'UZB', numeric: '860', name: 'Uzbekistan', dialCode: '+998', flag: '\uD83C\uDDFA\uD83C\uDDFF' },
  { code: 'VU', alpha3: 'VUT', numeric: '548', name: 'Vanuatu', dialCode: '+678', flag: '\uD83C\uDDFB\uD83C\uDDFA' },
  { code: 'VE', alpha3: 'VEN', numeric: '862', name: 'Venezuela', dialCode: '+58', flag: '\uD83C\uDDFB\uD83C\uDDEA' },
  { code: 'VN', alpha3: 'VNM', numeric: '704', name: 'Vietnam', dialCode: '+84', flag: '\uD83C\uDDFB\uD83C\uDDF3' },
  { code: 'YE', alpha3: 'YEM', numeric: '887', name: 'Yemen', dialCode: '+967', flag: '\uD83C\uDDFE\uD83C\uDDEA' },
];

/** Complete list of all ISO 3166 countries */
export const ALL_COUNTRIES: Country[] = [
  ...PRIMARY_COUNTRIES,
  ...AFRICAN_COUNTRIES,
  ...GLOBAL_COUNTRIES,
];

/** Platform-primary countries (core African markets) */
export const PRIMARY_COUNTRY_LIST: Country[] = PRIMARY_COUNTRIES;

/** All African countries (primary + other African) */
export const AFRICAN_COUNTRY_LIST: Country[] = [
  ...PRIMARY_COUNTRIES,
  ...AFRICAN_COUNTRIES,
];

/** Flat array of all country codes */
export const ALL_COUNTRY_CODES: string[] = ALL_COUNTRIES.map((c) => c.code);

/** Flat array of primary country codes */
export const PRIMARY_COUNTRY_CODES: string[] = PRIMARY_COUNTRIES.map((c) => c.code);

/** Lookup map: code -> Country */
export const COUNTRY_MAP: Record<string, Country> = Object.fromEntries(
  ALL_COUNTRIES.map((c) => [c.code, c]),
);

/** Get display label for a country: "GH - Ghana" */
export function countryLabel(code: string): string {
  const c = COUNTRY_MAP[code];
  if (!c) return code;
  return `${c.flag} ${c.name}`;
}

/** Get country name for a code */
export function countryName(code: string): string {
  return COUNTRY_MAP[code]?.name ?? code;
}
