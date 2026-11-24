import { useEffect, useRef } from 'react';
import {
  Chart,
  BarController,
  BarElement,
  LineController,
  LineElement,
  PointElement,
  DoughnutController,
  ArcElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';

Chart.register(
  BarController,
  BarElement,
  LineController,
  LineElement,
  PointElement,
  DoughnutController,
  ArcElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
  Filler
);

interface ChartProps {
  labels: string[];
  values: number[];
  label: string;
  color?: string;
}

export function BarMetricChart({ labels, values, label, color = '#D4A843' }: ChartProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    const chart = new Chart(canvasRef.current, {
      type: 'bar',
      data: {
        labels: labels.length ? labels : ['No Data'],
        datasets: [
          {
            label,
            data: values.length ? values : [0],
            backgroundColor: color,
            borderRadius: 4,
            maxBarThickness: 32,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
        },
        scales: {
          x: {
            ticks: { color: '#94A3B8', font: { size: 11 } },
            grid: { display: false },
          },
          y: {
            beginAtZero: true,
            ticks: { color: '#94A3B8', font: { size: 11 } },
            grid: { color: 'rgba(148, 163, 184, 0.12)' },
          },
        },
      },
    });
    return () => chart.destroy();
  }, [labels, values, label, color]);

  return (
    <div className="h-56 w-full">
      <canvas ref={canvasRef} />
    </div>
  );
}

export function LineMetricChart({ labels, values, label, color = '#16A34A' }: ChartProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    const chart = new Chart(canvasRef.current, {
      type: 'line',
      data: {
        labels: labels.length ? labels : ['No Data'],
        datasets: [
          {
            label,
            data: values.length ? values : [0],
            borderColor: color,
            backgroundColor: 'rgba(22, 163, 74, 0.12)',
            fill: true,
            tension: 0.3,
            pointRadius: 3,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
        },
        scales: {
          x: {
            ticks: { color: '#94A3B8', font: { size: 11 } },
            grid: { display: false },
          },
          y: {
            beginAtZero: true,
            ticks: { color: '#94A3B8', font: { size: 11 } },
            grid: { color: 'rgba(148, 163, 184, 0.12)' },
          },
        },
      },
    });
    return () => chart.destroy();
  }, [labels, values, label, color]);

  return (
    <div className="h-56 w-full">
      <canvas ref={canvasRef} />
    </div>
  );
}

export function DoughnutMetricChart({
  labels,
  values,
  colors = ['#16A34A', '#D4A843', '#DC2626', '#64748B'],
}: {
  labels: string[];
  values: number[];
  colors?: string[];
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    const chart = new Chart(canvasRef.current, {
      type: 'doughnut',
      data: {
        labels: labels.length ? labels : ['Empty'],
        datasets: [
          {
            data: values.length ? values : [1],
            backgroundColor: colors,
            borderWidth: 0,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '68%',
        plugins: {
          legend: {
            position: 'bottom',
            labels: { color: '#CBD5E1', boxWidth: 10, padding: 14, font: { size: 11 } },
          },
        },
      },
    });
    return () => chart.destroy();
  }, [labels, values, colors]);

  return (
    <div className="h-56 w-full">
      <canvas ref={canvasRef} />
    </div>
  );
}
