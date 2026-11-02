export const THEME_KEY = 'rc:theme';
const QUERY = '(prefers-color-scheme: dark)';

/** Script inline din <head>: aplică tema înainte de prima afișare (fără clipire). Trebuie să rămână în acord cu `applyTheme` din theme.ts. */
export const THEME_INIT_SCRIPT = `(function(){try{var m=localStorage.getItem('${THEME_KEY}');var d=m==='dark'||((m!=='light')&&window.matchMedia('${QUERY}').matches);document.documentElement.dataset.theme=d?'dark':'light'}catch(e){}})();`;
