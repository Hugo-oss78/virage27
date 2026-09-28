import React from "react";

// Icônes dessinées sur-mesure pour Virage 27 (pas de bibliothèque d'icônes génériques,
// pas d'emoji) : navigation, catégories, alertes, badge "à revoir".
// Toutes sur une grille 24x24, style trait, cohérentes avec la charte de l'app.

function Base({ size = 20, strokeWidth = 1.75, children, ...props }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {children}
    </svg>
  );
}

// nav : ajouter — carte + trait vertical/horizontal, coins arrondis façon fiche
export function IconAdd(props) {
  return (
    <Base {...props}>
      <rect x="4" y="4" width="16" height="16" rx="5" />
      <path d="M12 8.5v7M8.5 12h7" />
    </Base>
  );
}

// nav : recherche — loupe avec anse légèrement incurvée (clin d'œil à la vague)
export function IconSearch(props) {
  return (
    <Base {...props}>
      <circle cx="10.5" cy="10.5" r="6" />
      <path d="M15 15.5c1.6 1.4 2.8 2.6 4.2 4" />
    </Base>
  );
}

// nav : classement — barres ascendantes
export function IconRank(props) {
  return (
    <Base {...props}>
      <path d="M5 19V13" />
      <path d="M12 19V8" />
      <path d="M19 19V5" />
    </Base>
  );
}

// nav : rappels — cloche dessinée à la main
export function IconBell(props) {
  return (
    <Base {...props}>
      <path d="M12 4.2c-3 0-4.6 2.3-4.6 5.4 0 4.3-1.4 5.4-1.9 6.1h13c-.5-.7-1.9-1.8-1.9-6.1 0-3.1-1.6-5.4-4.6-5.4Z" />
      <path d="M10.2 18.3a1.9 1.9 0 0 0 3.6 0" />
    </Base>
  );
}

// nav : sauvegarde — bouée de sauvetage (clin d'œil plongée/mer)
export function IconSave(props) {
  return (
    <Base {...props}>
      <circle cx="12" cy="12" r="7.5" />
      <circle cx="12" cy="12" r="3" />
      <path d="M12 4.5v3.3M12 16.2v3.3M4.5 12h3.3M16.2 12h3.3" />
    </Base>
  );
}

// catégorie : formation — livre ouvert
export function IconFormation(props) {
  return (
    <Base {...props}>
      <path d="M12 6.2c-1.6-1.1-3.6-1.5-5.5-1.2v12.4c1.9-.3 3.9.1 5.5 1.2 1.6-1.1 3.6-1.5 5.5-1.2V5c-1.9-.3-3.9.1-5.5 1.2Z" />
      <path d="M12 6.2v12.4" />
    </Base>
  );
}

// catégorie : voyage — avion en papier
export function IconVoyage(props) {
  return (
    <Base {...props}>
      <path d="M20 4 4.5 10.2c-.6.25-.55 1.1.08 1.3l5.1 1.5 1.5 5.1c.2.63 1.05.68 1.3.08L20 4Z" />
      <path d="M11.2 13.9 20 4" />
    </Base>
  );
}

// catégorie : job / pro — mallette
export function IconJob(props) {
  return (
    <Base {...props}>
      <rect x="3.5" y="8" width="17" height="11" rx="2" />
      <path d="M8.5 8V6.3A1.8 1.8 0 0 1 10.3 4.5h3.4A1.8 1.8 0 0 1 15.5 6.3V8" />
      <path d="M3.5 13h17" />
    </Base>
  );
}

// alerte — triangle d'avertissement dessiné à la main
export function IconAlert(props) {
  return (
    <Base {...props}>
      <path d="M12 4 21 19.5H3Z" />
      <path d="M12 10.3v4M12 16.7v.1" />
    </Base>
  );
}

// badge "à revoir" — petite étoile-repère
export function IconReview(props) {
  return (
    <Base strokeWidth={1.9} {...props}>
      <path d="M12 4.5l1.8 4.2 4.5.4-3.4 3 1 4.4L12 14.2 7.9 16.5l1.1-4.4-3.5-3 4.5-.4Z" />
    </Base>
  );
}
