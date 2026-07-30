import { useId } from 'react';
import {
  bandLabelFromScore,
  clampScore,
  gradeFromScore,
  RISK_LEVEL_LABEL,
  riskColor,
  riskFromScore,
  SCORE_BANDS,
  SCORE_MAX,
} from '@rating-pro/shared';
import { cn } from '@/lib/cn';

/** Converte ângulo (graus, 0 = direita, cresce anti-horário) em coordenada SVG. */
function polar(cx: number, cy: number, radius: number, degrees: number) {
  const radians = (degrees * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(radians),
    y: cy - radius * Math.sin(radians),
  };
}

function arcPath(cx: number, cy: number, radius: number, fromDeg: number, toDeg: number): string {
  const start = polar(cx, cy, radius, fromDeg);
  const end = polar(cx, cy, radius, toDeg);
  const largeArc = Math.abs(toDeg - fromDeg) > 180 ? 1 : 0;

  // sweep = 1 percorre no sentido horário na tela, ou seja, por cima.
  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} 1 ${end.x} ${end.y}`;
}

/** 0 pontos => 180°, 1000 pontos => 0°. */
function angleFor(score: number): number {
  return 180 - (clampScore(score) / SCORE_MAX) * 180;
}

interface ScoreGaugeProps {
  score: number;
  size?: number;
  /** Oculta grade e faixa, deixando só o número. */
  compact?: boolean;
  className?: string;
}

export function ScoreGauge({ score, size = 260, compact = false, className }: ScoreGaugeProps) {
  const gradientId = useId();
  const safeScore = clampScore(score);
  const grade = gradeFromScore(safeScore);
  const risk = riskFromScore(safeScore);
  const color = riskColor(risk);

  const width = size;
  const height = size * 0.62;
  const cx = width / 2;
  const cy = height - 8;
  const radius = width / 2 - 18;
  const strokeWidth = Math.max(12, size * 0.055);

  // SCORE_BANDS vem do melhor para o pior; invertemos para desenhar 0 -> 1000.
  const ascending = [...SCORE_BANDS].reverse();
  const needleAngle = angleFor(safeScore);
  const needleTip = polar(cx, cy, radius - strokeWidth / 2 - 6, needleAngle);

  return (
    <div className={cn('flex flex-col items-center', className)}>
      {/*
        A altura reserva espaço abaixo do centro do medidor para os rótulos da
        escala: com `height + 8` eles caíam 2px fora do viewBox e apareciam
        cortados.
      */}
      <svg
        width={width}
        height={height + 22}
        viewBox={`0 0 ${width} ${height + 22}`}
        role="img"
        aria-label={`Score ${safeScore} de ${SCORE_MAX}, classificação ${grade}, ${RISK_LEVEL_LABEL[risk].toLowerCase()}`}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={riskColor('critico')} />
            <stop offset="42%" stopColor={riskColor('moderado')} />
            <stop offset="100%" stopColor={riskColor('minimo')} />
          </linearGradient>
        </defs>

        {/* Trilha de fundo */}
        <path
          d={arcPath(cx, cy, radius, 180, 0)}
          fill="none"
          stroke="currentColor"
          className="text-ink-200 dark:text-ink-800"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />

        {/* Faixas coloridas da escala */}
        {ascending.map((band, index) => {
          const next = ascending[index + 1];
          const from = angleFor(band.min);
          const to = angleFor(next ? next.min : SCORE_MAX);

          return (
            <path
              key={band.grade}
              d={arcPath(cx, cy, radius, from, to)}
              fill="none"
              stroke={riskColor(band.risk)}
              strokeWidth={strokeWidth}
              opacity={0.28}
            />
          );
        })}

        {/* Progresso até o score atual */}
        <path
          d={arcPath(cx, cy, radius, 180, Math.max(needleAngle, 0.01))}
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          style={{ transition: 'd 0.4s ease-out' }}
        />

        {/* Ponteiro */}
        <line
          x1={cx}
          y1={cy}
          x2={needleTip.x}
          y2={needleTip.y}
          stroke="currentColor"
          className="text-ink-900 dark:text-ink-100"
          strokeWidth={Math.max(2, size * 0.012)}
          strokeLinecap="round"
          style={{ transition: 'all 0.4s cubic-bezier(0.22, 1, 0.36, 1)' }}
        />
        <circle
          cx={cx}
          cy={cy}
          r={Math.max(5, size * 0.022)}
          fill="currentColor"
          className="text-ink-900 dark:text-ink-100"
        />

        <text x={16} y={cy + 17} className="fill-ink-400" style={{ fontSize: 10 }}>
          0
        </text>
        <text
          x={width - 16}
          y={cy + 17}
          textAnchor="end"
          className="fill-ink-400"
          style={{ fontSize: 10 }}
        >
          {SCORE_MAX}
        </text>
      </svg>

      <div className={cn('text-center', compact ? '-mt-3' : '-mt-1')}>
        <div
          className="text-4xl font-bold tabular-nums"
          style={{ color }}
          aria-hidden
        >
          {safeScore}
        </div>

        {!compact && (
          <>
            <div className="mt-1 flex items-center justify-center gap-2">
              <span
                className="rounded-md px-2 py-0.5 text-sm font-bold text-white"
                style={{ backgroundColor: color }}
              >
                {grade}
              </span>
              <span className="text-sm font-medium text-ink-600 dark:text-ink-300">
                {RISK_LEVEL_LABEL[risk]}
              </span>
            </div>
            <p className="mt-1 text-xs text-ink-500">Perfil: {bandLabelFromScore(safeScore)}</p>
          </>
        )}
      </div>
    </div>
  );
}
