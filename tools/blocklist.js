'use strict';
/*
 * Слова, которые не нужны в игре: нецензурная лексика, откровенно взрослая
 * тематика, взрослые сайты и мусорные токены из частотного списка.
 * Обычная лексика (breast, naked, sexual, sperm и т. п.) НЕ блокируется —
 * это нормальные английские слова.
 *
 * Список используется при сборке словаря (tools/build-wordlist.js)
 * и проверяется тестами (tests/run-tests.js).
 */

module.exports = [
  // нецензурная лексика и грубые слова
  'arse', 'ass', 'asses', 'bastard', 'bitch', 'bitches', 'bollocks',
  'bugger', 'cock', 'cocks', 'cunt', 'cunts', 'dickhead', 'fuck', 'fucked',
  'fucker', 'fuckers', 'fucking', 'fucks', 'piss', 'pissed', 'prick',
  'shit', 'shits', 'shitty', 'slut', 'sluts', 'slutty', 'wank', 'wanker',
  'whore', 'whores',

  // откровенно взрослая тематика
  'anal', 'bdsm', 'blowjob', 'blowjobs', 'boob', 'boobs', 'bondage',
  'cum', 'cumming', 'cums', 'cunnilingus', 'dildo', 'dildos', 'erotic',
  'erotica', 'escort', 'escorts', 'fetish', 'fisting', 'gangbang',
  'genital', 'genitals', 'handjob', 'handjobs', 'hentai', 'incest',
  'intercourse', 'lingerie', 'masturbate', 'masturbating', 'masturbation',
  'milf', 'milfs', 'nude', 'nudes', 'nudist', 'nudity', 'orgy', 'porn',
  'porno', 'pornography', 'prostitute', 'pussy', 'rape', 'raped', 'semen',
  'sex', 'sexo', 'shemale', 'shemales', 'squirt', 'squirting', 'stripper',
  'strippers', 'threesome', 'tits', 'titties', 'transexual',
  'transexuales', 'transsexual', 'vagina', 'viagra', 'voyeur', 'voyeurweb',
  'vulva', 'xxx',

  // взрослые сайты и мусорные токены из частотного списка
  'acdbentity', 'ampland', 'bangbus', 'gratuit', 'knowledgestorm',
  'listprice', 'livesex', 'mediawiki', 'msgid', 'msgstr', 'pichunter',
  'sbjct', 'shopzilla', 'telecharger', 'thehun', 'thumbzilla', 'worldsex',
  'zshops',

  // лекарства-бренды
  'adipex', 'ambien', 'fioricet', 'hydrocodone', 'levitra', 'paxil',
  'phentermine', 'propecia', 'prozac', 'ultram', 'valium', 'zoloft'
];
