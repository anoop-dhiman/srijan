import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import TsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';
import loader from '@monaco-editor/loader';
import * as monaco from 'monaco-editor';

// Configure Monaco to use locally bundled workers — no CDN requests
window.MonacoEnvironment = {
  getWorker(_: string, label: string) {
    if (label === 'typescript' || label === 'javascript') {
      return new TsWorker();
    }
    return new EditorWorker();
  },
};

loader.config({ monaco });

export { default } from '@monaco-editor/react';
