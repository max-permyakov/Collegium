import type { GameModeId } from '../../../types';

export interface ObstacleSpec {
  text: string;
  style: 'badge' | 'glyph' | 'wave';
  flying?: boolean;
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
}

const physicsEmojis = ['👨‍🔬', '🧑‍🏫', '🧓', '👩‍🔬'];

export const escapeModes: EscapeModeConfig[] = [
  {
    id: 'physics',
    label: 'Побег от Физики (Шульга)',
    title: 'Побег от Физики',
    subtitle: 'Шульга идёт по коридору — не дай себе попасть на пару',
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
      { text: physicsEmojis[0], style: 'glyph' },
      { text: physicsEmojis[1], style: 'glyph' },
      { text: physicsEmojis[2], style: 'glyph' },
      { text: physicsEmojis[3], style: 'glyph' },
    ],
    flyingItems: [
      { text: '∿∿∿∿∿', style: 'wave', flying: true },
      { text: '2,4 ГГц ∿', style: 'wave', flying: true },
      { text: 'λ·ν = c ∿', style: 'wave', flying: true },
      { text: '∿ ω = 2πν ∿', style: 'wave', flying: true },
    ],
  },
  {
    id: '1c',
    label: 'Побег от 1С (Щербакова)',
    title: 'Побег от 1С',
    subtitle: 'Щербакова открывает журнал — отбивайся от форм и отчётов',
    accent: '#fbbf24',
    groundAccents: ['#f59e0b', '#d97706'],
    description: 'Перепрыгивай формы, отчёты и презентации, пригнись от фраз из потока',
    groundItems: [
      { text: '1С', style: 'badge' },
      { text: 'Форма №1', style: 'badge' },
      { text: 'Отчёт', style: 'badge' },
      { text: 'Презентация', style: 'badge' },
      { text: 'Рапортичка', style: 'badge' },
      { text: 'Отбор', style: 'badge' },
      { text: '🖥️', style: 'glyph' },
      { text: '📊', style: 'glyph' },
    ],
    flyingItems: [
      { text: '«Не сочиняй!»', style: 'badge', flying: true },
      { text: '«Я не так диктовала»', style: 'badge', flying: true },
      { text: '2', style: 'glyph', flying: true },
      { text: '«Эльфы отвечают первыми»', style: 'badge', flying: true },
    ],
  },
];

export const escapeModeById = (id: GameModeId): EscapeModeConfig =>
  escapeModes.find(m => m.id === id) ?? escapeModes[0];
