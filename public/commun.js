// Socle commun aux tableaux d'évolution NeoScribVisu (bibliothèque et intercommunalité).
// Ce fichier est identique dans les dépôts NeoScribVisu-BM et NeoScribVisu-CDC : toute correction se reporte dans les deux.
//
// Les données ne sont pas recalculées ici : elles sont lues dans les fichiers publiés par NeoScribVisu
// (même import, mêmes indicateurs, mêmes contrôles contre le Looker d'origine).

export const $ = (s, el = document) => el.querySelector(s);
export const nf = (d = 0) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: d, minimumFractionDigits: 0 });
const compact = new Intl.NumberFormat('fr-FR', { notation: 'compact', maximumFractionDigits: 1 });
const pct = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1, signDisplay: 'always' });
export const echapper = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const nb = (n, un, plusieurs) => `${nf().format(n)} ${n > 1 ? plusieurs : un}`;

/** Adresse des données publiées par NeoScribVisu.
 *  ?donnees=… dans l'adresse permet de pointer vers une autre copie (par exemple un import local). */
function sourceDonnees() {
  const p = new URLSearchParams(location.search).get('donnees');
  if (p) return p.endsWith('/') ? p : `${p}/`;
  if (location.hostname.endsWith('github.io')) return '/NeoScribVisu/data/';
  return 'https://bibliogironde.github.io/NeoScribVisu/data/';
}

// Indicateurs propres aux tableaux d'évolution, calculés à partir de ceux de NeoScribVisu.
const INDICATEURS_LOCAUX = {
  surface_par_hab: { libelle: 'Surface par habitant', agregation: 'ratio', numerateur: 'surface', denominateur: 'population', decimales: 2, unite: 'm²/hab.' },
};

export const app = { meta: null, donnees: {}, populationEpci: {}, source: sourceDonnees() };

export async function chargerDonnees() {
  const lire = async (f) => {
    const r = await fetch(app.source + f);
    if (!r.ok) throw new Error(`${f} : ${r.status}`);
    return r.json();
  };
  app.meta = await lire('meta.json');
  Object.assign(app.meta.indicateurs, INDICATEURS_LOCAUX);
  await Promise.all(app.meta.annees.map(async (a) => {
    const j = await lire(`${a}.json`);
    marquerReseaux(j.etablissements);
    app.donnees[a] = j.etablissements;
    app.populationEpci[a] = j.population_epci ?? {};
  }));
  app.annees = [...app.meta.annees].sort();
}

const ind = (id) => app.meta.indicateurs[id];
export const libelle = (id) => ind(id)?.libelle ?? id;
export const unite = (id) => ind(id)?.unite ?? '';
export const disponible = (id, annee) => {
  const i = ind(id);
  if (!i) return false;
  if (i.agregation === 'ratio') return [i.numerateur, i.denominateur].filter(Boolean).every((d) => disponible(d, annee));
  return i.disponibilite?.[annee] !== false;
};
export const libelleEpci = (code) => (app.meta.epci[code] ?? code ?? 'Intercommunalité inconnue')
  .replace(/^Communauté de communes /i, 'CC ')
  .replace(/^Communauté d'agglomération /i, 'CA ');
export const cleTriEpci = (l) => l.replace(/^(CC|CA) (de |du |des |de l'|d')?/i, '');

// ------------------------------------------------------------------ calculs (mêmes règles que NeoScribVisu)
/** Population dédoublonnée : une commune n'est comptée qu'une fois, quel que soit son nombre de lieux.
 *  Un réseau intercommunal (ligne « réseau » dont l'intercommunalité a des lieux rattachés à l'EPCI) porte la population
 *  de toutes ses communes : elle remplace celle des lieux qui lui sont rattachés. Les autres lignes réseau (réseaux
 *  communaux) sont dédoublonnées avec les lieux de leur commune ; sans lieu dans la sélection, elles comptent seules. */
export function population(lignes) {
  const intercos = lignes.filter((e) => e.type === 'reseau' && e.intercommunal && e.v.population != null);
  const couverts = new Set(intercos.map((r) => r.epci));
  const lieux = lignes.filter((e) => e.type !== 'reseau' && !(e.rattachement === 'EPCI' && couverts.has(e.epci)));
  const autres = lignes.filter((e) => e.type === 'reseau' && !e.intercommunal);
  const base = lieux.length || intercos.length ? [...lieux, ...autres.filter((r) => lieux.some((e) => e.insee === r.insee))] : autres;
  const parCommune = new Map();
  for (const e of base) {
    const p = e.v.population;
    if (p == null) continue;
    const cle = e.insee ?? e.code;
    parCommune.set(cle, Math.max(parCommune.get(cle) ?? 0, p));
  }
  for (const r of intercos) parCommune.set(`reseau:${r.code}`, r.v.population);
  return parCommune.size ? [...parCommune.values()].reduce((a, b) => a + b, 0) : null;
}

/** Repère les réseaux intercommunaux : lignes réseau dont l'intercommunalité a des lieux rattachés à l'EPCI. */
export function marquerReseaux(etablissements) {
  for (const r of etablissements) {
    if (r.type === 'reseau') r.intercommunal = etablissements.some((e) => e.type === 'lieu' && e.epci && e.epci === r.epci && e.rattachement === 'EPCI');
  }
}

/** Agrège un indicateur sur des lignes : { valeur, n, total, categories } ou null. */
export function agreger(id, lignes, annee) {
  const i = ind(id);
  if (!i || !disponible(id, annee)) return null;
  switch (i.agregation) {
    case 'population': {
      const v = population(lignes);
      return v == null ? null : { valeur: v };
    }
    case 'somme':
    case 'moyenne': {
      let s = 0, n = 0;
      for (const e of lignes) if (e.v[id] != null) { s += e.v[id]; n++; }
      if (!n) return null;
      return { valeur: i.agregation === 'moyenne' ? s / n : s, n };
    }
    case 'oui':
    case 'renseigne': {
      const rep = lignes.filter((e) => e.v[id] != null);
      if (!rep.length) return null;
      return { valeur: rep.filter((e) => e.v[id] === 1).length, total: rep.length };
    }
    case 'categorie': {
      const categories = {};
      for (const e of lignes) if (e.v[id]) categories[e.v[id]] = (categories[e.v[id]] ?? 0) + 1;
      return Object.keys(categories).length ? { categories } : null;
    }
    case 'ratio': {
      // On ne garde que les lignes qui renseignent le numérateur (et le dénominateur quand c'est une activité),
      // pour ne pas diviser un total partiel par une population complète.
      const den = i.denominateur;
      const base = lignes.filter((e) => champsDe(i.numerateur).every((c) => c === 'population' ? e.v.population != null : e.v[c] != null)
        && (!den || den === 'population' ? true : e.v[den] != null));
      const num = agreger(i.numerateur, base, annee)?.valeur;
      const d = den ? agreger(den, base, annee)?.valeur : 1;
      if (num == null || !d) return null;
      return { valeur: (num / d) * (i.facteur ?? 1), n: base.length };
    }
  }
  return null;
}

function champsDe(id) {
  const i = ind(id);
  if (!i || i.agregation !== 'ratio') return [id];
  return [i.numerateur, i.denominateur].filter(Boolean).flatMap(champsDe);
}

/** Évolution d'une année sur l'autre, sur les seuls établissements renseignés les deux fois. */
export function evolution(id, lignes, lignesPrec, annee, precedente) {
  const champs = champsDe(id).map((c) => (c === 'population' ? null : c)).filter(Boolean);
  const complet = (e) => champs.every((c) => e.v[c] != null);
  const avant = new Map(lignesPrec.filter(complet).map((e) => [e.code, e]));
  const communs = lignes.filter((e) => complet(e) && avant.has(e.code));
  if (!communs.length) return null;
  const a = agreger(id, communs.map((e) => avant.get(e.code)), precedente)?.valeur;
  const b = agreger(id, communs, annee)?.valeur;
  if (!a || b == null) return null;
  const taux = ((b - a) / a) * 100;
  return Number.isFinite(taux) ? { taux, n: communs.length } : null;
}

/** Repère de comparaison : moyenne des lieux de lecture de Gironde pour l'année
 *  (rapport des totaux pour un ratio, moyenne par lieu sinon). */
export function moyenneGironde(id, annee) {
  const lieux = (app.donnees[annee] ?? []).filter((e) => e.type === 'lieu');
  const i = ind(id);
  if (i.agregation === 'ratio') return agreger(id, lieux, annee)?.valeur ?? null;
  const v = lieux.map((e) => e.v[id]).filter((x) => x != null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

// ------------------------------------------------------------------ mise en forme
export function formater(id, valeur) {
  const i = ind(id);
  if (valeur == null) return '–';
  if (i?.agregation === 'oui' || i?.agregation === 'renseigne') return valeur === 1 ? 'Oui' : 'Non';
  if (typeof valeur !== 'number') return valeur;
  return nf(i?.decimales ?? (Math.abs(valeur) < 10 && valeur % 1 ? 1 : 0)).format(valeur);
}
const court = (v) => (Math.abs(v) >= 10000 ? compact.format(v) : nf(Math.abs(v) < 10 && v % 1 ? 1 : 0).format(v));
const avecUnite = (id, texte) => (unite(id) ? `${texte} ${unite(id)}` : texte);

const NOTES = {};
export function noter(id) {
  const i = ind(id);
  if (i?.note) NOTES[id] = `${i.libelle} : ${i.note}`;
}
export const notesUtilisees = () => Object.values(NOTES);

// ------------------------------------------------------------------ blocs
/** Tuiles de chiffres clés pour l'année choisie, avec l'évolution sur un an à périmètre constant. */
export function htmlTuiles(ids, ctx) {
  const precedente = app.annees.filter((a) => a < ctx.annee).at(-1);
  const lignes = ctx.lignes(ctx.annee);
  const lignesPrec = precedente ? ctx.lignes(precedente) : null;
  const seul = lignes.length === 1;
  return `<div class="chiffres">${ids.map((id) => {
    const i = ind(id);
    const nom = ctx.libelles?.[id] ?? i.libelle;
    // Les notes de méthode (sommes, moyennes, héritage du SIGB) ne concernent que les ensembles de lieux.
    const avecNote = i.note && ctx.plusieurs;
    if (avecNote) noter(id);
    const note = avecNote ? (ctx.interactif ? ` <span class="note" title="${echapper(i.note)}" tabindex="0" aria-label="Note : ${echapper(i.note)}">ⓘ</span>` : ' *') : '';
    if (!disponible(id, ctx.annee)) {
      return `<div class="chiffre indisponible"><div class="chiffre-valeur">Non collecté en ${ctx.annee}</div><div class="chiffre-libelle">${echapper(nom)}${note}</div></div>`;
    }
    const r = agreger(id, lignes, ctx.annee);
    let valeur, detail = '';
    if (i.agregation === 'oui' || i.agregation === 'renseigne') {
      if (seul) valeur = r ? formater(id, lignes[0].v[id]) : '–';
      else {
        valeur = r ? nf().format(r.valeur) : '–';
        detail = r ? `sur ${nb(r.total, 'répondant', 'répondants')}` : 'aucune réponse';
      }
    } else if (i.agregation === 'categorie') {
      const cats = Object.entries(r?.categories ?? {}).sort((a, b) => b[1] - a[1]);
      valeur = cats.length ? echapper(cats[0][0]) : '–';
      if (cats.length > 1) detail = cats.slice(1).map(([k, n]) => `${echapper(k)} (${n})`).join(', ');
      if (lignes[0]?.sigb_herite && seul && id === 'sigb') detail = 'celui de son réseau';
    } else {
      valeur = formater(id, r?.valeur);
      if (!seul && r?.n != null && i.agregation === 'moyenne' && r.n > 1) detail = `moyenne de ${nf().format(r.n)} lieux`;
      else if (!seul && r?.n != null && i.agregation === 'somme') detail = nb(r.n, 'réponse', 'réponses');
    }
    if (lignesPrec && r?.valeur != null && disponible(id, precedente) && i.agregation !== 'categorie' && i.agregation !== 'oui') {
      const ev = evolution(id, lignes, lignesPrec, ctx.annee, precedente);
      if (ev) detail += `${detail ? ', ' : ''}<span class="${ev.taux >= 0 ? 'evolution-hausse' : 'evolution-baisse'}"${seul ? '' : ` title="Calculé sur les ${ev.n} établissements ayant répondu en ${precedente} et en ${ctx.annee}"`}>${pct.format(ev.taux)} % par rapport à ${precedente}</span>`;
    }
    const rep = repere(id, lignes, r, ctx.annee);
    const classe = rep ? (rep.atteint ? ' valeur-atteinte' : ' valeur-insuffisante') : '';
    const montrerUnite = unite(id) && r && typeof r.valeur === 'number' && i.agregation !== 'oui';
    return `<div class="chiffre"><div class="chiffre-valeur${classe}${i.agregation === 'categorie' ? ' chiffre-texte' : ''}">${valeur}${montrerUnite ? `<span class="chiffre-unite">${unite(id)}</span>` : ''}</div>
      <div class="chiffre-libelle">${echapper(nom)}${note}</div>${rep?.html ?? ''}
      ${detail ? `<div class="chiffre-detail">${detail}</div>` : ''}</div>`;
  }).join('')}</div>`;
}

/** Valeur de comparaison sous une tuile (recommandation SLL) : vert si atteinte, rouge sinon. */
function repere(id, lignes, r, annee) {
  const i = ind(id);
  if (!i.repere || r?.valeur == null || !disponible(i.repere, annee)) return null;
  const ref = agreger(i.repere, lignes.filter((e) => e.v[id] != null), annee)?.valeur;
  if (!ref) return null;
  const atteint = r.valeur >= ref;
  return {
    atteint,
    html: `<div class="chiffre-repere">${echapper(i.repere_libelle ?? libelle(i.repere))} : ${avecUnite(i.repere, formater(i.repere, ref))}, soit <span class="${atteint ? 'repere-atteint' : 'repere-insuffisant'}">${nf().format(Math.round((r.valeur / ref) * 100))} %</span> atteints</div>`,
  };
}

/** Histogramme groupé : une grappe de barres par année, une barre par indicateur (4 au plus).
 *  Valeurs inscrites au-dessus des barres, valeur exacte au survol, tableau des données en dessous. */
export function htmlEvolution({ titre, ids, note }, ctx) {
  ids.forEach(noter);
  const annees = app.annees;
  const series = ids.map((id) => ({
    id,
    valeurs: annees.map((a) => (disponible(id, a) ? agreger(id, ctx.lignes(a), a) : null)),
  }));
  const toutes = series.flatMap((s) => s.valeurs.map((r) => r?.valeur)).filter((v) => v != null);
  if (!toutes.length) {
    return `<figure class="graphique"><figcaption>${echapper(titre)}</figcaption><p class="graphique-vide">Aucune donnée renseignée.</p></figure>`;
  }
  const L = 520, H = 230, haut = 22, bas = 26, gauche = 44;
  const max = Math.max(...toutes, 0);
  const pas = pasGraduation(max || 1);
  const sommet = Math.ceil((max || 1) / pas) * pas;
  const y = (v) => haut + (H - haut - bas) * (1 - v / sommet);
  const largeurGrappe = (L - gauche) / annees.length;
  const ecart = 2;
  const lb = Math.min(46, (largeurGrappe * 0.72 - ecart * (ids.length - 1)) / ids.length);
  const grappe = lb * ids.length + ecart * (ids.length - 1);
  const graduations = [];
  for (let v = 0; v <= sommet + 1e-9; v += pas) {
    graduations.push(`<line class="graduation" x1="${gauche}" x2="${L}" y1="${y(v)}" y2="${y(v)}"/><text class="axe" x="${gauche - 6}" y="${y(v)}" text-anchor="end" dominant-baseline="central">${court(v)}</text>`);
  }
  const barres = [];
  annees.forEach((a, ia) => {
    const x0 = gauche + ia * largeurGrappe + (largeurGrappe - grappe) / 2;
    series.forEach((s, is) => {
      const r = s.valeurs[ia];
      const x = x0 + is * (lb + ecart);
      const info = `${a} – ${libelle(s.id)} : ${r ? avecUnite(s.id, formater(s.id, r.valeur)) : `non collecté`}`;
      if (!disponible(s.id, a)) {
        barres.push(`<text class="nc" x="${x + lb / 2}" y="${y(0) - 6}" text-anchor="middle">n.c.</text>`);
        return;
      }
      if (r?.valeur == null) {
        barres.push(`<text class="nc" x="${x + lb / 2}" y="${y(0) - 6}" text-anchor="middle">–</text>`);
        return;
      }
      const h = Math.max(y(0) - y(r.valeur), r.valeur > 0 ? 1 : 0);
      const rayon = Math.min(4, lb / 2, h);
      barres.push(`<g class="barre-g" data-info="${echapper(info)}">
        <rect class="cible" x="${x - ecart / 2}" y="${haut}" width="${lb + ecart}" height="${H - haut - bas}"/>
        <path class="serie-${is + 1}" d="${barreArrondie(x, y(0), lb, h, rayon)}"/>
        <text class="valeur" x="${x + lb / 2}" y="${y(0) - h - 5}" text-anchor="middle">${court(r.valeur)}</text></g>`);
    });
    barres.push(`<text class="axe annee" x="${gauche + ia * largeurGrappe + largeurGrappe / 2}" y="${H - 8}" text-anchor="middle">${a}</text>`);
  });
  const legende = ids.length > 1
    ? `<ul class="legende">${ids.map((id, i) => `<li><span class="pastille serie-${i + 1}"></span>${echapper(libelle(id))}</li>`).join('')}</ul>` : '';
  // Avec plusieurs établissements, un total peut varier parce que le nombre de répondants change.
  let repondants = '';
  if (ctx.plusieurs) {
    const parAnnee = annees.map((a) => Math.max(0, ...series.map((s, is) => s.valeurs[annees.indexOf(a)]?.n ?? 0)));
    if (new Set(parAnnee).size > 1) repondants = `<p class="graphique-note">Établissements répondants : ${annees.map((a, i) => `${a} : ${parAnnee[i]}`).join(' · ')}. Une partie de l'écart peut venir des non-réponses.</p>`;
  }
  const u = ids.every((id) => unite(id) === unite(ids[0])) && unite(ids[0]) ? ` (${unite(ids[0])})` : '';
  const tableau = `<details class="donnees"><summary>Voir les données</summary><table><thead><tr><th></th>${annees.map((a) => `<th>${a}</th>`).join('')}</tr></thead>
    <tbody>${series.map((s) => `<tr><th scope="row">${echapper(libelle(s.id))}</th>${s.valeurs.map((r, i) => `<td>${disponible(s.id, annees[i]) ? formater(s.id, r?.valeur) : 'n.c.'}</td>`).join('')}</tr>`).join('')}</tbody></table></details>`;
  return `<figure class="graphique"><figcaption>${echapper(titre)}${u}</figcaption>${legende}
    <svg viewBox="0 0 ${L} ${H}" role="img" aria-label="${echapper(titre)}">${graduations.join('')}${barres.join('')}</svg>
    ${note ? `<p class="graphique-note">${echapper(note)}</p>` : ''}${repondants}${ctx.interactif ? tableau : ''}</figure>`;
}

function pasGraduation(max) {
  const brut = max / 4;
  const p = 10 ** Math.floor(Math.log10(brut));
  const m = brut / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
}

/** Barre verticale posée sur la ligne de base, coins supérieurs arrondis. */
function barreArrondie(x, base, l, h, r) {
  if (h <= 0) return '';
  const top = base - h;
  return `M${x},${base}V${top + r}Q${x},${top} ${x + r},${top}H${x + l - r}Q${x + l},${top} ${x + l},${top + r}V${base}Z`;
}

/** Barres horizontales : une ligne par élément, repère optionnel en pointillés (moyenne Gironde). */
export function htmlBarresH({ titre, items, id, reference, referenceLibelle, couleur }) {
  if (!items.length) return `<figure class="graphique"><figcaption>${echapper(titre)}</figcaption><p class="graphique-vide">Aucune donnée renseignée.</p></figure>`;
  const max = Math.max(...items.map((x) => x.v), reference ?? 0) || 1;
  const pos = (v) => (v / max) * 80;
  const lignes = items.map((x) => `
    <div class="barre${x.classe ?? ''}" data-info="${echapper(`${x.nom} : ${avecUnite(id, formater(id, x.v))}`)}">
      <span class="barre-nom" title="${echapper(x.nom)}">${echapper(x.nom)}</span>
      <span class="barre-piste"><span class="barre-remplie" style="width:${pos(x.v)}%${couleur ? `;background:${couleur(x)}` : ''}"></span>
      <span class="barre-valeur" style="left:${pos(x.v)}%">${formater(id, x.v)}</span>
      ${reference != null ? `<span class="barre-reference" style="left:${pos(reference)}%"></span>` : ''}</span></div>`).join('');
  const ref = reference != null
    ? `<p class="legende-reference"><span class="trait-reference"></span>${echapper(referenceLibelle)} : ${avecUnite(id, formater(id, reference))}</p>` : '';
  return `<figure class="graphique graphique-barres"><figcaption>${echapper(titre)}${unite(id) ? ` (${unite(id)})` : ''}</figcaption>${ref}<div class="barres">${lignes}</div></figure>`;
}

/** Jauge en demi-cercle (part de la population inscrite et emprunteuse, par exemple). */
export function htmlJauge({ titre, valeur, max = 100, texte, detail }) {
  const R = 80, r = 54, cx = 100, cy = 92;
  const t = Math.max(0, Math.min(1, (valeur ?? 0) / max));
  const pt = (rayon, a) => [cx - rayon * Math.cos(a), cy - rayon * Math.sin(a)];
  const arc = (a0, a1) => {
    const [x1, y1] = pt(R, a0), [x2, y2] = pt(R, a1), [x3, y3] = pt(r, a1), [x4, y4] = pt(r, a0);
    return `M${x1},${y1}A${R},${R} 0 0 1 ${x2},${y2}L${x3},${y3}A${r},${r} 0 0 0 ${x4},${y4}Z`;
  };
  return `<figure class="graphique jauge"><figcaption>${echapper(titre)}</figcaption>
    <svg viewBox="0 0 200 112" role="img" aria-label="${echapper(`${titre} : ${texte}`)}">
      <path class="jauge-piste" d="${arc(0, Math.PI)}"/>${valeur != null && t > 0 ? `<path class="serie-1" d="${arc(0, Math.PI * t)}"/>` : ''}
      <text class="jauge-valeur" x="${cx}" y="${cy - 8}" text-anchor="middle">${echapper(texte)}</text>
    </svg>${detail ? `<p class="graphique-note">${detail}</p>` : ''}</figure>`;
}

/** Anneau (donut) : parts colorées, pourcentages dans les parts, légende chiffrée. */
export function htmlAnneau({ titre, items, unite: u = ['lieu', 'lieux'] }) {
  const total = items.reduce((a, x) => a + x.v, 0);
  if (!total) return `<figure class="graphique"><figcaption>${echapper(titre)}</figcaption><p class="graphique-vide">Aucune donnée.</p></figure>`;
  const R = 100, r = 56, cx = 110, cy = 110;
  const pt = (rayon, a) => [cx + rayon * Math.sin(a), cy - rayon * Math.cos(a)];
  const p1 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
  let debut = 0;
  const parts = items.map((x) => {
    const angle = (x.v / total) * 2 * Math.PI;
    const fin = debut + angle;
    const [x1, y1] = pt(R, debut), [x2, y2] = pt(R, fin), [x3, y3] = pt(r, fin), [x4, y4] = pt(r, debut);
    const d = items.length === 1
      ? `M${cx},${cy - R}A${R},${R} 0 1 1 ${cx - 0.01},${cy - R}ZM${cx},${cy - r}A${r},${r} 0 1 0 ${cx + 0.01},${cy - r}Z`
      : `M${x1},${y1}A${R},${R} 0 ${angle > Math.PI ? 1 : 0} 1 ${x2},${y2}L${x3},${y3}A${r},${r} 0 ${angle > Math.PI ? 1 : 0} 0 ${x4},${y4}Z`;
    const part = (x.v / total) * 100;
    const [lx, ly] = pt((R + r) / 2, debut + angle / 2);
    debut = fin;
    return `<g data-info="${echapper(`${x.nom} : ${nb(x.v, u[0], u[1])} (${p1.format(part)} %)`)}"><path d="${d}" fill="${x.couleur}" stroke="var(--surface)" stroke-width="2" fill-rule="evenodd"/>`
      + (part >= 8 ? `<text x="${lx}" y="${ly}" text-anchor="middle" dominant-baseline="central">${p1.format(part)} %</text>` : '') + '</g>';
  });
  return `<figure class="graphique anneau"><figcaption>${echapper(titre)}</figcaption><div class="anneau-corps">
    <svg viewBox="0 0 220 220" role="img" aria-label="${echapper(titre)}">${parts.join('')}
      <text x="110" y="104" text-anchor="middle" class="anneau-total">${nf().format(total)}</text>
      <text x="110" y="126" text-anchor="middle" class="anneau-unite">${total > 1 ? u[1] : u[0]}</text></svg>
    <ul class="anneau-legende">${items.map((x) => `<li><span class="pastille" style="background:${x.couleur}"></span>${echapper(x.nom)}<span class="anneau-nb">${nf().format(x.v)}</span></li>`).join('')}</ul></div></figure>`;
}

export const couleurTypo = (t) => `var(--typo-${String(t ?? 'e').toLowerCase()})`;
export const texteTypo = (t) => (t ? `<span class="typo-texte" style="color:${couleurTypo(t)}">Typologie ${echapper(t)}</span>` : '');

// ------------------------------------------------------------------ infobulle (survol des graphiques)
export function activerInfobulles() {
  const bulle = document.createElement('div');
  bulle.className = 'infobulle';
  bulle.setAttribute('role', 'tooltip');
  bulle.hidden = true;
  document.body.append(bulle);
  document.addEventListener('pointermove', (ev) => {
    const cible = ev.target.closest?.('[data-info]');
    if (!cible || cible.closest('#impression')) { bulle.hidden = true; return; }
    bulle.textContent = cible.dataset.info;
    bulle.hidden = false;
    const { innerWidth: lw } = window;
    const w = bulle.offsetWidth;
    bulle.style.left = `${Math.min(ev.clientX + 14, lw - w - 8)}px`;
    bulle.style.top = `${ev.clientY + 16}px`;
  });
  document.addEventListener('pointerleave', () => { bulle.hidden = true; });
  addEventListener('scroll', () => { bulle.hidden = true; }, { passive: true });
}

// ------------------------------------------------------------------ données provisoires
export function texteProvisoire(annee, lignes) {
  const nonValides = lignes.filter((e) => e.avancement && e.avancement !== 'Validé');
  if (!nonValides.length) return '';
  return lignes.length === 1
    ? `Données ${annee} provisoires : la fiche ${nonValides[0].avancement === 'En cours' ? 'est encore en cours de saisie' : 'a été envoyée mais n\'est pas encore validée'}. Les chiffres peuvent évoluer.`
    : `Données ${annee} provisoires : ${nb(nonValides.length, 'fiche n\'est', 'fiches ne sont')} pas encore validée${nonValides.length > 1 ? 's' : ''}. Les chiffres peuvent évoluer.`;
}

export const NOTES_GENERALES = [
  'Source : enquête annuelle sur les bibliothèques des collectivités territoriales (Service du livre et de la lecture, ministère de la Culture), préparée par NeoScribVisu avec les mêmes calculs que le tableau de bord départemental.',
  'Chaque année est affichée séparément : le Looker d\'origine additionnait les années quand aucun filtre d\'année n\'était posé.',
  'Le questionnaire change selon les années : un indicateur absent est signalé « n.c. » (non collecté), jamais remplacé par zéro. Un tiret signale un indicateur collecté mais non renseigné.',
  'Les évolutions sur un an indiquées sous les chiffres clés sont calculées à périmètre constant : seuls les établissements qui ont renseigné l\'indicateur les deux années sont comparés.',
  'La population est comptée une fois par commune. Celle d\'un réseau intercommunal (ligne « réseau ») n\'est pas ajoutée à celle des communes de ses lieux.',
  'Les ratios (dépense par habitant, surface par habitant…) divisent des totaux, sur les seuls établissements qui renseignent la valeur.',
  'Les moyennes de Gironde portent sur tous les lieux de lecture du département qui renseignent l\'indicateur pour l\'année choisie.',
];

// ------------------------------------------------------------------ export PDF
/** Prépare la fenêtre d'export : liste des pages à cocher, puis impression en A4 paysage. */
export function preparerExport({ pages, rendrePage, titreDocument, sousTitre }) {
  const dlg = $('#dialogue-export');
  const liste = $('.export-pages', dlg);
  const erreur = $('.export-erreur', dlg);
  $('.ouvrir-export').addEventListener('click', () => {
    liste.innerHTML = pages().map((p) => `<label><input type="checkbox" name="page" value="${p.id}" checked> ${echapper(p.titre)}</label>`).join('');
    $('.export-perimetre', dlg).textContent = sousTitre();
    erreur.hidden = true;
    dlg.showModal();
  });
  $('.export-toutes', dlg).addEventListener('click', () => dlg.querySelectorAll('input[name="page"]').forEach((i) => { i.checked = true; }));
  $('.export-aucune', dlg).addEventListener('click', () => dlg.querySelectorAll('input[name="page"]').forEach((i) => { i.checked = false; }));
  $('.export-annuler', dlg).addEventListener('click', () => dlg.close());
  $('form', dlg).addEventListener('submit', (ev) => {
    const choisies = [...dlg.querySelectorAll('input[name="page"]:checked')].map((i) => i.value);
    const methode = $('input[name="methode"]', dlg).checked;
    if (!choisies.length) { ev.preventDefault(); erreur.textContent = 'Cochez au moins une page.'; erreur.hidden = false; return; }
    setTimeout(() => imprimer(choisies, methode), 50);
  });

  function imprimer(ids, methode) {
    const date = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
    const titre = titreDocument();
    const sections = pages().filter((p) => ids.includes(p.id)).map((p) => `<section class="imp-page">
      <header class="imp-entete"><h1>${echapper(p.titre)}</h1><p>${echapper(titre)}<br>${echapper(sousTitre())}</p></header>${rendrePage(p, false)}</section>`);
    if (methode) {
      sections.push(`<section class="imp-page imp-methode"><header class="imp-entete"><h1>Méthode et limites</h1><p>${echapper(titre)}</p></header>
        <ul>${[...NOTES_GENERALES, ...notesUtilisees()].map((n) => `<li>${echapper(n)}</li>`).join('')}</ul></section>`);
    }
    const zone = $('#impression');
    zone.innerHTML = sections.join('');
    const pied = `${titre} – édité le ${date}`.replace(/["\\]/g, '');
    $('#style-impression').textContent = `@page { @bottom-left { content: "${pied}"; font: 7.5pt "Public Sans", sans-serif; color: #5f6b74; } @bottom-right { content: "Page " counter(page) " sur " counter(pages); font: 7.5pt "Public Sans", sans-serif; color: #5f6b74; } }`;
    const titrePage = document.title;
    document.title = titre;
    const nettoyer = () => { zone.innerHTML = ''; document.title = titrePage; removeEventListener('afterprint', nettoyer); };
    addEventListener('afterprint', nettoyer);
    print();
  }
}
