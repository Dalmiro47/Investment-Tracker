'use client';
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { ETFComponent, PlanRowDrift } from '@/lib/types.etf';
import { formatCurrency } from '@/lib/money';
import { format, parseISO } from 'date-fns';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { AreaChart, Area, XAxis, YAxis, Tooltip as RechartsTooltip, CartesianGrid, Legend } from 'recharts';

const CHART_COLORS = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
];

type Props = {
  rows: PlanRowDrift[];
  components: ETFComponent[];
  title?: string;
};

export default function PortfolioStackedChart({ rows, components, title = 'Portfolio Value Over Time' }: Props) {
  const chartData = React.useMemo(() => {
    return rows.map(row => {
      const chartRow: Record<string, any> = {
        date: format(parseISO(row.date), 'MMM yy'),
        'Portfolio Value': row.portfolioValue,
      };
      components.forEach(comp => {
        const pos = row.positions.find(p => p.symbol === comp.ticker);
        chartRow[comp.name] = pos?.valueEUR ?? 0;
      });
      return chartRow;
    });
  }, [rows, components]);

  if (!rows.length) return null;

  return (
    <Card className="mb-6">
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <CardContent className="h-[400px]">
        <ChartContainer config={{}} className="w-full h-full">
          <AreaChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" />
            <YAxis tickFormatter={(v) => formatCurrency(v as number)} />
            <RechartsTooltip
              content={
                <ChartTooltipContent
                  formatter={(value, name) => <div>{name}: {formatCurrency(value as number)}</div>}
                />
              }
            />
            <Legend />
            {components.map((comp, i) => (
              <Area
                key={comp.id}
                type="monotone"
                dataKey={comp.name}
                stackId="1"
                stroke={CHART_COLORS[i % CHART_COLORS.length]}
                fill={CHART_COLORS[i % CHART_COLORS.length]}
                fillOpacity={0.6}
              />
            ))}
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
