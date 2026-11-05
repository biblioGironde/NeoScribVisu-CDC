// NeoScribVisu-CDC : tableau d'évolution des bibliothèques d'une intercommunalité (remplace le Looker « CDC Tableau évolutions »).
import {
  $, app, nf, nb, echapper, chargerDonnees, agreger, disponible, libelle, libelleEpci, cleTriEpci, formater,
  htmlTuiles, htmlEvolution, htmlBarresH, htmlAnneau, texteTypo, couleurTypo, texteProvisoire, moyenneGironde,
  activerInfobulles, preparerExport, NOTES_GENERALES, notesUtilisees,
} from './commun.js';

// ------------------------------------------------------------------ pages
const PAGES = [
  { id: 'situation', titre: 'Situation actuelle', blocs: [
    { type: 'tuiles', ids: ['population', 'surface', 'surface_par_hab', 'acq_total', 'acq_par_hab', 'emprunteurs', 'taux_emprunteurs', 'gratuite', 'accessible', 'dimanche'] },
    { type: 'grille', blocs: [{ type: 'typologies' }, { type: 'sigb' }] },
    { type: 'lieux' },
  ] },
  { id: 'comparaison', titre: 'Comparaison des lieux', blocs: [
    { type: 'grille', blocs: [
      { type: 'par-lieu', id: 'surface_par_hab', titre: 'Surface par habitant' },
      { type: 'par-lieu', id: 'acq_par_hab', titre: 'Dépense d\'acquisition par habitant' },
      { type: 'par-lieu', id: 'heures_hebdo', titre: 'Heures d\'ouverture hebdomadaires' },
      { type: 'par-lieu', id: 'taux_emprunteurs', titre: 'Emprunteurs actifs pour 100 habitants' },
    ] },
  ] },
  { id: 'diverses', titre: 'Évolutions diverses', blocs: [
    { type: 'grille', blocs: [
      { type: 'evolution', titre: 'Personnel (personnes)', ids: ['personnel_total', 'salaries', 'benevoles', 'benevoles_qualifies'] },
      { type: 'evolution', titre: 'Personnel (équivalents temps plein)', ids: ['etp_total', 'etp_salaries', 'etp_benevoles'] },
      { type: 'evolution', titre: 'Fonctionnaires de la filière culturelle', ids: ['conservateurs', 'bibliothecaires', 'assistants', 'adjoints'] },
      { type: 'evolution', titre: 'Dépenses d\'acquisition documentaire', ids: ['acq_total'] },
      { type: 'evolution', titre: 'Fréquentation (entrées dans les établissements)', ids: ['frequentation'] },
      { type: 'evolution', titre: 'Classes accueillies', ids: ['ecoles_classes', 'colleges_classes', 'lycees_classes'] },
    ] },
  ] },
  { id: 'usagers', titre: 'Usagers', blocs: [
    { type: 'grille', blocs: [
      { type: 'evolution', titre: 'Nouveaux inscrits', ids: ['nouveaux_inscrits', 'nouveaux_residents'] },
      { type: 'evolution', titre: 'Nouveaux inscrits par tranche d\'âge', ids: ['nouveaux_enfants', 'nouveaux_adultes', 'nouveaux_seniors', 'nouveaux_collectivites'] },
      { type: 'evolution', titre: 'Emprunteurs actifs', ids: ['emprunteurs', 'emprunteurs_residents'] },
      { type: 'evolution', titre: 'Emprunteurs actifs par tranche d\'âge', ids: ['emprunteurs_enfants', 'emprunteurs_adultes', 'emprunteurs_seniors', 'emprunteurs_collectivites'] },
    ] },
  ] },
  { id: 'livres', titre: 'Collections : livres', blocs: [
    { type: 'grille', blocs: [
      { type: 'evolution', titre: 'Fonds de livres selon la provenance', ids: ['livres_fonds', 'livres_bdp'], note: 'Fonds propre (hors dépôt) et livres déposés par biblio.gironde.' },
      { type: 'evolution', titre: 'Fonds propre de livres par public', ids: ['livres_fonds_adultes', 'livres_fonds_enfants'] },
      { type: 'evolution', titre: 'Budget d\'acquisition de livres imprimés', ids: ['acq_livres'] },
      { type: 'evolution', titre: 'Acquisitions de livres', ids: ['livres_acq_adultes', 'livres_acq_enfants'] },
      { type: 'evolution', titre: 'Éliminations (désherbage) de livres', ids: ['livres_pilons_adultes', 'livres_pilons_enfants'] },
    ] },
  ] },
  { id: 'autres', titre: 'Collections : autres supports', blocs: [
    { type: 'grille', blocs: [
      { type: 'evolution', titre: 'Fonds', ids: ['cd_fonds', 'dvd_fonds', 'jv_fonds'] },
      { type: 'evolution', titre: 'Abonnements de presse en cours', ids: ['presse_abonnements'] },
      { type: 'evolution', titre: 'Acquisitions', ids: ['cd_acq', 'dvd_acq', 'jv_acq'] },
      { type: 'evolution', titre: 'Éliminations', ids: ['cd_pilons', 'dvd_pilons', 'jv_pilons'] },
      { type: 'evolution', titre: 'Budgets d\'acquisition', ids: ['acq_sonores', 'acq_dvd', 'acq_jv', 'acq_presse'] },
    ] },
  ] },
  { id: 'emprunts', titre: 'Emprunts', blocs: [
    { type: 'grille', blocs: [
      { type: 'evolution', titre: 'Prêts de livres', ids: ['prets_livres'] },
      { type: 'evolution', titre: 'Prêts des autres supports', ids: ['prets_presse', 'prets_sonores', 'prets_video', 'prets_autres'] },
      { type: 'evolution', titre: 'Prêts par public', ids: ['prets_adultes', 'prets_enfants', 'prets_collectivites'] },
      { type: 'evolution', titre: 'Livres empruntés par emprunteur actif', ids: ['livres_par_emprunteur'] },
    ] },
  ] },
];

const LIBELLES = { population: 'Population des communes équipées' };

// ------------------------------------------------------------------ état
const etat = { page: 'situation', annee: null, epci: '' };
const lignesDe = (annee) => (app.donnees[annee] ?? []).filter((e) => e.epci === etat.epci);
const ctx = (interactif = true) => ({ annee: etat.annee, interactif, plusieurs: true, libelles: LIBELLES, lignes: lignesDe });
let listeEpci = [];

function lireAdresse() {
  const p = new URLSearchParams(location.hash.slice(1));
  if (PAGES.some((pg) => pg.id === p.get('page'))) etat.page = p.get('page');
  if (p.has('annee') && app.annees.includes(Number(p.get('annee')))) etat.annee = Number(p.get('annee'));
  etat.epci = listeEpci.some(([c]) => c === p.get('epci')) ? p.get('epci') : '';
}
function ecrireAdresse() {
  const p = new URLSearchParams({ page: etat.page, annee: etat.annee });
  if (etat.epci) p.set('epci', etat.epci);
  history.replaceState(null, '', `#${p}`);
}

// ------------------------------------------------------------------ blocs propres à l'intercommunalité
function rendreBloc(b, c) {
  switch (b.type) {
    case 'grille': return `<div class="grille">${b.blocs.map((x) => rendreBloc(x, c)).join('')}</div>`;
    case 'tuiles': return htmlTuiles(b.ids, c);
    case 'evolution': return htmlEvolution(b, c);
    case 'typologies': return htmlTypologies(c);
    case 'sigb': return htmlSigb(c);
    case 'lieux': return htmlLieux(c);
    case 'par-lieu': return htmlParLieu(b, c);
  }
  return '';
}

function htmlTypologies(c) {
  const comptes = {};
  for (const e of c.lignes(c.annee)) if (e.type === 'lieu' && e.typologie) comptes[e.typologie] = (comptes[e.typologie] ?? 0) + 1;
  const items = Object.entries(comptes).sort().map(([t, n]) => ({ nom: `Typologie ${t}`, v: n, couleur: couleurTypo(t) }));
  return htmlAnneau({ titre: `Lieux de lecture par typologie (${c.annee})`, items });
}

function htmlSigb(c) {
  // Un lieu par ligne : on ne compte pas la ligne « réseau » en plus de ses lieux.
  const lieux = c.lignes(c.annee).filter((e) => e.type === 'lieu');
  const r = agreger('sigb', lieux, c.annee);
  const items = Object.entries(r?.categories ?? {}).sort((a, b) => b[1] - a[1]).map(([nom, v]) => ({ nom, v }));
  const sans = lieux.filter((e) => !e.v.sigb).length;
  return htmlBarresH({ titre: `Logiciel (SIGB) des lieux de lecture (${c.annee})`, items, id: 'personnel_total' })
    .replace('</figure>', `${sans ? `<p class="graphique-note">${nb(sans, 'lieu sans SIGB déclaré', 'lieux sans SIGB déclaré')}.</p>` : ''}<p class="graphique-note">Les lieux sans SIGB déclaré reprennent celui de leur réseau intercommunal ou communal.</p></figure>`);
}

const nomCourt = (e, lignes) => {
  if (e.type === 'reseau') return `${e.commune} (réseau)`;
  const homonymes = lignes.filter((x) => x.type === 'lieu' && x.commune === e.commune).length;
  return homonymes > 1 ? `${e.commune} – ${e.nom}` : e.commune;
};

function htmlLieux(c) {
  const lignes = [...c.lignes(c.annee)].sort((a, b) => a.commune.localeCompare(b.commune, 'fr') || (a.type === 'reseau') - (b.type === 'reseau') || a.nom.localeCompare(b.nom, 'fr'));
  if (!lignes.length) return '';
  const val = (id, e) => (disponible(id, c.annee) ? formater(id, e.v[id]) : 'n.c.');
  const corps = lignes.map((e) => `<tr class="${e.type === 'reseau' ? 'reseau' : ''}">
    <td class="texte">${echapper(e.nom)}</td><td class="texte">${echapper(e.commune)}</td>
    <td>${e.v.population != null ? nf().format(e.v.population) : '–'}</td>
    <td class="texte">${e.typologie ? `<span class="pastille" style="background:${couleurTypo(e.typologie)}"></span>${e.typologie}` : ''}</td>
    <td>${val('surface', e)}</td><td>${val('heures_hebdo', e)}</td><td>${val('gratuite', e)}</td>
    <td class="texte">${echapper(e.v.sigb ?? '–')}</td></tr>`).join('');
  return `<h2 class="tableau-titre">Lieux de lecture et réseaux (${c.annee})</h2><div class="tableau-defilement"><table class="tableau-lieux">
    <thead><tr><th class="texte">Établissement</th><th class="texte">Commune</th><th>Population de la commune</th><th class="texte">Typologie</th>
    <th>Surface (m²)</th><th>Heures d'ouverture</th><th>Gratuité</th><th class="texte">SIGB</th></tr></thead><tbody>${corps}</tbody></table></div>
    <p class="graphique-note">Une ligne « réseau » porte les données saisies pour l'ensemble d'un réseau multi-sites (personnel, budgets…). Les noms des responsables, présents dans l'enquête, ne sont pas publiés.</p>`;
}

function htmlParLieu(b, c) {
  const lignes = c.lignes(c.annee);
  const items = lignes.map((e) => ({ e, v: agreger(b.id, [e], c.annee)?.valeur }))
    .filter((x) => x.v != null)
    .map(({ e, v }) => ({ nom: nomCourt(e, lignes), v, classe: e.type === 'reseau' ? ' reseau' : '' }))
    .sort((a, b) => b.v - a.v);
  const ref = moyenneGironde(b.id, c.annee);
  return htmlBarresH({ titre: `${b.titre} (${c.annee})`, items, id: b.id, reference: ref, referenceLibelle: `Moyenne des lieux de Gironde en ${c.annee}` });
}

const rendrePage = (p, interactif = true) => p.blocs.map((b) => rendreBloc(b, ctx(interactif))).join('');

// ------------------------------------------------------------------ affichage
function sousTitre() {
  if (!etat.epci) return '';
  const lignes = lignesDe(etat.annee);
  const lieux = lignes.filter((e) => e.type === 'lieu').length;
  const reseaux = lignes.length - lieux;
  const pop = app.populationEpci[etat.annee]?.[etat.epci];
  return `${nb(lieux, 'lieu de lecture', 'lieux de lecture')}${reseaux ? ` et ${nb(reseaux, 'réseau', 'réseaux')}` : ''} ayant répondu en ${etat.annee}`
    + (pop ? `, ${nf().format(pop)} habitants dans l'intercommunalité` : '') + ` – évolution ${app.annees[0]}–${app.annees.at(-1)}`;
}

function afficher() {
  ecrireAdresse();
  for (const a of document.querySelectorAll('#liste-pages a')) {
    if (a.dataset.page === etat.page && etat.epci) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  }
  const f = $('.filtres');
  f.annee.value = etat.annee;
  f.epci.value = etat.epci;
  $('.ouvrir-export').disabled = !etat.epci;
  if (!etat.epci) { afficherAccueil(); return; }
  const page = PAGES.find((p) => p.id === etat.page);
  document.title = `${libelleEpci(etat.epci)} – ${page.titre} – NeoScribVisu`;
  $('.entete-page').innerHTML = `<p class="surtitre">${echapper(page.titre)}</p><h1>${echapper(libelleEpci(etat.epci))}</h1><p class="perimetre">${echapper(sousTitre())}</p>`;
  const avert = texteProvisoire(etat.annee, lignesDe(etat.annee));
  $('.avertissement').hidden = !avert;
  $('.avertissement').textContent = avert;
  $('.page').innerHTML = rendrePage(page);
  afficherMethode();
}

function afficherAccueil() {
  document.title = 'NeoScribVisu – évolution d\'une intercommunalité';
  $('.avertissement').hidden = true;
  $('.entete-page').innerHTML = `<h1>Évolution d'une intercommunalité</h1><p class="perimetre">Choisissez une intercommunalité.</p>`;
  $('.page').innerHTML = `<ul class="liste-epci">${listeEpci.map(([code, nom]) => {
    const lieux = (app.donnees[etat.annee] ?? []).filter((e) => e.epci === code && e.type === 'lieu').length;
    return `<li><a href="#page=situation&annee=${etat.annee}&epci=${code}" data-epci="${code}">${echapper(nom)}</a> <span class="compte">${nb(lieux, 'lieu', 'lieux')}</span></li>`;
  }).join('')}</ul>`;
  afficherMethode();
}

function afficherMethode() {
  $('.a-savoir ul').innerHTML = [...NOTES_GENERALES, ...notesUtilisees()].map((n) => `<li>${echapper(n)}</li>`).join('');
}

// ------------------------------------------------------------------ interface
function preparer() {
  listeEpci = Object.keys(app.meta.epci).map((c) => [c, libelleEpci(c)])
    .sort((a, b) => cleTriEpci(a[1]).localeCompare(cleTriEpci(b[1]), 'fr'));
  const f = $('.filtres');
  f.epci.innerHTML = '<option value="">Choisir…</option>' + listeEpci.map(([c, l]) => `<option value="${c}">${echapper(l)}</option>`).join('');
  f.annee.innerHTML = [...app.annees].reverse().map((a) => `<option value="${a}">${a}</option>`).join('');
  f.addEventListener('change', (ev) => {
    if (ev.target.name === 'annee') etat.annee = Number(ev.target.value);
    if (ev.target.name === 'epci') etat.epci = ev.target.value;
    afficher();
  });

  $('#liste-pages').innerHTML = PAGES.map((p) => `<li><a href="#page=${p.id}" data-page="${p.id}">${echapper(p.titre)}</a></li>`).join('');
  $('#liste-pages').addEventListener('click', (ev) => {
    const a = ev.target.closest('a[data-page]');
    if (!a) return;
    ev.preventDefault();
    etat.page = a.dataset.page;
    if (matchMedia('(max-width: 860px)').matches) basculerMenu(false);
    afficher();
    scrollTo({ top: 0 });
  });
  $('.bouton-menu').addEventListener('click', () => basculerMenu($('.bouton-menu').getAttribute('aria-expanded') !== 'true'));
  if (matchMedia('(max-width: 860px)').matches) basculerMenu(false);

  $('.page').addEventListener('click', (ev) => {
    const a = ev.target.closest('a[data-epci]');
    if (!a) return;
    ev.preventDefault();
    etat.epci = a.dataset.epci;
    etat.page = 'situation';
    afficher();
    scrollTo({ top: 0 });
  });

  preparerExport({ pages: () => PAGES, rendrePage, titreDocument: () => `${libelleEpci(etat.epci)} – NeoScribVisu`, sousTitre });
  activerInfobulles();
}

function basculerMenu(ouvert) {
  $('.bouton-menu').setAttribute('aria-expanded', String(ouvert));
  $('#liste-pages').dataset.ferme = String(!ouvert);
}

// ------------------------------------------------------------------ démarrage
try {
  await chargerDonnees();
  etat.annee = Math.max(...app.annees);
  preparer();
  lireAdresse();
  addEventListener('hashchange', () => { lireAdresse(); afficher(); });
  afficher();
} catch (err) {
  $('.page').innerHTML = `<p class="avertissement">Les données n'ont pas pu être chargées depuis ${echapper(app.source)} (${echapper(err.message)}).</p>`;
  console.error(err);
}
