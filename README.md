# NeoScribVisu-CDC

Évolution des bibliothèques d'une intercommunalité de Gironde, année après année, à partir de l'enquête annuelle du Service du livre et de la lecture (SLL, ministère de la Culture). Remplace le rapport Looker Studio « CDC Tableau évolutions ».

Site : https://bibliogironde.github.io/NeoScribVisu-CDC/

## Pages

- **Situation actuelle** : chiffres clés de l'année choisie, lieux par typologie, logiciels (SIGB), tableau des lieux de lecture et des réseaux.
- **Comparaison des lieux** : surface par habitant, dépense d'acquisition par habitant, heures d'ouverture, emprunteurs pour 100 habitants, lieu par lieu, avec la moyenne des lieux de Gironde.
- **Évolutions diverses**, **Usagers**, **Collections : livres**, **Collections : autres supports**, **Emprunts** : les mêmes graphiques que pour une bibliothèque, sur l'ensemble de l'intercommunalité.

Sous chaque graphique d'évolution, un avertissement signale quand le nombre d'établissements répondants change d'une année à l'autre : une partie de l'écart vient alors des non-réponses.

Chaque page s'exporte en PDF (A4 paysage). L'adresse de la page (`#page=…&annee=…&epci=…`) peut être partagée.

## Données

L'application ne contient aucune donnée : elle lit les fichiers publiés par [NeoScribVisu](https://github.com/biblioGironde/NeoScribVisu) (`https://bibliogironde.github.io/NeoScribVisu/data/`), avec les mêmes calculs que le tableau de bord départemental. Une année importée dans NeoScribVisu apparaît ici sans autre modification.

Différences avec le Looker d'origine :

- chaque année est affichée séparément (le Looker additionnait les années, y compris sur « Situation actuelle » : surfaces et heures par lieu y étaient triplées) ;
- la population est comptée une fois par commune ; celle d'un réseau intercommunal remplace celle des lieux qui lui sont rattachés ;
- les moyennes de comparaison portent sur tous les lieux de lecture de Gironde (la liste des membres du réseau biblio.gironde n'est pas encore fournie) ;
- la colonne « Membre du réseau interco à compétence totale » n'existe pas dans l'enquête : elle sera ajoutée quand la liste sera fournie ;
- les noms des responsables ne sont pas publiés.

## Développement

Aucune dépendance. `npm start` lance un serveur local sur http://localhost:8080 (données lues sur le site de NeoScribVisu).

Pour tester avec un import local de NeoScribVisu : `npm start -- ../NeoScribVisu/public/data`, puis ouvrir http://localhost:8080/?donnees=donnees/

`public/commun.js` et `public/style.css` sont identiques dans NeoScribVisu-BM et NeoScribVisu-CDC : une correction se reporte dans les deux dépôts. Les pages sont décrites en tête de `public/app.js`.

Le site est publié sur GitHub Pages par la GitHub Action « Publication GitHub Pages » à chaque modification de `public/` sur `main`.

## Licence

Code sous licence MIT. Données : ministère de la Culture, enquête annuelle sur les bibliothèques des collectivités territoriales.
