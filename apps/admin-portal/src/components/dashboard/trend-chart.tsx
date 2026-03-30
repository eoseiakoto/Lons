'use client';

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';

interface TrendChartProps {
  title: string;
  data: Record<string, any>[];
  dataKey: string;
  xKey?: string;
  type?: 'area' | 'line' | 'bar';
  color?: string;
}

export function TrendChart({
  title,
  data,
  dataKey,
  xKey = 'name',
  type = 'area',
  color = '#60a5fa',
}: TrendChartProps) {
  const tooltipStyle = {
    backgroundColor: 'rgba(15, 23, 42, 0.9)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '8px',
    color: '#fff',
    fontSize: '12px',
  };

  const renderChart = () => {
    const commonProps = {
      data,
      margin: { top: 5, right: 10, left: -10, bottom: 0 },
    };

    const grid = (
      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
    );
    const xAxis = (
      <XAxis
        dataKey={xKey}
        tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }}
        axisLine={false}
        tickLine={false}
      />
    );
    const yAxis = (
      <YAxis
        tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }}
        axisLine={false}
        tickLine={false}
      />
    );
    const tooltip = <Tooltip contentStyle={tooltipStyle} />;

    if (type === 'bar') {
      return (
        <BarChart {...commonProps}>
          {grid}
          {xAxis}
          {yAxis}
          {tooltip}
          <Bar dataKey={dataKey} fill={color} radius={[4, 4, 0, 0]} opacity={0.8} />
        </BarChart>
      );
    }

    if (type === 'line') {
      return (
        <LineChart {...commonProps}>
          {grid}
          {xAxis}
          {yAxis}
          {tooltip}
          <Line
            type="monotone"
            dataKey={dataKey}
            stroke={color}
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      );
    }

    return (
      <AreaChart {...commonProps}>
        {grid}
        {xAxis}
        {yAxis}
        {tooltip}
        <defs>
          <linearGradient id={`gradient-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.3} />
            <stop offset="95%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area
          type="monotone"
          dataKey={dataKey}
          stroke={color}
          strokeWidth={2}
          fill={`url(#gradient-${dataKey})`}
        />
      </AreaChart>
    );
  };

  return (
    <div className="glass p-5">
      <h3 className="text-sm font-medium text-white/60 mb-3">{title}</h3>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          {renderChart()}
        </ResponsiveContainer>
      </div>
    </div>
  );
}
