import { Link } from 'react-router-dom';
import { AtomicActionView } from '../components/AtomicActionView';
export function AtomicActionLibraryPage() {
  return <main className="mx-auto w-full max-w-5xl overflow-auto p-6"><Link to="/simulations" className="text-primary">← 시뮬레이션 설정</Link><h1 className="my-4 text-2xl font-semibold">28개 행동 시각화</h1><AtomicActionView /></main>;
}
