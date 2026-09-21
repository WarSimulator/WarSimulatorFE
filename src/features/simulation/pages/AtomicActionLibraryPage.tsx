import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AtomicActionView } from '../components/AtomicActionView';
import { Google3DAtomicActionView } from '../components/Google3DAtomicActionView';
export function AtomicActionLibraryPage() {
  const [searchParams] = useSearchParams();
  const [view, setView] = useState<'2d' | '3d'>(searchParams.get('view') === '3d' ? '3d' : '2d');
  const returnPath = searchParams.get('return') === '/simulations/3d/edit' ? '/simulations/3d/edit' : '/simulations/setup';
  return <main className={`mx-auto w-full overflow-auto p-6 ${view === '3d' ? 'max-w-[1440px]' : 'max-w-5xl'}`}>
    <Link to={returnPath} className="text-primary">← {returnPath.endsWith('/3d/edit') ? 'Mil-Simulator 3D EDIT' : '시뮬레이션 설정'}</Link>
    <div className="my-4 flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="text-2xl font-semibold">28개 행동 시각화</h1><p className="mt-1 text-sm text-on-surface-variant">동일한 액션 디자인을 2D 원본과 Google 3D 지형에서 비교합니다.</p></div>
      <div className="flex rounded border border-outline-variant p-1">
        <button type="button" onClick={() => setView('3d')} className={`rounded px-4 py-2 text-sm ${view === '3d' ? 'bg-primary text-on-primary' : 'text-on-surface-variant'}`}>3D 지도</button>
        <button type="button" onClick={() => setView('2d')} className={`rounded px-4 py-2 text-sm ${view === '2d' ? 'bg-primary text-on-primary' : 'text-on-surface-variant'}`}>2D 원본</button>
      </div>
    </div>
    {view === '3d' ? <Google3DAtomicActionView /> : <AtomicActionView />}
  </main>;
}
