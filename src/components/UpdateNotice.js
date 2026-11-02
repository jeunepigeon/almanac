// Message « Almanac mis à jour » (1.32) : affiché une seule fois, au 1er lancement d'une nouvelle
// version du code (mise à jour sans build ou nouvel APK).
//  - 1re installation (aucune donnée) : rien, on mémorise juste la version ;
//  - attend que l'écran de verrouillage soit passé (sinon la fenêtre s'afficherait par-dessus).
import { useEffect, useState } from 'react';
import { useStore } from '../store';
import { getJSON, setJSON } from '../utils/prefs';
import { JS_VERSION, JS_NOTES } from '../version';
import InfoModal from './InfoModal';

const SEEN_KEY = 'almanac.lastSeenJsVersion';

export default function UpdateNotice() {
  const lockActive = useStore((s) => s.lockActive);
  const [pending, setPending] = useState(null); // { from } quand un message est à montrer
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const seen = await getJSON(SEEN_KEY, null);
      if (seen === JS_VERSION) return;
      await setJSON(SEEN_KEY, JS_VERSION); // une seule fois, même si l'app est fermée sans lire
      const st = useStore.getState();
      // Pas de version mémorisée : installs d'avant 1.32 → c'est une mise à jour s'il y a déjà des données
      const hadData = st.substances.length > 0 || st.archivedSubstances.length > 0 || st.snapshots.length > 0;
      if (seen == null && !hadData) return;
      if (alive) setPending({ from: seen });
    })();
    return () => { alive = false; };
  }, []);

  // Affiché dès que l'app est déverrouillée (ou tout de suite sans verrouillage)
  useEffect(() => {
    if (pending && !lockActive) {
      const t = setTimeout(() => { setOpen(true); useStore.getState().setUpdateNoticeOpen(true); }, 400); // laisse l'écran principal s'afficher
      return () => clearTimeout(t);
    }
    return undefined;
  }, [pending, lockActive]);

  const lines = JS_NOTES.map((n) => `· ${n}`).join('\n');
  return (
    <InfoModal
      visible={open}
      title={`Almanac mis à jour · ${JS_VERSION}`}
      message={pending?.from ? `Depuis la ${pending.from} :\n\n${lines}` : lines}
      onClose={() => { setOpen(false); setPending(null); useStore.getState().setUpdateNoticeOpen(false); }}
    />
  );
}
