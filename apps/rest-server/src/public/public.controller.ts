import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '@lons/database';
import { Public } from '@lons/entity-service';

// ISO 3-letter country code → financial capital / primary business hub
const COUNTRY_TO_CITY: Record<string, string> = {
  NGA: 'Lagos',
  KEN: 'Nairobi',
  GHA: 'Accra',
  ZAF: 'Johannesburg',
  EGY: 'Cairo',
  RWA: 'Kigali',
  SEN: 'Dakar',
  ETH: 'Addis Ababa',
  UGA: 'Kampala',
  TZA: 'Dar es Salaam',
  ZMB: 'Lusaka',
  CIV: 'Abidjan',
  MAR: 'Casablanca',
  CMR: 'Douala',
  IND: 'Mumbai',
};

// ISO 3-letter → ISO 2-letter (display code shown in the rotator)
const COUNTRY_CODE2: Record<string, string> = {
  NGA: 'NG',
  KEN: 'KE',
  GHA: 'GH',
  ZAF: 'ZA',
  EGY: 'EG',
  RWA: 'RW',
  SEN: 'SN',
  ETH: 'ET',
  UGA: 'UG',
  TZA: 'TZ',
  ZMB: 'ZM',
  CIV: 'CI',
  MAR: 'MA',
  CMR: 'CM',
  IND: 'IN',
};

interface FootprintCity {
  city: string;
  country: string; // ISO-3
  code: string; // ISO-2 for display
}

@Controller('public')
export class PublicController {
  constructor(private readonly prisma: PrismaService) {}

  // GET /v1/public/footprint
  // Returns cities where Lōns has active tenants. Unauthenticated — used by
  // the login screen to power the rotating "Active in ..." indicator.
  @Public()
  @Get('footprint')
  async getFootprint(): Promise<{ cities: FootprintCity[] }> {
    const rows = await this.prisma.tenant.findMany({
      where: { status: 'active', deletedAt: null },
      select: { country: true },
      distinct: ['country'],
    });
    const cities: FootprintCity[] = rows
      .map((r) => ({
        country: r.country,
        city: COUNTRY_TO_CITY[r.country],
        code: COUNTRY_CODE2[r.country] ?? r.country.slice(0, 2),
      }))
      .filter((c): c is FootprintCity => Boolean(c.city))
      .sort((a, b) => a.city.localeCompare(b.city));
    return { cities };
  }
}
