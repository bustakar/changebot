import { Changelog } from './components/Changelog';

export const dynamic = 'force-dynamic';

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Changelog />
    </div>
  );
}
