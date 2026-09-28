import { M3eButton } from '@/md';
export default function NotFound() {
  return (
    <div className="page pt-20 text-center">
      <div className="md-display-lg emph text-primary">404</div>
      <p className="md-body-lg muted mt-2">Страница не найдена</p>
      <M3eButton variant="filled" className="mt-6" href="/">На главную</M3eButton>
    </div>
  );
}
