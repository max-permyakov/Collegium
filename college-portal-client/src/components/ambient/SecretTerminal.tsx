import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

interface TermLine {
  id: number;
  text: string;
  kind: 'in' | 'out' | 'err' | 'sys';
}

const BANNER = [
  'KKEP.ka shell — ты нашёл пасхалку 🐧',
  '«help» — команды, «exit» или ~ — закрыть.',
].join('\n');

const TUX_ASCII = [
  '   .--.',
  '  |o_o |',
  '  |:_/ |',
  ' //   \\ \\',
  '(|     | )',
  "/'\\_   _/`\\",
  '\\___)=(___/',
].join('\n');

const HELP = [
  'help        — этот список',
  'whoami      — кто ты (в стиле neofetch)',
  'schedule    — расписание',
  'grades      — оценки',
  'chat        — чаты',
  'clubs       — кружки',
  'news        — новости',
  'assignments — задания',
  'games       — игры (нужен дневник)',
  'map         — карта колледжа',
  'profile     — профиль',
  'tux         — совет пингвина',
  'ping <хост> — пропинговать что-нибудь',
  'date        — текущее время',
  'history     — история команд',
  'sudo …      — попытка всемогущества',
  'clear       — очистить экран',
  'exit        — закрыть терминал',
].join('\n');

const TUX_TIPS = [
  'Хорошая практика коммитов — как.good breakfast: вовремя.',
  'Оптимизируй алгоритм, а не сон перед парами.',
  'git commit -m "wip" — не коммит, это молитва.',
  'У(certified) пингвина NULL-дедлайнов.',
  'Средний балл 4.5+? Пингвин снимает шляпу. Ой. У меня её нет.',
];

/**
 * Секретный терминал-пасхалка: открывается/закрывается клавишей ~ (Backquote,
 * работает и на русской раскладке «ё»), Escape тоже закрывает.
 * Команды: навигация по порталу, whoami в стиле neofetch, шутки sudo.
 * Не реагирует на клавиши, когда пользователь печатает в поле ввода.
 */
export function SecretTerminal() {
  const [open, setOpen] = useState(false);
  const [lines, setLines] = useState<TermLine[]>(() => [{ id: 0, text: BANNER, kind: 'sys' }]);
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState(-1);

  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const idRef = useRef(0);
  const navigate = useNavigate();
  const { user } = useAuth();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) {
        return;
      }
      // Backquote покрывает и «~», и «ё» (русская раскладка).
      if (e.code === 'Backquote' || e.key === '`' || e.key === '~') {
        e.preventDefault();
        setOpen((o) => !o);
        return;
      }
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Фокус в поле при открытии и автоскролл ленты.
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines, open]);

  const push = (text: string, kind: TermLine['kind'] = 'out') =>
    setLines((ls) => [...ls.slice(-160), { id: ++idRef.current, text, kind }]);

  const whoami = () => {
    if (!user) return 'guest@guest — войди в аккаунт, чтобы я узнал о тебе побольше';
    const p = user.studentProfile;
    return [
      `${user.role === 'Admin' ? 'root' : 'student'}@kkepka`,
      '──────────────',
      `Имя: ${user.displayName}`,
      p?.studyGroupName ? `Группа: ${p.studyGroupName}` : 'Группа: не указана',
      p?.averageMark != null ? `Средний балл: ${p.averageMark.toFixed(2)}` : 'Средний балл: —',
      `Дневник: ${user.hasDiaryLink ? 'привязан [ok]' : 'не привязан [--]'}`,
      `Роль: ${user.role === 'Admin' ? 'админ' : 'студент'}`,
    ].join('\n');
  };

  const runCommand = (raw: string) => {
    const cmdline = raw.trim();
    push(`student@kkepka:~$ ${cmdline}`, 'in');
    if (!cmdline) return;
    setHistory((h) => [...h.slice(-40), cmdline]);
    setHistoryIdx(-1);

    const [cmd, ...rest] = cmdline.split(/\s+/);
    const arg = rest.join(' ');
    const argLower = arg.toLowerCase();
    const cmdLower = cmd.toLowerCase();

    const nav = (to: string, warnDiary = false) => {
      if (warnDiary && user && !user.hasDiaryLink && user.role !== 'Admin') {
        push('Внимание: без привязанного дневника покажется заглушка (см. «profile»)', 'sys');
      }
      push(`Открываю ${to} …`, 'sys');
      navigate(to);
    };

    switch (cmdLower) {
      case 'help':
      case '?':
        push(HELP);
        break;
      case 'whoami':
        push(whoami());
        break;
      case 'schedule':
      case 'расписание':
        nav('/schedule');
        break;
      case 'grades':
      case 'оценки':
        nav('/grades');
        break;
      case 'chat':
      case 'chats':
        nav('/chats');
        break;
      case 'clubs':
      case 'кружки':
        nav('/clubs');
        break;
      case 'news':
      case 'новости':
        nav('/news');
        break;
      case 'assignments':
      case 'дз':
        nav('/assignments');
        break;
      case 'map':
      case 'карта':
        nav('/college-info/map');
        break;
      case 'profile':
      case 'профиль':
        nav('/profile');
        break;
      case 'games':
      case 'игры':
        nav('/games', true);
        break;
      case 'tux':
        push(`${TUX_ASCII}\n🐧 ${TUX_TIPS[Math.floor(Math.random() * TUX_TIPS.length)]}`);
        break;
      case 'date':
        push(new Date().toLocaleString('ru-RU'));
        break;
      case 'history':
        push(history.length ? history.join('\n') : '(пусто)');
        break;
      case 'clear':
        setLines([{ id: ++idRef.current, text: BANNER, kind: 'sys' }]);
        break;
      case 'exit':
      case 'quit':
        setOpen(false);
        break;
      case 'sudo':
        if (argLower === 'make me a sandwich') {
          push('🥪 Окей. Только не говори никому.');
        } else if (!arg) {
          push('использование: sudo <команда>');
        } else {
          push('student is not in the sudoers file.\nОб этом инциденте будет доложено. 🐧', 'err');
        }
        break;
      case 'rm':
        if (arg.includes('-rf')) {
          push('Tux перехватил команду и спрятал её в /dev/null. 🐧', 'sys');
        } else {
          push('rm: в терминале-пасхалке ничего не удаляется 🙂');
        }
        break;
      case 'ping':
        push(
          `PING ${arg || 'kkepka.local'} (127.0.0.1): 56 data bytes\n` +
          '64 bytes: icmp_seq=1 ttl=64 time=0.061 ms\n' +
          '🐧 packet received, approval granted',
        );
        break;
      default:
        push(`sh: ${cmd}: команда не найдена. Набери «help».`, 'err');
    }
  };

  const onInputKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      e.preventDefault();
      runCommand(input);
      setInput('');
      return;
    }
    if (e.key === 'ArrowUp' && history.length > 0) {
      e.preventDefault();
      const next = Math.max(0, (historyIdx < 0 ? history.length : historyIdx) - 1);
      setHistoryIdx(next);
      setInput(history[next] ?? '');
      return;
    }
    if (e.key === 'ArrowDown' && history.length > 0) {
      e.preventDefault();
      const idx = historyIdx < 0 ? history.length : historyIdx;
      const next = Math.min(history.length, idx + 1);
      if (next === history.length) {
        setHistoryIdx(-1);
        setInput('');
      } else {
        setHistoryIdx(next);
        setInput(history[next] ?? '');
      }
    }
  };

  if (!open) return null;

  return (
    <div className="fixed bottom-3 left-3 right-3 sm:right-auto sm:w-[680px] z-[70] font-mono text-xs rounded-2xl border border-primary-500/40 bg-dark-bg/95 backdrop-blur shadow-2xl shadow-primary-500/10 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-dark-border/60">
        <span className="text-dark-textMuted select-none">student@kkepka — terminal</span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-dark-textMuted hover:text-dark-text p-1 cursor-pointer"
          aria-label="Закрыть терминал"
        >
          ✕
        </button>
      </div>
      <div ref={scrollRef} className="max-h-[55vh] overflow-y-auto px-3 py-2 space-y-0.5">
        {lines.map((l) => (
          <pre
            key={l.id}
            className={`whitespace-pre-wrap [overflow-wrap:anywhere] leading-5 font-mono ${
              l.kind === 'in'
                ? 'text-sky-300'
                : l.kind === 'err'
                  ? 'text-red-400'
                  : l.kind === 'sys'
                    ? 'text-dark-textMuted'
                    : 'text-slate-200'
            }`}
          >
            {l.text}
          </pre>
        ))}
      </div>
      <div className="flex items-center gap-2 px-3 py-2 border-t border-dark-border/60">
        <span className="text-sky-300 shrink-0 select-none">student@kkepka:~$</span>
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onInputKey}
          className="flex-1 bg-transparent outline-none text-slate-100 placeholder:text-dark-textMuted/50"
          placeholder="help, whoami, tux …"
          spellCheck={false}
          autoComplete="off"
          aria-label="Команда терминала"
        />
      </div>
    </div>
  );
}
