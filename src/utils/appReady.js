// Attend que l'app soit VRAIMENT visible avant de jouer un flash déclenché par une notification
// (1.37 : extrait de la page Substances pour servir aussi à la page d'une substance).
// Visible = app au premier plan, écran de verrouillage fermé, message « mis à jour » fermé.
//  - réévalue à chaque changement d'état de l'app / du store, avec 150 ms de marge (au retour dans
//    l'app, le verrouillage se déclare juste APRÈS le passage à « active ») ;
//  - filet de 1,5 s : l'état « active » peut être passé avant l'abonnement (1.28).
// Renvoie une fonction d'annulation. `trace(step, info)` (optionnel) alimente la trace Debug.
import { AppState } from 'react-native';
import { useStore } from '../store';

export function appStateInfo() {
  const st = useStore.getState();
  return `app ${AppState.currentState}${st.lockActive ? ' · verrouillée' : ''}${st.updateNoticeOpen ? ' · message MAJ ouvert' : ''}`;
}

export function waitForAppReady(onReady, trace = null) {
  let done = false;
  const pending = [];
  let unsubStore = null;
  let sub = null;
  let tFallback = null;
  const blocked = () => {
    const st = useStore.getState();
    return st.lockActive || st.updateNoticeOpen;
  };
  const cleanup = () => {
    pending.forEach(clearTimeout);
    clearTimeout(tFallback);
    sub?.remove(); sub = null;
    unsubStore?.(); unsubStore = null;
  };
  const go = (why) => {
    if (done) return;
    done = true;
    cleanup();
    trace?.(`départ (${why})`, appStateInfo());
    onReady();
  };
  const tryGo = () => {
    if (done || AppState.currentState !== 'active' || blocked()) return;
    go('direct');
  };
  const later = () => { pending.push(setTimeout(tryGo, 150)); };
  unsubStore = useStore.subscribe(later);
  sub = AppState.addEventListener('change', (s) => { trace?.(`app → ${s}`); if (s === 'active') later(); });
  tFallback = setTimeout(() => {
    if (done) return;
    if (!blocked()) go('filet 1,5 s');
    else trace?.('filet 1,5 s : bloqué', appStateInfo());
  }, 1500);
  later();
  return () => { done = true; cleanup(); };
}
