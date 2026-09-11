import { useEffect } from 'preact/hooks';
import { route } from './state/router';
import { loadAppSettings } from './state/appSettings';
import { Home } from './screens/Home';
import { Editor } from './screens/Editor';

export function App() {
  useEffect(() => {
    loadAppSettings();
  }, []);

  const r = route.value;
  if (r.screen === 'editor') return <Editor projectId={r.projectId} />;
  return <Home />;
}
