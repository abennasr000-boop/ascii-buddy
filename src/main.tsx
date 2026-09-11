import { render } from 'preact';
import { App } from './App';
import { installHeadAssets, preventPageGestures } from './bootstrap';
import { installAutosaveFlushers } from './state/autosave';
import './style.css';

installHeadAssets();
preventPageGestures();
installAutosaveFlushers();

render(<App />, document.getElementById('root')!);
