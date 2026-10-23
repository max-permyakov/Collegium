import type { GameModeId } from '../../../types';

export interface ObstacleSpec {
  text: string;
  style: 'badge' | 'glyph' | 'wave';
  flying?: boolean;
  image?: string;
  imageWidth?: number;
  imageHeight?: number;
}

export interface EscapeModeConfig {
  id: GameModeId;
  label: string;
  title: string;
  subtitle: string;
  accent: string;
  groundAccents: string[];
  description: string;
  groundItems: ObstacleSpec[];
  flyingItems: ObstacleSpec[];
  trailImage: string;
}

const physicsEmojis = ['👨‍🔬', '🧑‍🏫', '🧓', '👩‍🔬'];

export const escapeModes: EscapeModeConfig[] = [
  {
    id: 'physics',
    label: 'Побег от Физики (Шульга)',
    title: 'Побег от Физики',
    subtitle: 'Попробуй выжить на 1 курсе. Шульга идёт!',
    accent: '#38bdf8',
    groundAccents: ['#0ea5e9', '#0284c7'],
    description: 'Перепрыгивай формулы и портреты физиков, пригнись под электромагнитными волнами',
    groundItems: [
      { text: 'E = mc²', style: 'badge' },
      { text: 'F = ma', style: 'badge' },
      { text: 'λν = c', style: 'badge' },
      { text: 's = ½at²', style: 'badge' },
      { text: 'pV = νRT', style: 'badge' },
      { text: '∮ B·dℓ = μI', style: 'badge' },
      { text: physicsEmojis[0], style: 'glyph', image: '/games/physics/portrait-1.png', imageWidth: 64, imageHeight: 64 },
      { text: physicsEmojis[1], style: 'glyph', image: '/games/physics/portrait-2.png', imageWidth: 64, imageHeight: 64 },
      { text: physicsEmojis[2], style: 'glyph', image: '/games/physics/portrait-3.png', imageWidth: 64, imageHeight: 64 },
      { text: physicsEmojis[3], style: 'glyph', image: '/games/physics/portrait-4.png', imageWidth: 64, imageHeight: 64 },
    ],
    flyingItems: [
      { text: 'ваш сдвиг по фазе', style: 'wave', flying: true },
      { text: '2,4 ГГц ∿', style: 'wave', flying: true },
      { text: 'λ·ν = c ∿', style: 'wave', flying: true },
      { text: '∿ ω = 2πν ∿', style: 'wave', flying: true },
    ],
    trailImage: '/games/physics/trail.png',
  },
  {
    id: '1c',
    label: 'Побег от 1С (Щербакова)',
    title: 'Побег от 1С',
    subtitle: 'Щербакова открывает 1С — отбивайся от форм и отчётов',
    accent: '#fbbf24',
    groundAccents: ['#f59e0b', '#d97706'],
    description: 'Перепрыгивай формы, отчёты и презентации, пригнись от фраз из потока',
    groundItems: [
      { text: '1С', style: 'badge', image: '/games/1c/logo.png', imageWidth: 56, imageHeight: 56 },
      { text: 'Форма №1', style: 'badge', image: '/games/1c/form-1.png', imageWidth: 80, imageHeight: 56 },
      { text: 'Отчёт', style: 'badge', image: '/games/1c/report.png', imageWidth: 80, imageHeight: 56 },
      { text: 'Презентация', style: 'badge', image: '/games/1c/presentation.png', imageWidth: 80, imageHeight: 56 },
      { text: 'Рапортичка', style: 'badge', image: '/games/1c/report-card.png', imageWidth: 80, imageHeight: 56 },
      { text: 'Отбор', style: 'badge', image: '/games/1c/filter.png', imageWidth: 80, imageHeight: 56 },
      { text: '🖥️', style: 'glyph', image: '/games/1c/pc.png', imageWidth: 56, imageHeight: 56 },
      { text: '📊', style: 'glyph', image: '/games/1c/chart.png', imageWidth: 56, imageHeight: 56 },
    ],
    flyingItems: [
      { text: '«Не сочиняй!»', style: 'badge', flying: true },
      { text: '«Я не так диктовала»', style: 'badge', flying: true },
      { text: '2', style: 'glyph', flying: true },
      { text: '«Эльфы отвечают первыми»', style: 'badge', flying: true },
    ],
    trailImage: '/games/1c/trail.png',
  },
];

export const escapeModeById = (id: GameModeId): EscapeModeConfig =>
  escapeModes.find(m => m.id === id) ?? escapeModes[0];
