'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence, useMotionValue, useTransform, useSpring } from 'framer-motion';
import { useAuth, MfaEnrollmentRequiredError } from '@/lib/auth-context';
import { useI18n } from '@/lib/i18n/i18n-context';
import { Providers } from '../providers';
import { useTheme } from '@/lib/theme-context';
import { Loader2, AlertCircle, ArrowRight, Sun, Moon, ShieldAlert } from 'lucide-react';

// Entry animations use CSS (animation-delay cascade via --stagger) so they
// render regardless of document.visibilityState. Framer-motion is reserved
// for interactive + perpetual effects (orb drift, logo float, magnetic
// hover, error banner spring).

// Deterministic pseudo-random — stable across renders, avoids hydration drift.
function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

interface City {
  city: string;
  code: string; // ISO-2
}

// Fallback used while the fetch is in flight or if the API is unreachable.
// Real cities come from GET /v1/public/footprint (tenant records).
const FALLBACK_CITIES: City[] = [
  { city: 'Lagos', code: 'NG' },
  { city: 'Nairobi', code: 'KE' },
  { city: 'Accra', code: 'GH' },
];

function useFootprint(): City[] {
  const [cities, setCities] = useState<City[]>(FALLBACK_CITIES);
  useEffect(() => {
    const base = process.env.NEXT_PUBLIC_REST_URL || 'http://localhost:3001';
    const ctrl = new AbortController();
    fetch(`${base}/v1/public/footprint`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((body) => {
        const list: City[] | undefined = body?.data?.cities?.map((c: any) => ({
          city: c.city,
          code: c.code,
        }));
        if (list && list.length > 0) setCities(list);
      })
      .catch(() => {
        // Keep fallback — silent. Login screen must render even if API is down.
      });
    return () => ctrl.abort();
  }, []);
  return cities;
}

function CityRotator({ cities }: { cities: City[] }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (cities.length <= 1) return;
    const id = setInterval(() => setI((n) => (n + 1) % cities.length), 2200);
    return () => clearInterval(id);
  }, [cities.length]);
  // Clamp index if list shrinks after a refetch
  const safeI = i % Math.max(cities.length, 1);
  const current = cities[safeI] ?? FALLBACK_CITIES[0];
  const longest = cities.reduce((a, b) => (b.city.length > a.city.length ? b : a), current);
  return (
    <span className="relative inline-block align-baseline">
      <span className="invisible inline-flex items-baseline gap-1.5 whitespace-nowrap">
        <span className="font-medium">{longest.city}</span>
        <span className="text-[10px] font-semibold tracking-[0.12em]">{longest.code}</span>
      </span>
      <AnimatePresence initial={false}>
        <motion.span
          key={current.city}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
          className="absolute inset-0 inline-flex items-baseline gap-1.5 whitespace-nowrap"
          style={{ willChange: 'transform, opacity' }}
        >
          <span className="font-medium text-[color:var(--text-primary)]">{current.city}</span>
          <span className="text-[10px] font-semibold tracking-[0.12em] text-[color:var(--text-tertiary)]">
            {current.code}
          </span>
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

function TwinklingStars() {
  const stars = useMemo(() => {
    const rand = seeded(1337);
    return Array.from({ length: 40 }, (_, i) => ({
      id: i,
      x: rand() * 100,
      y: rand() * 60, // only upper 60%
      size: 0.8 + rand() * 1.6,
      delay: rand() * 6,
      duration: 3 + rand() * 4,
      bright: rand() > 0.75,
    }));
  }, []);
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      {stars.map((s) => (
        <span
          key={s.id}
          className="absolute rounded-full"
          style={{
            left: `${s.x}%`,
            top: `${s.y}%`,
            width: s.size,
            height: s.size,
            background: s.bright ? 'var(--accent-secondary)' : 'rgba(255,240,210,0.9)',
            opacity: 0,
            animation: `twinkle ${s.duration}s ease-in-out ${s.delay}s infinite`,
            willChange: 'opacity, transform',
          }}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// African Financial District skyline — hand-crafted silhouettes of real
// landmark buildings arranged as a composite horizon. Each tower is an
// inline SVG path with proportional dimensions pulled from public data.
// ---------------------------------------------------------------------------

interface Landmark {
  name: string;
  city: string;
  x: number; // left edge
  render: (ctx: LandmarkCtx) => React.ReactNode;
}
interface LandmarkCtx {
  groundY: number; // y of the horizon line
  windowFill: string;
}

// Building gradient + edge-highlight helper
function buildingFill() {
  return 'url(#building-grad)';
}
function buildingStroke() {
  return 'var(--border-subtle)';
}

// Small helper to render a grid of windows over a rectangle. All randomness
// is resolved once in useMemo so server + client render identical DOM.
function WindowGrid({
  x,
  y,
  w,
  h,
  cols,
  rows,
  fill,
  seed,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  cols: number;
  rows: number;
  fill: string;
  seed: number;
}) {
  const windows = useMemo(() => {
    const rand = seeded(seed);
    const cellW = w / cols;
    const cellH = h / rows;
    const out: { x: number; y: number; w: number; h: number; animate: boolean; delay: number; period: number; key: string }[] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const roll = rand();
        const blinkRoll = rand();
        if (roll < 0.45) continue;
        out.push({
          x: x + c * cellW + cellW * 0.25,
          y: y + r * cellH + cellH * 0.22,
          w: Math.max(0.9, cellW * 0.5),
          h: Math.max(0.9, cellH * 0.55),
          animate: roll > 0.88,
          delay: blinkRoll * 10,
          period: 7 + ((r + c) % 6),
          key: `${r}-${c}`,
        });
      }
    }
    return out;
  }, [x, y, w, h, cols, rows, seed]);
  return (
    <>
      {windows.map((win) => (
        <rect
          key={win.key}
          x={win.x}
          y={win.y}
          width={win.w}
          height={win.h}
          rx={0.3}
          fill={fill}
          opacity={win.animate ? 0 : 0.78}
          style={
            win.animate
              ? { animation: `windowBlink ${win.period}s ease-in-out ${win.delay}s infinite` }
              : undefined
          }
        />
      ))}
    </>
  );
}

// Johannesburg skyline — recreates the view from Berea looking west toward
// the CBD: Hillbrow Tower as the anchor, Ponte City's cylinder, Carlton
// Centre as the tallest office block, Sandton-flavoured glass towers, and
// low-rise foreground massing.
const LANDMARKS: Landmark[] = [
  // Far-left foreground low-rise — residential / hospital blocks
  {
    name: 'Berea low-rise',
    city: 'Johannesburg',
    x: -10,
    render: ({ groundY, windowFill }) => {
      const top = groundY - 58;
      return (
        <>
          <rect x={-10} y={top} width={64} height={58} fill={buildingFill()} stroke={buildingStroke()} strokeWidth="0.5" />
          <rect x={-10} y={top - 4} width={26} height={4} fill={buildingFill()} stroke={buildingStroke()} strokeWidth="0.5" />
          <WindowGrid x={-8} y={top + 6} w={60} h={48} cols={8} rows={6} fill={windowFill} seed={13} />
        </>
      );
    },
  },
  // Wits / Parktown office slab
  {
    name: 'Parktown Slab',
    city: 'Johannesburg',
    x: 58,
    render: ({ groundY, windowFill }) => {
      const top = groundY - 92;
      return (
        <>
          <rect x={58} y={top} width={62} height={92} fill={buildingFill()} stroke={buildingStroke()} strokeWidth="0.5" />
          {/* water tower on roof */}
          <rect x={84} y={top - 8} width={10} height={8} fill={buildingFill()} stroke={buildingStroke()} strokeWidth="0.5" />
          <WindowGrid x={60} y={top + 4} w={58} h={86} cols={8} rows={10} fill={windowFill} seed={97} />
        </>
      );
    },
  },
  // Hillbrow block — generic brown-brick apartments
  {
    name: 'Hillbrow Apartments',
    city: 'Johannesburg',
    x: 126,
    render: ({ groundY, windowFill }) => {
      const top = groundY - 140;
      return (
        <>
          <rect x={126} y={top} width={52} height={140} fill={buildingFill()} stroke={buildingStroke()} strokeWidth="0.5" />
          <rect x={132} y={top - 6} width={4} height={6} fill={buildingFill()} stroke={buildingStroke()} strokeWidth="0.5" />
          <rect x={166} y={top - 10} width={6} height={10} fill={buildingFill()} stroke={buildingStroke()} strokeWidth="0.5" />
          <WindowGrid x={128} y={top + 4} w={48} h={130} cols={6} rows={16} fill={windowFill} seed={149} />
        </>
      );
    },
  },
  // Ponte City — Jo'burg's iconic cylindrical residential tower (1975, 173m)
  {
    name: 'Ponte City',
    city: 'Johannesburg',
    x: 188,
    render: ({ groundY, windowFill }) => {
      const top = groundY - 190;
      return (
        <>
          {/* Cylinder silhouette */}
          <path
            d={`M 188 ${groundY} L 192 ${top + 16} Q 210 ${top + 2} 228 ${top + 16} L 232 ${groundY} Z`}
            fill={buildingFill()}
            stroke={buildingStroke()}
            strokeWidth="0.5"
          />
          {/* crown ring — Ponte has a distinctive top band */}
          <rect x={192} y={top + 8} width={36} height={6} fill={buildingFill()} stroke={buildingStroke()} strokeWidth="0.5" />
          <rect x={192} y={top + 6} width={36} height={2} fill="var(--skyline-edge)" opacity="0.6" />
          {/* illuminated top — Ponte famously has rooftop advertising */}
          <rect x={196} y={top + 18} width={28} height={3} fill={windowFill} opacity="0.6" />
          <WindowGrid x={193} y={top + 26} w={34} h={160} cols={5} rows={22} fill={windowFill} seed={211} />
        </>
      );
    },
  },
  // Mid CBD apartment block
  {
    name: 'Braamfontein Tower',
    city: 'Johannesburg',
    x: 240,
    render: ({ groundY, windowFill }) => {
      const top = groundY - 118;
      return (
        <>
          <rect x={240} y={top} width={36} height={118} fill={buildingFill()} stroke={buildingStroke()} strokeWidth="0.5" />
          <WindowGrid x={242} y={top + 4} w={32} h={110} cols={4} rows={14} fill={windowFill} seed={277} />
        </>
      );
    },
  },
  // HILLBROW TOWER — Jo'burg's tallest structure, 269m Telkom communications tower
  //   Signature: cable-stayed column with round observation saucer near top,
  //   tall whip antenna spike, supporting mast
  {
    name: 'Hillbrow Tower',
    city: 'Johannesburg',
    x: 280,
    render: ({ groundY }) => {
      // Ground anchor at x=302. The tower is tall and slim; the saucer sits near the top.
      const baseX = 302;
      const topY = groundY - 252; // column apex (excluding antenna)
      const saucerY = topY + 20;
      return (
        <>
          {/* Column shaft — tapered up */}
          <path
            d={`M ${baseX - 6} ${groundY} L ${baseX - 2} ${topY} L ${baseX + 2} ${topY} L ${baseX + 6} ${groundY} Z`}
            fill={buildingFill()}
            stroke={buildingStroke()}
            strokeWidth="0.5"
          />
          {/* Cable stays — subtle diagonals on either side */}
          <line x1={baseX - 14} x2={baseX - 3} y1={groundY - 10} y2={saucerY + 10} stroke={buildingStroke()} strokeWidth="0.4" opacity="0.45" />
          <line x1={baseX + 14} x2={baseX + 3} y1={groundY - 10} y2={saucerY + 10} stroke={buildingStroke()} strokeWidth="0.4" opacity="0.45" />
          {/* Observation saucer — the distinctive "mushroom" near the top */}
          <ellipse cx={baseX} cy={saucerY} rx={14} ry={4.5} fill={buildingFill()} stroke={buildingStroke()} strokeWidth="0.5" />
          <ellipse cx={baseX} cy={saucerY - 3} rx={14} ry={2} fill={buildingFill()} stroke={buildingStroke()} strokeWidth="0.5" />
          {/* Saucer lights */}
          <circle cx={baseX - 9} cy={saucerY} r={0.9} fill="var(--skyline-window)" opacity="0.9" />
          <circle cx={baseX - 4} cy={saucerY} r={0.9} fill="var(--skyline-window)" opacity="0.9" />
          <circle cx={baseX + 1} cy={saucerY} r={0.9} fill="var(--skyline-window)" opacity="0.9" />
          <circle cx={baseX + 6} cy={saucerY} r={0.9} fill="var(--skyline-window)" opacity="0.9" />
          <circle cx={baseX + 11} cy={saucerY} r={0.9} fill="var(--skyline-window)" opacity="0.9" />
          {/* Upper column to antenna base */}
          <rect x={baseX - 1} y={topY} width={2} height={12} fill={buildingFill()} stroke={buildingStroke()} strokeWidth="0.3" />
          {/* Antenna — the tall whip */}
          <line x1={baseX} x2={baseX} y1={topY} y2={topY - 52} stroke="var(--border-default)" strokeWidth="0.8" />
          {/* Aviation warning light (blinking red) */}
          <circle cx={baseX} cy={topY - 52} r={1.4} fill="#FF3B30" style={{ animation: 'livePulse 1.6s ease-in-out infinite' }} />
        </>
      );
    },
  },
  // Mid-CBD slab, plus one shorter glass box
  {
    name: 'Braamfontein Offices',
    city: 'Johannesburg',
    x: 326,
    render: ({ groundY, windowFill }) => {
      const top = groundY - 102;
      return (
        <>
          <rect x={326} y={top} width={40} height={102} fill={buildingFill()} stroke={buildingStroke()} strokeWidth="0.5" />
          <WindowGrid x={328} y={top + 4} w={36} h={94} cols={5} rows={11} fill={windowFill} seed={343} />
        </>
      );
    },
  },
  // Marshalltown cluster
  {
    name: 'Marshalltown Tower',
    city: 'Johannesburg',
    x: 370,
    render: ({ groundY, windowFill }) => {
      const top = groundY - 158;
      return (
        <>
          <rect x={370} y={top + 14} width={42} height={144} fill={buildingFill()} stroke={buildingStroke()} strokeWidth="0.5" />
          {/* stepped crown */}
          <rect x={376} y={top} width={30} height={14} fill={buildingFill()} stroke={buildingStroke()} strokeWidth="0.5" />
          <rect x={384} y={top - 6} width={14} height={6} fill={buildingFill()} stroke={buildingStroke()} strokeWidth="0.5" />
          <WindowGrid x={372} y={top + 18} w={38} h={136} cols={5} rows={16} fill={windowFill} seed={401} />
        </>
      );
    },
  },
  // CARLTON CENTRE — 1973, 223m, Jo'burg's tallest office block.
  //   Signature: square cross-section, flat top with a small antenna
  {
    name: 'Carlton Centre',
    city: 'Johannesburg',
    x: 418,
    render: ({ groundY, windowFill }) => {
      const top = groundY - 218;
      return (
        <>
          <rect x={418} y={top} width={52} height={218} fill={buildingFill()} stroke={buildingStroke()} strokeWidth="0.5" />
          {/* upper setback */}
          <rect x={424} y={top - 8} width={40} height={8} fill={buildingFill()} stroke={buildingStroke()} strokeWidth="0.5" />
          <line x1={444} x2={444} y1={top - 8} y2={top - 22} stroke="var(--border-default)" strokeWidth="0.8" />
          <WindowGrid x={420} y={top + 4} w={48} h={210} cols={6} rows={26} fill={windowFill} seed={463} />
        </>
      );
    },
  },
  // Newtown brick offices
  {
    name: 'Newtown Offices',
    city: 'Johannesburg',
    x: 476,
    render: ({ groundY, windowFill }) => {
      const top = groundY - 84;
      return (
        <>
          <rect x={476} y={top} width={38} height={84} fill={buildingFill()} stroke={buildingStroke()} strokeWidth="0.5" />
          <WindowGrid x={478} y={top + 4} w={34} h={76} cols={5} rows={9} fill={windowFill} seed={521} />
        </>
      );
    },
  },
  // Sandton-flavoured glass tower (stepped with antenna) — visible in distance
  {
    name: 'Standard Bank Centre',
    city: 'Johannesburg',
    x: 518,
    render: ({ groundY, windowFill }) => {
      const top = groundY - 172;
      return (
        <>
          <path
            d={`M 518 ${groundY} L 518 ${top + 20} L 526 ${top} L 560 ${top} L 568 ${top + 20} L 568 ${groundY} Z`}
            fill={buildingFill()}
            stroke={buildingStroke()}
            strokeWidth="0.5"
          />
          <line x1={543} x2={543} y1={top} y2={top - 18} stroke="var(--border-default)" strokeWidth="0.8" />
          <WindowGrid x={520} y={top + 24} w={46} h={148} cols={6} rows={18} fill={windowFill} seed={593} />
        </>
      );
    },
  },
  // Vodacom / CBD office tower (visible in reference photo — orange logo sign)
  {
    name: 'Vodacom Tower',
    city: 'Johannesburg',
    x: 574,
    render: ({ groundY, windowFill }) => {
      const top = groundY - 206;
      return (
        <>
          <rect x={574} y={top + 18} width={38} height={188} fill={buildingFill()} stroke={buildingStroke()} strokeWidth="0.5" />
          {/* crown with logo band */}
          <rect x={578} y={top + 8} width={30} height={10} fill={buildingFill()} stroke={buildingStroke()} strokeWidth="0.5" />
          <rect x={580} y={top + 10} width={26} height={5} fill="#E60000" opacity="0.85" />
          <rect x={586} y={top} width={14} height={8} fill={buildingFill()} stroke={buildingStroke()} strokeWidth="0.5" />
          <line x1={593} x2={593} y1={top} y2={top - 16} stroke="var(--border-default)" strokeWidth="0.7" />
          <WindowGrid x={576} y={top + 22} w={34} h={180} cols={5} rows={22} fill={windowFill} seed={631} />
        </>
      );
    },
  },
  // Mid-size apartment / office building
  {
    name: 'Loveday Apartments',
    city: 'Johannesburg',
    x: 618,
    render: ({ groundY, windowFill }) => {
      const top = groundY - 126;
      return (
        <>
          <rect x={618} y={top} width={44} height={126} fill={buildingFill()} stroke={buildingStroke()} strokeWidth="0.5" />
          <WindowGrid x={620} y={top + 4} w={40} h={118} cols={6} rows={14} fill={windowFill} seed={677} />
        </>
      );
    },
  },
  // Further CBD — slim glass tower
  {
    name: 'Commissioner Tower',
    city: 'Johannesburg',
    x: 668,
    render: ({ groundY, windowFill }) => {
      const top = groundY - 168;
      return (
        <>
          <rect x={668} y={top} width={30} height={168} fill={buildingFill()} stroke={buildingStroke()} strokeWidth="0.5" />
          <line x1={683} x2={683} y1={top} y2={top - 14} stroke="var(--border-default)" strokeWidth="0.6" />
          <WindowGrid x={670} y={top + 4} w={26} h={160} cols={4} rows={20} fill={windowFill} seed={751} />
        </>
      );
    },
  },
  // Final right cluster — low-rise office
  {
    name: 'West CBD',
    city: 'Johannesburg',
    x: 704,
    render: ({ groundY, windowFill }) => {
      const top = groundY - 76;
      return (
        <>
          <rect x={704} y={top} width={66} height={76} fill={buildingFill()} stroke={buildingStroke()} strokeWidth="0.5" />
          <rect x={748} y={top - 6} width={10} height={6} fill={buildingFill()} stroke={buildingStroke()} strokeWidth="0.5" />
          <WindowGrid x={706} y={top + 4} w={62} h={68} cols={9} rows={8} fill={windowFill} seed={811} />
        </>
      );
    },
  },
  // Right edge of CBD — apartments
  {
    name: 'East Berea',
    city: 'Johannesburg',
    x: 774,
    render: ({ groundY, windowFill }) => {
      const top = groundY - 100;
      return (
        <>
          <rect x={774} y={top} width={36} height={100} fill={buildingFill()} stroke={buildingStroke()} strokeWidth="0.5" />
          <WindowGrid x={776} y={top + 4} w={32} h={92} cols={5} rows={10} fill={windowFill} seed={859} />
        </>
      );
    },
  },
  // Sandton glass tower (in the distance, eastern reach)
  {
    name: 'Alexander Forbes Place',
    city: 'Sandton',
    x: 818,
    render: ({ groundY, windowFill }) => {
      const top = groundY - 154;
      return (
        <>
          <path
            d={`M 818 ${groundY} L 818 ${top + 14} L 826 ${top} L 858 ${top} L 866 ${top + 14} L 866 ${groundY} Z`}
            fill={buildingFill()}
            stroke={buildingStroke()}
            strokeWidth="0.5"
          />
          <WindowGrid x={820} y={top + 18} w={44} h={134} cols={5} rows={16} fill={windowFill} seed={911} />
        </>
      );
    },
  },
  // Stepped office mid-rise
  {
    name: 'Rosebank Tower',
    city: 'Johannesburg',
    x: 874,
    render: ({ groundY, windowFill }) => {
      const top = groundY - 112;
      return (
        <>
          <rect x={874} y={top + 14} width={44} height={98} fill={buildingFill()} stroke={buildingStroke()} strokeWidth="0.5" />
          <rect x={882} y={top} width={28} height={14} fill={buildingFill()} stroke={buildingStroke()} strokeWidth="0.5" />
          <WindowGrid x={876} y={top + 18} w={40} h={90} cols={5} rows={11} fill={windowFill} seed={977} />
        </>
      );
    },
  },
  // Tall slim antenna tower (Auckland Park / SABC precinct)
  {
    name: 'SABC Tower',
    city: 'Johannesburg',
    x: 924,
    render: ({ groundY, windowFill }) => {
      const top = groundY - 188;
      return (
        <>
          <rect x={924} y={top} width={32} height={188} fill={buildingFill()} stroke={buildingStroke()} strokeWidth="0.5" />
          <line x1={940} x2={940} y1={top} y2={top - 26} stroke="var(--border-default)" strokeWidth="0.7" />
          <circle cx={940} cy={top - 26} r={1.2} fill="#FF3B30" style={{ animation: 'livePulse 1.6s ease-in-out infinite' }} />
          <WindowGrid x={926} y={top + 4} w={28} h={180} cols={4} rows={22} fill={windowFill} seed={1033} />
        </>
      );
    },
  },
  // Modern glass tower (Sandton-style with stepped crown)
  {
    name: 'Discovery Place',
    city: 'Sandton',
    x: 962,
    render: ({ groundY, windowFill }) => {
      const top = groundY - 198;
      return (
        <>
          <rect x={962} y={top + 18} width={48} height={180} fill={buildingFill()} stroke={buildingStroke()} strokeWidth="0.5" />
          <rect x={970} y={top + 8} width={32} height={10} fill={buildingFill()} stroke={buildingStroke()} strokeWidth="0.5" />
          <rect x={978} y={top} width={16} height={8} fill={buildingFill()} stroke={buildingStroke()} strokeWidth="0.5" />
          <WindowGrid x={964} y={top + 22} w={44} h={172} cols={5} rows={20} fill={windowFill} seed={1093} />
        </>
      );
    },
  },
  // Mid-rise office cluster
  {
    name: 'Park Square',
    city: 'Johannesburg',
    x: 1018,
    render: ({ groundY, windowFill }) => {
      const top = groundY - 84;
      return (
        <>
          <rect x={1018} y={top} width={42} height={84} fill={buildingFill()} stroke={buildingStroke()} strokeWidth="0.5" />
          <WindowGrid x={1020} y={top + 4} w={38} h={76} cols={5} rows={9} fill={windowFill} seed={1163} />
        </>
      );
    },
  },
  // Tall slim apartments
  {
    name: 'Melrose Arch Tower',
    city: 'Johannesburg',
    x: 1066,
    render: ({ groundY, windowFill }) => {
      const top = groundY - 168;
      return (
        <>
          <rect x={1066} y={top} width={36} height={168} fill={buildingFill()} stroke={buildingStroke()} strokeWidth="0.5" />
          <rect x={1072} y={top - 6} width={4} height={6} fill={buildingFill()} stroke={buildingStroke()} strokeWidth="0.5" />
          <WindowGrid x={1068} y={top + 4} w={32} h={160} cols={4} rows={20} fill={windowFill} seed={1229} />
        </>
      );
    },
  },
  // Wide office slab
  {
    name: 'Hyde Park Block',
    city: 'Johannesburg',
    x: 1108,
    render: ({ groundY, windowFill }) => {
      const top = groundY - 124;
      return (
        <>
          <rect x={1108} y={top} width={62} height={124} fill={buildingFill()} stroke={buildingStroke()} strokeWidth="0.5" />
          <WindowGrid x={1110} y={top + 4} w={58} h={116} cols={8} rows={14} fill={windowFill} seed={1297} />
        </>
      );
    },
  },
  // Distant tall tower with antenna
  {
    name: 'Constitution Hill',
    city: 'Johannesburg',
    x: 1176,
    render: ({ groundY, windowFill }) => {
      const top = groundY - 196;
      return (
        <>
          <rect x={1176} y={top + 14} width={32} height={182} fill={buildingFill()} stroke={buildingStroke()} strokeWidth="0.5" />
          <rect x={1182} y={top} width={20} height={14} fill={buildingFill()} stroke={buildingStroke()} strokeWidth="0.5" />
          <line x1={1192} x2={1192} y1={top} y2={top - 22} stroke="var(--border-default)" strokeWidth="0.7" />
          <WindowGrid x={1178} y={top + 18} w={28} h={174} cols={4} rows={21} fill={windowFill} seed={1367} />
        </>
      );
    },
  },
  // Right edge — low-rise residential
  {
    name: 'Killarney',
    city: 'Johannesburg',
    x: 1214,
    render: ({ groundY, windowFill }) => {
      const top = groundY - 70;
      return (
        <>
          <rect x={1214} y={top} width={56} height={70} fill={buildingFill()} stroke={buildingStroke()} strokeWidth="0.5" />
          <rect x={1244} y={top - 6} width={8} height={6} fill={buildingFill()} stroke={buildingStroke()} strokeWidth="0.5" />
          <WindowGrid x={1216} y={top + 4} w={52} h={62} cols={7} rows={7} fill={windowFill} seed={1429} />
        </>
      );
    },
  },
];

function Skyline({ parallaxX }: { parallaxX: any }) {
  const groundY = 280;
  const windowFill = 'var(--skyline-window)';

  return (
    <motion.div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 bottom-0 h-[42%] z-[1]"
      style={{ x: parallaxX }}
    >
      {/* Horizon haze — warm coral glow bleeding up from the street level */}
      <div
        className="absolute inset-x-0 bottom-0 h-full"
        style={{
          background:
            'linear-gradient(to top, rgba(255, 138, 92, 0.22) 0%, rgba(255, 138, 92, 0.08) 35%, transparent 75%)',
        }}
      />
      <svg
        viewBox="0 0 1280 300"
        preserveAspectRatio="xMidYEnd slice"
        className="absolute inset-x-0 bottom-0 w-full"
        style={{ height: '100%' }}
        role="img"
        aria-label="Johannesburg skyline — Hillbrow Tower, Ponte City, Carlton Centre, and surrounding CBD"
      >
        <defs>
          <linearGradient id="building-grad" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="var(--skyline-fill-top)" />
            <stop offset="1" stopColor="var(--skyline-fill-bottom)" />
          </linearGradient>
        </defs>

        {/* Ground line */}
        <line x1="0" x2="1280" y1={groundY} y2={groundY} stroke="var(--border-subtle)" strokeWidth="1" />

        {LANDMARKS.map((L) => (
          <g key={L.name}>{L.render({ groundY, windowFill })}</g>
        ))}
      </svg>
    </motion.div>
  );
}

function MeshBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
      {/* Coral orb — top-right */}
      <motion.div
        className="absolute -top-40 -right-40 w-[640px] h-[640px] rounded-full"
        style={{
          background:
            'radial-gradient(circle, var(--accent-primary) 0%, transparent 60%)',
          filter: 'blur(80px)',
          opacity: 0.28,
        }}
        animate={{ x: [0, 40, -20, 0], y: [0, -30, 20, 0] }}
        transition={{ duration: 32, repeat: Infinity, ease: 'easeInOut' }}
      />
      {/* Secondary orb — bottom-left */}
      <motion.div
        className="absolute -bottom-48 -left-32 w-[720px] h-[720px] rounded-full"
        style={{
          background:
            'radial-gradient(circle, var(--accent-tertiary) 0%, transparent 65%)',
          filter: 'blur(90px)',
          opacity: 0.18,
        }}
        animate={{ x: [0, -30, 40, 0], y: [0, 30, -20, 0] }}
        transition={{ duration: 40, repeat: Infinity, ease: 'easeInOut' }}
      />
      {/* Accent glow — center-left */}
      <motion.div
        className="absolute top-1/3 left-1/4 w-[420px] h-[420px] rounded-full"
        style={{
          background:
            'radial-gradient(circle, var(--accent-secondary) 0%, transparent 70%)',
          filter: 'blur(70px)',
          opacity: 0.12,
        }}
        animate={{ x: [0, 20, -30, 0], y: [0, -40, 10, 0] }}
        transition={{ duration: 36, repeat: Infinity, ease: 'easeInOut', delay: 4 }}
      />
      {/* Noise — fixed, GPU-safe */}
      <div
        className="absolute inset-0 opacity-[0.04] mix-blend-overlay"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")",
        }}
      />
    </div>
  );
}

function BrandHero({ cities }: { cities: City[] }) {
  const { t } = useI18n();
  return (
    <div className="hidden lg:flex flex-col justify-between h-full p-12 xl:p-16 relative">
      {/* Top: brand mark */}
      <div className="relative z-10 flex items-center gap-3 stagger-enter" style={{ animationDelay: '80ms' }}>
        <motion.div
          className="relative w-11 h-11 rounded-[14px] flex items-center justify-center text-[color:var(--text-on-accent)] text-lg font-bold"
          style={{
            background:
              'linear-gradient(135deg, var(--accent-primary), var(--accent-tertiary))',
            letterSpacing: '-0.02em',
            boxShadow: '0 12px 32px -4px rgba(255,107,53,0.38)',
          }}
          animate={{ y: [0, -3, 0] }}
          transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
        >
          <motion.span
            aria-hidden
            className="absolute inset-0 rounded-[14px]"
            style={{
              background:
                'linear-gradient(135deg, var(--accent-primary), var(--accent-tertiary))',
              filter: 'blur(16px)',
              opacity: 0.5,
            }}
            animate={{ opacity: [0.35, 0.55, 0.35] }}
            transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
          />
          <span className="relative">L</span>
        </motion.div>
        <span className="text-[15px] font-semibold tracking-tight text-[color:var(--text-primary)]">
          Lōns
        </span>
      </div>

      {/* Middle: headline — origination and recovery weighted equally. */}
      <div className="relative z-10 max-w-[560px]">
        <h2
          className="stagger-enter text-[44px] xl:text-[56px] font-semibold leading-[1.02] tracking-[-0.03em] text-[color:var(--text-primary)]"
          style={{ animationDelay: '240ms' }}
        >
          {t('login.heroFrom')} <span className="italic text-[color:var(--accent-primary-deep)]">{t('login.heroOrigination')}</span>
          <br />
          {t('login.heroTo')} <span className="italic text-[color:var(--accent-primary-deep)]">{t('login.heroRecovery')}</span>.
        </h2>
        <p
          className="stagger-enter mt-5 text-[15px] leading-relaxed text-[color:var(--text-secondary)] max-w-[460px]"
          style={{ animationDelay: '380ms' }}
        >
          {t('login.heroDescription')}
        </p>
        <div
          className="stagger-enter mt-6 inline-flex items-center gap-2 text-[13px] text-[color:var(--text-secondary)]"
          style={{ animationDelay: '520ms' }}
        >
          <span className="relative inline-flex h-1.5 w-1.5">
            <span
              aria-hidden
              className="absolute inset-0 rounded-full"
              style={{
                background: 'var(--status-success)',
                animation: 'livePulse 2.2s ease-in-out infinite',
              }}
            />
            <span
              aria-hidden
              className="absolute inset-0 rounded-full"
              style={{
                background: 'var(--status-success)',
                animation: 'liveRing 2.2s ease-out infinite',
              }}
            />
          </span>
          <span className="tracking-wide">{t('login.activeIn')}</span>
          <CityRotator cities={cities} />
        </div>
      </div>

      {/* Bottom: spacer — skyline breathes in this row */}
      <div aria-hidden className="relative z-10 h-2" />
    </div>
  );
}

function SignInButton({ loading, label, loadingLabel }: { loading: boolean; label: string; loadingLabel: string }) {
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const x = useSpring(useTransform(mx, [-60, 60], [-4, 4]), { stiffness: 300, damping: 28 });
  const y = useSpring(useTransform(my, [-30, 30], [-2, 2]), { stiffness: 300, damping: 28 });

  return (
    <motion.button
      type="submit"
      disabled={loading}
      onMouseMove={(e) => {
        const r = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
        mx.set(e.clientX - (r.left + r.width / 2));
        my.set(e.clientY - (r.top + r.height / 2));
      }}
      onMouseLeave={() => {
        mx.set(0);
        my.set(0);
      }}
      whileTap={{ scale: 0.98, y: 1 }}
      style={{ x, y }}
      className="relative group w-full inline-flex items-center justify-center gap-2 h-11 rounded-[10px] text-[14px] font-semibold tracking-tight text-[color:var(--text-on-accent)] disabled:opacity-70 disabled:cursor-wait overflow-hidden"
    >
      <span
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(135deg, var(--accent-primary), var(--accent-tertiary))',
        }}
      />
      <span
        aria-hidden
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
        style={{
          background:
            'linear-gradient(135deg, var(--accent-primary-hover), var(--accent-primary))',
        }}
      />
      <span
        aria-hidden
        className="absolute inset-x-0 -top-px h-px"
        style={{ background: 'rgba(255,255,255,0.35)' }}
      />
      {loading && (
        <motion.span
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.25) 50%, transparent 100%)',
          }}
          animate={{ x: ['-120%', '120%'] }}
          transition={{ duration: 1.3, repeat: Infinity, ease: 'linear' }}
        />
      )}
      <span className="relative flex items-center gap-2">
        {loading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" strokeWidth={2.25} />
            {loadingLabel}
          </>
        ) : (
          <>
            {label}
            <ArrowRight className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-0.5" strokeWidth={2.25} />
          </>
        )}
      </span>
    </motion.button>
  );
}

// Floating theme toggle — visible on both desktop and mobile in the top-left
// corner. Lets testers flip between light/dark without logging in first.
function ThemeFloatToggle() {
  const { theme, toggleTheme } = useTheme();
  const { t } = useI18n();
  return (
    <button
      type="button"
      onClick={toggleTheme}
      role="switch"
      aria-checked={theme === 'dark'}
      aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
      className="group absolute top-5 right-5 z-30 inline-flex items-center gap-2 h-9 pl-2.5 pr-1 rounded-full text-[12px] font-medium tracking-tight transition-colors"
      style={{
        backgroundColor: 'var(--glass-bg)',
        border: '1px solid var(--glass-border)',
        backdropFilter: 'blur(20px) saturate(160%)',
        WebkitBackdropFilter: 'blur(20px) saturate(160%)',
        color: 'var(--text-secondary)',
      }}
    >
      {theme === 'dark' ? <Moon className="w-3.5 h-3.5" strokeWidth={2} /> : <Sun className="w-3.5 h-3.5" strokeWidth={2} />}
      <span className="hidden sm:inline">{t('login.theme')}</span>
      <span
        aria-hidden
        className="relative inline-flex h-5 w-9 items-center rounded-full transition-colors"
        style={{
          backgroundColor: theme === 'dark' ? 'var(--accent-primary)' : 'var(--bg-muted)',
          border: '1px solid var(--border-subtle)',
        }}
      >
        <span
          className="inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform"
          style={{
            transform: theme === 'dark' ? 'translateX(18px)' : 'translateX(2px)',
          }}
        />
      </span>
    </button>
  );
}

function LoginForm() {
  const { login, verifyMfa } = useAuth();
  const router = useRouter();
  const { t } = useI18n();
  const cities = useFootprint();
  const [tenantSlug, setTenantSlug] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  // MFA-lockout fix: flag stays for the brief moment between
  // catching the MfaEnrollmentRequiredError and the redirect to
  // /settings/profile completing. The banner is informational —
  // the redirect happens immediately afterwards. Previously this
  // was a dead-end with no recovery path; the user now lands on
  // the MFA enrolment card with a restricted (but valid) session.
  const [mfaEnrollmentRequired, setMfaEnrollmentRequired] = useState(false);
  const [loading, setLoading] = useState(false);

  /**
   * MFA portal fix: when login() resolves to a non-null challenge,
   * swap the form to a TOTP entry screen. mfaToken is held in
   * component state only — it must never outlive the login flow.
   */
  const [mfaChallenge, setMfaChallenge] = useState<{ mfaToken: string } | null>(null);
  const [totpCode, setTotpCode] = useState('');

  // Mouse parallax tracked at the page level — drives both the skyline and
  // any future depth layers. Tracks horizontal cursor delta from page center.
  const mx = useMotionValue(0);
  const parallaxSky = useSpring(useTransform(mx, [-720, 720], [18, -18]), {
    stiffness: 60,
    damping: 20,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMfaEnrollmentRequired(false);
    setLoading(true);
    try {
      const challenge = await login(tenantSlug, email, password);
      // MFA portal fix: SP user has MFA enabled — swap to TOTP entry.
      // No tokens were stored; the challenge is the user's only
      // credential at this point.
      if (challenge) {
        setMfaChallenge(challenge);
        setTotpCode('');
        setError('');
      }
    } catch (err: any) {
      // S19-STAB-5: dedicated UX for "tenant tier mandates MFA and
      // your grace window has expired". The restricted enrollment-only
      // session is already stored by auth-context.login before the
      // throw — we just route to the enrolment card.
      if (err instanceof MfaEnrollmentRequiredError) {
        // MFA-lockout fix: auth-context.login already stored the
        // restricted access token before throwing. Redirect to the
        // profile page where the MFA enrolment card lives — the
        // user can scan the QR + confirm a TOTP code without
        // touching any other guarded resolver (the scoped token's
        // allow-list covers initiateMfaEnrollment / confirm /
        // me / myTenant). After enrolment they re-login for a
        // full-scope session.
        setMfaEnrollmentRequired(true);
        router.push('/settings/profile');
      } else {
        setError(err.message || 'Login failed');
      }
    } finally {
      setLoading(false);
    }
  };

  /**
   * MFA portal fix: exchange the in-progress mfaToken + TOTP/backup
   * code for a full session. The mutation accepts a 6-digit TOTP or
   * an 8-char hex backup code (case-folded server-side).
   */
  const handleMfaSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mfaChallenge) return;
    setError('');
    setLoading(true);
    try {
      await verifyMfa(mfaChallenge.mfaToken, totpCode.trim());
      // Success: verifyMfa hydrates session + router.push('/dashboard').
      // This component unmounts on navigation.
    } catch (err: any) {
      setError(err?.graphQLErrors?.[0]?.message || err.message || 'Verification failed');
    } finally {
      setLoading(false);
    }
  };

  /**
   * MFA portal fix: "Use a different account" — return to the
   * email/password screen. Drops the mfaToken (the backend's
   * per-token attempt counter ages out automatically).
   */
  const handleMfaCancel = () => {
    setMfaChallenge(null);
    setTotpCode('');
    setError('');
  };

  return (
    <div
      className="relative min-h-[100dvh] bg-page overflow-hidden"
      onMouseMove={(e) => {
        mx.set(e.clientX - window.innerWidth / 2);
      }}
      onMouseLeave={() => mx.set(0)}
    >
      <MeshBackdrop />
      <TwinklingStars />
      <Skyline parallaxX={parallaxSky} />
      <ThemeFloatToggle />

      <div className="relative z-10 grid grid-cols-1 lg:grid-cols-[1.15fr_1fr] min-h-[100dvh]">
        <BrandHero cities={cities} />

        <div className="flex items-center justify-center p-6 sm:p-10 lg:p-12">
          <div className="w-full max-w-[420px]">
            {/* Mobile brand */}
            <div className="stagger-enter lg:hidden flex flex-col items-center text-center mb-8" style={{ animationDelay: '80ms' }}>
              <motion.div
                className="relative w-12 h-12 rounded-[14px] flex items-center justify-center text-[color:var(--text-on-accent)] text-xl font-bold mb-4"
                style={{
                  background:
                    'linear-gradient(135deg, var(--accent-primary), var(--accent-tertiary))',
                  boxShadow: '0 12px 32px -4px rgba(255,107,53,0.38)',
                }}
                animate={{ y: [0, -3, 0] }}
                transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
              >
                L
              </motion.div>
              <h1 className="text-[28px] font-semibold tracking-[-0.02em] text-[color:var(--text-primary)]">
                Lōns
              </h1>
              <p className="text-sm text-[color:var(--text-secondary)] mt-1">
                {t('login.title')}
              </p>
            </div>

            {/* Glass card */}
            <div className="stagger-enter" style={{ animationDelay: '180ms' }}>
              <div
                className="relative rounded-[22px] p-7 sm:p-8"
                style={{
                  backgroundColor: 'var(--glass-bg)',
                  border: '1px solid var(--glass-border)',
                  boxShadow:
                    'inset 0 1px 0 var(--glass-highlight), var(--glass-shadow)',
                  backdropFilter: 'blur(28px) saturate(160%)',
                  WebkitBackdropFilter: 'blur(28px) saturate(160%)',
                }}
              >
                {/* Desktop header */}
                <div className="hidden lg:block mb-6">
                  <h2 className="text-[22px] font-semibold tracking-tight text-[color:var(--text-primary)]">
                    {mfaChallenge ? t('login.mfaChallenge.title') : t('login.signIn')}
                  </h2>
                  <p className="text-[13px] text-[color:var(--text-secondary)] mt-0.5">
                    {mfaChallenge ? t('login.mfaChallenge.subtitle') : t('login.title')}
                  </p>
                </div>

                {/*
                  MFA portal fix: two screens share this card. The
                  credentials form is shown until login() returns a
                  challenge; then we render the TOTP entry form in
                  the same envelope (no layout shift).
                */}
                {!mfaChallenge ? (
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                      <label className="block text-[12px] font-medium tracking-wide text-[color:var(--text-secondary)] mb-1.5">
                        {t('login.organization')}
                      </label>
                      <input
                        type="text"
                        value={tenantSlug}
                        onChange={(e) =>
                          setTenantSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))
                        }
                        className="input-field"
                        placeholder={t('login.orgPlaceholder')}
                        required
                        autoFocus
                      />
                    </div>

                    <div>
                      <label className="block text-[12px] font-medium tracking-wide text-[color:var(--text-secondary)] mb-1.5">
                        {t('login.email')}
                      </label>
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="input-field"
                        placeholder={t('login.emailPlaceholder')}
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-[12px] font-medium tracking-wide text-[color:var(--text-secondary)] mb-1.5">
                        {t('login.password')}
                      </label>
                      <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="input-field"
                        placeholder="••••••••"
                        required
                      />
                    </div>

                    <AnimatePresence initial={false}>
                      {mfaEnrollmentRequired && (
                        <motion.div
                          key="login-mfa-required"
                          initial={{ opacity: 0, y: -6, height: 0 }}
                          animate={{ opacity: 1, y: 0, height: 'auto' }}
                          exit={{ opacity: 0, y: -6, height: 0 }}
                          transition={{ type: 'spring', stiffness: 280, damping: 26 }}
                          className="overflow-hidden"
                        >
                          <div
                            role="alert"
                            className="flex items-start gap-2.5 px-3 py-3 rounded-lg text-[13px]"
                            style={{
                              backgroundColor: 'var(--status-warning-soft)',
                              color: 'var(--status-warning-text)',
                              border: '1px solid var(--status-warning)',
                            }}
                          >
                            <ShieldAlert className="w-4 h-4 flex-shrink-0 mt-0.5" strokeWidth={2.25} />
                            <div className="space-y-1">
                              <p className="font-semibold">{t('login.mfaRequired.title')}</p>
                              <p className="text-[12.5px] leading-relaxed opacity-90">
                                {t('login.mfaRequired.body')}
                              </p>
                            </div>
                          </div>
                        </motion.div>
                      )}
                      {error && (
                        <motion.div
                          key="login-error"
                          initial={{ opacity: 0, y: -6, height: 0 }}
                          animate={{ opacity: 1, y: 0, height: 'auto' }}
                          exit={{ opacity: 0, y: -6, height: 0 }}
                          transition={{ type: 'spring', stiffness: 280, damping: 26 }}
                          className="overflow-hidden"
                        >
                          <div
                            role="alert"
                            className="flex items-start gap-2 px-3 py-2.5 rounded-lg text-[13px]"
                            style={{
                              backgroundColor: 'var(--status-error-soft)',
                              color: 'var(--status-error-text)',
                              border: '1px solid var(--status-error)',
                            }}
                          >
                            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" strokeWidth={2.25} />
                            <span>{error}</span>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <div className="pt-1">
                      <SignInButton
                        loading={loading}
                        label={t('login.signIn')}
                        loadingLabel={t('login.signingIn')}
                      />
                    </div>
                  </form>
                ) : (
                  <form onSubmit={handleMfaSubmit} className="space-y-4">
                    <p className="text-[13px] leading-relaxed text-[color:var(--text-secondary)]">
                      {t('login.mfaChallenge.help')}
                    </p>

                    <div>
                      <label className="block text-[12px] font-medium tracking-wide text-[color:var(--text-secondary)] mb-1.5">
                        {t('login.mfaChallenge.codeLabel')}
                      </label>
                      <input
                        type="text"
                        value={totpCode}
                        onChange={(e) => setTotpCode(e.target.value)}
                        className="input-field tracking-[0.3em] text-center text-[18px]"
                        placeholder="••••••"
                        autoComplete="one-time-code"
                        inputMode="text"
                        maxLength={8}
                        required
                        autoFocus
                      />
                    </div>

                    <AnimatePresence initial={false}>
                      {error && (
                        <motion.div
                          key="mfa-error"
                          initial={{ opacity: 0, y: -6, height: 0 }}
                          animate={{ opacity: 1, y: 0, height: 'auto' }}
                          exit={{ opacity: 0, y: -6, height: 0 }}
                          transition={{ type: 'spring', stiffness: 280, damping: 26 }}
                          className="overflow-hidden"
                        >
                          <div
                            role="alert"
                            className="flex items-start gap-2 px-3 py-2.5 rounded-lg text-[13px]"
                            style={{
                              backgroundColor: 'var(--status-error-soft)',
                              color: 'var(--status-error-text)',
                              border: '1px solid var(--status-error)',
                            }}
                          >
                            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" strokeWidth={2.25} />
                            <span>{error}</span>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <div className="pt-1 space-y-2">
                      <SignInButton
                        loading={loading}
                        label={t('login.mfaChallenge.verify')}
                        loadingLabel={t('login.mfaChallenge.verifying')}
                      />
                      <button
                        type="button"
                        onClick={handleMfaCancel}
                        className="w-full text-center text-[12px] text-[color:var(--text-tertiary)] hover:text-[color:var(--text-secondary)] transition-colors"
                      >
                        {t('login.mfaChallenge.useDifferentAccount')}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </div>

            <p className="stagger-enter text-center text-[11px] text-[color:var(--text-tertiary)] mt-6 tracking-wide" style={{ animationDelay: '320ms' }}>
              © {new Date().getFullYear()} Lōns · {t('login.copyrightTagline')}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Providers>
      <LoginForm />
    </Providers>
  );
}
