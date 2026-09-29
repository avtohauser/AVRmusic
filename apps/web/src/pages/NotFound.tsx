import { M3eButton } from '@/md';
import { FlowText } from '@/components/FlowText';
export default function NotFound() {
  return (
    <div className="page pt-20 text-center">
      <FlowText as="div" text="404" className="md-display-lg emph text-primary" speed={3} />
      <p className="md-body-lg muted mt-2">Страница не найдена</p>
      <M3eButton variant="filled" className="mt-6" href="/">На главную</M3eButton>
    </div>
  );
}
