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
    date: '2026-10-28',
    items: [
      {
        en: 'The page now counts anonymous usage (visits, chosen shapes, presets and download formats) on its own server, without cookies. Photos and settings are never sent.',
        de: 'Die Seite zählt jetzt anonym die Nutzung (Besuche, gewählte Formen, Vorlagen und Download-Formate) auf eigenem Server, ohne Cookies. Fotos und Einstellungen werden nie gesendet.',
        es: 'La página ahora cuenta el uso de forma anónima (visitas, formas elegidas, ajustes y formatos de descarga) en su propio servidor, sin cookies. Las fotos y los ajustes nunca se envían.',
        fr: "La page compte désormais l'utilisation de façon anonyme (visites, formes choisies, préréglages et formats de téléchargement) sur son propre serveur, sans cookies. Les photos et les réglages ne sont jamais envoyés.",
        it: "La pagina ora conta l'utilizzo in forma anonima (visite, forme scelte, preset e formati di download) sul proprio server, senza cookie. Foto e impostazioni non vengono mai inviate.",
      },
    ],
  },
  {
    date: '2026-10-27',
    items: [
      {
        en: 'Ball lamp: the E27 socket can stand inside the ball on a low plate (on an M10x1 threaded tube) instead of hanging in a tall base; the 20 cm globe preset now uses it.',
        de: 'Kugellampe: Die E27-Fassung kann auf einer flachen Platte in der Kugel stehen (auf einem Gewinderöhrchen M10x1), statt in einem hohen Sockel zu hängen; die Vorlage mit der 20-cm-Kugel nutzt das jetzt.',
        es: 'Lámpara de bola: el casquillo E27 puede ir de pie dentro de la bola sobre una placa baja (en un tubo roscado M10x1) en vez de colgar en una base alta; el ajuste del globo de 20 cm ya lo usa.',
        fr: "Lampe boule : la douille E27 peut se tenir dans la boule sur une plaque basse (sur un tube fileté M10x1) au lieu de pendre dans un socle haut ; le préréglage du globe de 20 cm l'utilise désormais.",
        it: 'Lampada a sfera: il portalampada E27 può stare dentro la sfera su una piastra bassa (su un tubo filettato M10x1) invece di pendere in una base alta; il preset del globo da 20 cm ora lo usa.',
      },
      {
        en: "Ball lamp: the back foot no longer sits in the cable's notch, where it printed loose from the base.",
        de: 'Kugellampe: Der hintere Fuß sitzt nicht mehr in der Kabelaussparung, wo er lose vom Sockel gedruckt wurde.',
        es: 'Lámpara de bola: la pata trasera ya no queda en la muesca del cable, donde se imprimía suelta de la base.',
        fr: "Lampe boule : le pied arrière n'est plus dans l'encoche du câble, où il s'imprimait détaché du socle.",
        it: "Lampada a sfera: il piedino posteriore non sta più nell'incavo del cavo, dove veniva stampato staccato dalla base.",
      },
      {
        en: 'Large lithophanes (such as a 25 cm ball) no longer vanish from the 3D view and the print view once their detail has loaded, and the page stalls less while a big one loads.',
        de: 'Große Lithophanien (etwa eine 25-cm-Kugel) verschwinden nicht mehr aus der 3D-Ansicht und der Druckansicht, sobald ihre Details geladen sind, und die Seite hakt beim Laden großer Lithophanien weniger.',
        es: 'Las litofanías grandes (como una bola de 25 cm) ya no desaparecen de la vista 3D ni de la vista de impresión cuando se carga su detalle, y la página se traba menos mientras carga una grande.',
        fr: "Les grandes lithophanies (comme une boule de 25 cm) ne disparaissent plus de la vue 3D ni de la vue d'impression une fois leurs détails chargés, et la page se fige moins pendant le chargement d'une grande.",
        it: "Le litofanie grandi (come una sfera da 25 cm) non scompaiono più dalla vista 3D e dalla vista di stampa quando il dettaglio è caricato, e la pagina si blocca meno mentre ne carica una grande.",
      },
      {
        en: 'Ball lamp: the globe presets with a puck light no longer keep the socket and feet of the preset picked before, and the preview shows a flat puck light and round bulbs (ball lamp and table shade).',
        de: 'Kugellampe: Die Globus-Vorlagen mit Puck-Leuchte behalten nicht mehr Fassung und Füße der zuvor gewählten Vorlage, und die Vorschau zeigt eine flache Puck-Leuchte und runde Glühbirnen (Kugellampe und Lampenschirm).',
        es: 'Lámpara de bola: los ajustes de globo con lámpara de disco ya no conservan el casquillo y las patas del ajuste elegido antes, y la vista previa muestra una lámpara de disco plana y bombillas redondas (lámpara de bola y pantalla).',
        fr: "Lampe boule : les préréglages de globe avec lampe palet ne gardent plus la douille et les pieds du préréglage choisi avant, et l'aperçu montre une lampe palet plate et des ampoules rondes (lampe boule et abat-jour).",
        it: "Lampada a sfera: i preset del globo con lampada a disco non mantengono più il portalampada e i piedini del preset scelto prima, e l'anteprima mostra una lampada a disco piatta e lampadine rotonde (lampada a sfera e paralume).",
      },
    ],
  },
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
        en: 'Ball lamp: three small feet under the base, and a preset with an E27 socket on feet (Ø 20 cm).',
        de: 'Kugellampe: drei kleine Füße unter dem Sockel und eine Vorlage mit E27-Fassung auf Füßen (Ø 20 cm).',
        es: 'Lámpara de bola: tres patas pequeñas bajo la base y un ajuste con casquillo E27 sobre patas (Ø 20 cm).',
        fr: 'Lampe boule : trois petits pieds sous le socle et un préréglage avec douille E27 sur pieds (Ø 20 cm).',
        it: 'Lampada a sfera: tre piccoli piedini sotto la base e un preset con portalampada E27 su piedini (Ø 20 cm).',
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
