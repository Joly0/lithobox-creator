// "What's new" on the page: changes that affect what people print or see, newest first.
// Each item in every language of src/i18n/locales; a missing one falls back to English.

/** Last commit when the page was built (short hash, YYYY-MM-DD), set by vite.config.ts. */
declare const __APP_VERSION__: { commit: string; date: string };
export const VERSION = __APP_VERSION__;

export interface ChangeDay {
  date: string;
  items: ({ en: string } & Record<string, string>)[];
}

export const CHANGES: ChangeDay[] = [
  {
    date: '2026-10-26',
    items: [
      {
        en: 'Support fins on standing lithophanes now break off cleanly. This works only in the 3MF for Bambu Studio / Orca: in STL and Plain 3MF they stay fused to the picture.',
        de: 'Die Stützstege stehender Lithophanien brechen jetzt sauber ab. Das klappt nur beim 3MF für Bambu Studio / Orca: In STL und einfachem 3MF bleiben sie mit dem Bild verschmolzen.',
        es: 'Las aletas de soporte de las litofanías de pie ahora se desprenden limpiamente. Solo funciona con el 3MF para Bambu Studio / Orca: en STL y 3MF sencillo siguen fundidas con la imagen.',
        fr: "Les ailettes de maintien des lithophanies debout se détachent désormais proprement. Cela ne marche qu'avec le 3MF pour Bambu Studio / Orca : en STL et en 3MF simple, elles restent soudées à l'image.",
        it: "Le pinne di supporto delle litofanie in piedi ora si staccano in modo pulito. Funziona solo con il 3MF per Bambu Studio / Orca: in STL e 3MF semplice restano fuse con l'immagine.",
      },
      {
        en: 'Ball lamp: three small feet under the base, and a FADO-style preset (Ø 20 cm, E27 socket).',
        de: 'Kugellampe: drei kleine Füße unter dem Sockel und eine Vorlage im Stil der FADO (Ø 20 cm, E27-Fassung).',
        es: 'Lámpara de bola: tres patas pequeñas bajo la base y un ajuste estilo FADO (Ø 20 cm, casquillo E27).',
        fr: 'Lampe boule : trois petits pieds sous le socle et un préréglage style FADO (Ø 20 cm, douille E27).',
        it: 'Lampada a sfera: tre piccoli piedini sotto la base e un preset in stile FADO (Ø 20 cm, portalampada E27).',
      },
      {
        en: "The steel disc recess fits the measured disc, and the ball lamp's cable hole is round.",
        de: 'Die Vertiefung für die Stahlscheibe passt zur nachgemessenen Scheibe, und das Kabelloch der Kugellampe ist rund.',
        es: 'El hueco del disco de acero se ajusta al disco medido y el orificio del cable de la lámpara de bola es redondo.',
        fr: "Le logement du disque en acier correspond au disque mesuré, et le trou de câble de la lampe boule est rond.",
        it: "L'incavo del disco d'acciaio corrisponde al disco misurato e il foro del cavo della lampada a sfera è rotondo.",
      },
    ],
  },
  {
    date: '2026-10-25',
    items: [
      {
        en: 'A lamp foot mount for the lampshade, a puck base for the heart and a stand for the arc.',
        de: 'Eine Lampenfuß-Halterung für den Lampenschirm, ein runder Sockel für das Herz und ein Ständer für den Bogen.',
        es: 'Un soporte de pie de lámpara para la pantalla, una base redonda para el corazón y un soporte para el arco.',
        fr: "Une fixation sur pied de lampe pour l'abat-jour, un socle rond pour le cœur et un support pour l'arc.",
        it: "Un attacco per piede di lampada per il paralume, una base rotonda per il cuore e un supporto per l'arco.",
      },
      {
        en: 'New "Clearances" settings on every shape, to loosen or tighten parts that fit into each other.',
        de: 'Neue Einstellungen „Spiel und Passungen“ bei jeder Form, um ineinandergesteckte Teile lockerer oder fester zu machen.',
        es: 'Nuevos ajustes de "Holguras" en todas las formas, para aflojar o apretar las piezas que encajan entre sí.',
        fr: 'Nouveaux réglages « Jeux » sur chaque forme, pour desserrer ou resserrer les pièces qui s\'emboîtent.',
        it: 'Nuove impostazioni "Giochi" su ogni forma, per allentare o stringere le parti che si incastrano.',
      },
      {
        en: 'Help texts on settings that need them (also on touch screens), picture formats that keep width and height in step, and a reset for single settings.',
        de: 'Hilfetexte bei Einstellungen, die sie brauchen (auch auf Touchscreens), Bildformate, die Breite und Höhe gemeinsam ändern, und ein Zurücksetzen einzelner Einstellungen.',
        es: 'Textos de ayuda en los ajustes que los necesitan (también en pantallas táctiles), formatos de imagen que mantienen ancho y alto a la par, y restablecer ajustes sueltos.',
        fr: "Des textes d'aide sur les réglages qui en ont besoin (aussi sur écran tactile), des formats d'image qui lient largeur et hauteur, et la réinitialisation d'un seul réglage.",
        it: "Testi di aiuto sulle impostazioni che ne hanno bisogno (anche su touch screen), formati immagine che legano larghezza e altezza e il ripristino di singole impostazioni.",
      },
      {
        en: 'On phones the page fits the screen, with a handle to drag between preview and settings. The view toggles are kept across reloads.',
        de: 'Auf dem Handy passt die Seite auf den Bildschirm, mit einem Griff zum Verschieben zwischen Vorschau und Einstellungen. Die Ansichtsschalter bleiben beim Neuladen erhalten.',
        es: 'En el móvil la página cabe en la pantalla, con un tirador entre la vista previa y los ajustes. Los interruptores de vista se mantienen al recargar.',
        fr: "Sur téléphone, la page tient à l'écran, avec une poignée entre l'aperçu et les réglages. Les options d'affichage sont conservées au rechargement.",
        it: "Sul telefono la pagina sta nello schermo, con una maniglia tra anteprima e impostazioni. Le opzioni di visualizzazione restano dopo il ricaricamento.",
      },
    ],
  },
];
