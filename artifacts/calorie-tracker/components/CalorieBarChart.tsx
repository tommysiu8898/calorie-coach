import React from "react";
import { Dimensions } from "react-native";
import Svg, { Rect, Line, Text as SvgText, G } from "react-native-svg";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

export interface BarDatum {
  date: string;
  label: string;
  calories: number;
  burnedCalories?: number;
  isToday?: boolean;
  isSelected?: boolean;
}

interface CalorieBarChartProps {
  data: BarDatum[];
  target?: number;
  onDayPress?: (date: string) => void;
  colors: {
    accent: string;
    destructive: string;
    foreground: string;
    border: string;
    mutedForeground: string;
  };
  horizontalPadding?: number;
  chartHeight?: number;
}

export function CalorieBarChart({
  data,
  target = 0,
  onDayPress,
  colors,
  horizontalPadding = 40,
  chartHeight = 130,
}: CalorieBarChartProps) {
  const chartW = SCREEN_WIDTH - horizontalPadding * 2 - 32;
  const chartH = chartHeight;
  const barCount = data.length;
  const barGap = barCount > 14 ? 3 : 6;
  const barW = Math.max(4, Math.floor((chartW - (barCount - 1) * barGap) / barCount));

  const hasBurned = barCount <= 14 && data.some((d) => (d.burnedCalories ?? 0) > 0);
  const eatenW = hasBurned ? Math.floor(barW * 0.55) : barW;
  const burnedW = hasBurned ? Math.max(3, barW - eatenW - 2) : 0;

  const maxVal = Math.max(
    target > 0 ? target * 1.1 : 100,
    ...data.map((d) => d.calories),
    ...(hasBurned ? data.map((d) => d.burnedCalories ?? 0) : []),
    100,
  );

  return (
    <Svg width={chartW} height={chartH + 28}>
      {target > 0 && (
        <Line
          x1={0}
          y1={chartH - (target / maxVal) * chartH}
          x2={chartW}
          y2={chartH - (target / maxVal) * chartH}
          stroke={colors.border}
          strokeWidth={1}
          strokeDasharray="4,4"
        />
      )}

      {data.map((d, i) => {
        const barH = Math.max(d.calories > 0 ? 5 : 2, (d.calories / maxVal) * chartH);
        const burned = d.burnedCalories ?? 0;
        const burnedH = hasBurned ? Math.max(burned > 0 ? 4 : 0, (burned / maxVal) * chartH) : 0;
        const x = i * (barW + barGap);
        const y = chartH - barH;
        const xBurned = x + eatenW + 2;
        const yBurned = chartH - burnedH;

        const isOver = target > 0 && d.calories > target;
        const fill = d.isSelected
          ? colors.accent
          : isOver
            ? colors.destructive
            : d.calories > 0
              ? colors.foreground
              : colors.border;

        return (
          <G key={d.date} onPress={onDayPress ? () => onDayPress(d.date) : undefined}>
            {/* Transparent hit area */}
            <Rect x={x} y={0} width={barW} height={chartH} fill="transparent" />

            {/* Eaten calories bar */}
            <Rect
              x={x}
              y={y}
              width={eatenW}
              height={barH}
              rx={Math.min(4, eatenW / 2)}
              fill={fill}
              opacity={d.calories > 0 ? 1 : 0.22}
            />

            {/* Burned calories bar (7-day only) */}
            {hasBurned && burnedH > 0 && (
              <Rect
                x={xBurned}
                y={yBurned}
                width={burnedW}
                height={burnedH}
                rx={Math.min(4, burnedW / 2)}
                fill="#f97316"
                opacity={0.75}
              />
            )}

            {barCount <= 14 && (
              <SvgText
                x={x + barW / 2}
                y={chartH + 16}
                textAnchor="middle"
                fontSize={9}
                fill={
                  d.isSelected
                    ? colors.accent
                    : d.isToday
                      ? colors.foreground
                      : colors.mutedForeground
                }
                fontFamily={d.isToday || d.isSelected ? "Inter_600SemiBold" : "Inter_400Regular"}
              >
                {d.label}
              </SvgText>
            )}
          </G>
        );
      })}

      {barCount > 14 &&
        data
          .filter((_, i) => i % 7 === 0 || i === data.length - 1)
          .map((d) => {
            const i = data.indexOf(d);
            const x = i * (barW + barGap) + barW / 2;
            return (
              <SvgText
                key={d.date + "_lbl"}
                x={x}
                y={chartH + 16}
                textAnchor="middle"
                fontSize={9}
                fill={colors.mutedForeground}
                fontFamily="Inter_400Regular"
              >
                {d.label}
              </SvgText>
            );
          })}
    </Svg>
  );
}
