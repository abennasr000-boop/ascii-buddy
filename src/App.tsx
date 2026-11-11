import { useEffect } from 'preact/hooks';
import { route } from './state/router';
import { loadAppSettings } from './state/appSettings';
import { loadPaletteLibrary } from './state/paletteLibrary';
import { loadProjects, projectsLoaded } from './state/projects';
import { loadThumbnails } from './state/thumbnails';
import { Home } from './screens/Home';
import { Editor } from './screens/Editor';

export function App() {
  useEffect(() => {
    loadAppSettings();
    void loadPaletteLibrary();
    if (!projectsLoaded.value) void loadProjects().then(loadThumbnails);
  }, []);

  const r = route.value;
  if (r.screen === 'editor') return <Editor projectId={r.projectId} />;
  return <Home />;
}
