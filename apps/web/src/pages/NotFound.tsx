import { Link } from 'react-router-dom';
export default function NotFound() {
  return (
    <div className="page pt-20 text-center">
      <div className="text-7xl font-extrabold text-gradient">404</div>
      <p className="text-muted mt-2">Страница не найдена</p>
      <Link to="/" className="btn btn-primary mt-6">На главную</Link>
    </div>
  );
}
