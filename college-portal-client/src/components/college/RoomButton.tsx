import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collegeMapApi } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';

interface RoomButtonProps {
  roomName: string;
  lessonName?: string;
  teacherName?: string;
  className?: string;
}

const normalizeRoom = (value: string) => value.replace(/\s+/g, '').toLowerCase();

// Clickable classroom number: opens the auditorium on the college map,
// sends map managers to the map page with an open "add auditorium" form,
// or explains why the room cannot be found.
export function RoomButton({ roomName, lessonName, teacherName, className }: RoomButtonProps) {
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const [notFound, setNotFound] = useState<string | null>(null);
  const [isLookingUp, setIsLookingUp] = useState(false);

  const canManageMap = hasPermission('MapManage');

  const handleClick = async () => {
    const number = roomName.trim();
    if (!number || isLookingUp) return;
    setIsLookingUp(true);
    try {
      const res = await collegeMapApi.search(number);
      const match =
        res.data.auditoriums.find((a) => normalizeRoom(a.number) === normalizeRoom(number)) ??
        (res.data.auditoriums.length === 1 ? res.data.auditoriums[0] : null);
      if (match) {
        navigate(`/college-info/map?auditorium=${match.id}`);
        return;
      }
    } catch {
      // fall through to the not-found flow
    } finally {
      setIsLookingUp(false);
    }
    if (canManageMap) {
      const params = new URLSearchParams({ addNumber: number });
      if (lessonName) params.set('addLesson', lessonName);
      if (teacherName) params.set('addTeacher', teacherName);
      navigate(`/college-info/map?${params.toString()}`);
    } else {
      setNotFound(number);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={isLookingUp}
        className={
          className ??
          'block text-xs text-primary-400 hover:text-primary-300 hover:underline mt-1 disabled:opacity-60 text-left'
        }
        title="Показать аудиторию на карте"
      >
        Ауд. {roomName}
        {isLookingUp && ' …'}
      </button>

      {notFound && (
        <Modal title="Аудитория не найдена" onClose={() => setNotFound(null)}>
          <div className="space-y-3">
            <p className="text-sm text-dark-text">
              Не удалось найти аудиторию <span className="font-semibold">{'Ауд. '}{notFound}</span> на карте колледжа.
            </p>
            <p className="text-sm text-dark-textMuted">
              Добавить её на карту может администратор с правами доступа к карте.
            </p>
            <Button variant="secondary" size="sm" onClick={() => setNotFound(null)}>
              Закрыть
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}
