// Token Radar's dashboard. It reads window.RADAR (written beside dashboard/ by main.ts)
// and renders the ranked board, a filterable table, a per-protocol detail view with the
// model's own inputs and the protocol's farm plan. No network: every byte it shows is
// in data.js. The page recomputes each row's implied value from the snapshot figures,
// so the board it shows is the board board.json carries.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', chain: 'all', tab: 'pre-token', sort: 'implied', dir: -1, selected: null };

  // Money, percents and ages, each in the short form the table shows.
  var usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    var abs = Math.abs(n);
    if (abs >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (abs >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (abs >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd0.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    var d = Math.max(0, Math.round(days));
    if (d >= 365) return (d / 365).toFixed(1) + 'y';
    return d + 'd';
  }

  // The model in one function: the page recomputes a row from the snapshot figures and
  // checks the number board.json carries, so the page's code and the board's data are
  // visibly the same arithmetic. radar-2 adds a breadth term: one chain scores 1.00,
  // each extra chain up to five adds 0.04.
  function impliedOf(row, model) {
    var change = row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d;
    var growth = Math.max(model.growth_floor, Math.min(model.growth_cap, change));
    var growthMult = 1 + (growth / 100) * model.growth_weight;
    var age = row.age_days === null || row.age_days === undefined ? model.unknown_age_days : row.age_days;
    var cappedAge = Math.min(Math.max(age, 0), model.maturity_days);
    var maturity = model.maturity_floor + (cappedAge / model.maturity_days) * model.maturity_range;
    var chains = row.chains || [];
    var extra = Math.min(Math.max(chains.length - 1, 0), model.breadth_max_chains);
    var breadth = 1 + extra * model.breadth_per_chain;
    return Math.max(1, Math.round(row.tvl_usd * model.base_multiple * growthMult * maturity * breadth));
  }

  // A small element builder: tag, attributes, then children (strings, nodes or arrays).
  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      for (var k in attrs) {
        if (!Object.prototype.hasOwnProperty.call(attrs, k)) continue;
        var v = attrs[k];
        if (v === null || v === undefined) continue;
        if (k === 'class') node.className = v;
        else if (k === 'text') node.textContent = v;
        else if (k === 'html') node.innerHTML = v;
        else if (k.indexOf('on') === 0) node.addEventListener(k.slice(2), v);
        else node.setAttribute(k, v);
      }
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else if (Array.isArray(child)) {
        for (var j = 0; j < child.length; j++) if (child[j]) node.appendChild(child[j]);
      } else node.appendChild(child);
    }
    return node;
  }

  // The farm plan is the same derivation main.ts writes to board.json: category, chains,
  // TVL and age decide the action, the capital, the hold and every cost and time.
  // No name is special-cased.
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  // Capital tiers, biggest TVL first: the first tier a protocol's TVL reaches wins.
  var CAPITAL_TIERS = [[5e9, 250], [1e9, 150], [1e8, 100], [0, 50]];
  function capitalFor(p) {
    for (var i = 0; i < CAPITAL_TIERS.length; i++) {
      if (p.tvl_usd >= CAPITAL_TIERS[i][0]) return CAPITAL_TIERS[i][1];
    }
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Lend $' + capital + ' of USDC on ' + name + ' (' + chain + ') and leave the supply position open.';
    if (c.indexOf('dex') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Add $' + capital + ' of liquidity to ' + name + "'s deepest pool on " + chain + ' and leave it in range.';
    if (c.indexOf('yield') >= 0) return 'Deposit $' + capital + ' of USDC into ' + name + "'s highest-yield vault on " + chain + ' and hold the shares.';
    if (c.indexOf('bridge') >= 0 || c.indexOf('canonical') >= 0) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ', then use the bridged funds inside its app.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return 'Stake $' + capital + " of the chain's native asset through " + name + ' on ' + chain + ' and keep the receipt token.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('options') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedged position.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' and take one position in a ' + name + ' market on ' + chain + '.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0 || c.indexOf('onchain capital') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and hold the vault shares.';
    if (c.indexOf('stable') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + ' and hold it.';
    if (c.indexOf('rwa') >= 0) return 'Mint $' + capital + " of " + name + "'s yield-bearing asset on " + chain + ' and hold it.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy active.';
    if (c.indexOf('launchpad') >= 0) return 'Stake $' + capital + ' in ' + name + "'s launch pool on " + chain + ' and join one sale.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }
  function stepText(step) {
    var joined = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (joined.length > 600) return joined.slice(0, 596) + '...';
    if (joined.length < 20) return joined + " Hold the position and check the protocol's own page.";
    return joined;
  }
  function farmSteps(p) {
    var chain = chainOf(p);
    var capital = capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    return [
      { text: 'Open a fresh wallet that holds only the funds you plan to farm, and store its seed phrase offline where nobody else can read it.', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
      { text: actionFor(p, capital, chain), cost: '$' + capital + ' of capital plus about $' + (capital >= 150 ? 8 : 4) + ' of gas', time: '15 minutes to set up' },
      { text: 'Do one qualifying action each week, such as a deposit, a borrow, a swap, a vote or a new position, so the wallet stays active.', cost: 'about $2 of gas a week', time: '10 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days, so the activity is counted in more than one snapshot of the protocol.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: "Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes, never from a link in a chat or email.", cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      { text: 'Write the wallet, the dates and every transaction hash in a farm log, so you can repeat the position later or unwind it cleanly.', cost: 'nothing but the log', time: '5 minutes' }
    ].map(stepText);
  }

  function readParams() {
    var params = new URLSearchParams(window.location.search || '');
    if (params.get('q')) state.q = params.get('q');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('tab')) state.tab = params.get('tab');
    if (params.get('detail')) state.selected = params.get('detail');
    var hash = (window.location.hash || '').replace(/^#/, '');
    if (hash) {
      var hp = new URLSearchParams(hash);
      if (hp.get('p')) state.selected = hp.get('p');
      if (hp.get('category')) state.category = hp.get('category');
      if (hp.get('q')) state.q = hp.get('q');
    }
  }
  function writeParams() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.tab !== 'pre-token') params.set('tab', state.tab);
    if (state.selected) params.set('detail', state.selected);
    var next = params.toString();
    var url = next ? window.location.pathname + '?' + next : window.location.pathname;
    window.history.replaceState(null, '', url);
  }

  // The rows the current filters leave: category, then chain, then the search text.
  function rows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (q === '') return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  // One sort key per column: a function from a row to its sortable value.
  var SORT_KEYS = {
    name: function (r) { return r.name.toLowerCase(); },
    tvl: function (r) { return r.tvl_usd; },
    growth: function (r) { return r.change_7d === null ? -Infinity : r.change_7d; },
    age: function (r) { return r.age_days === null ? Infinity : r.age_days; },
    chains: function (r) { return (r.chains || []).length; },
    implied: function (r) { return r.implied_value_usd; }
  };
  function sortedRows(list) {
    var keyFn = SORT_KEYS[state.sort] || SORT_KEYS.implied;
    var dir = state.dir;
    return list.slice().sort(function (a, b) {
      var av = keyFn(a);
      var bv = keyFn(b);
      if (av < bv) return -dir;
      if (av > bv) return dir;
      if (a.slug === b.slug) return 0;
      return a.slug < b.slug ? -1 : 1;
    });
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'mark' }), el('span', { text: 'TOKEN RADAR ' }), el('small', { text: 'PRE-TOKEN LAUNCH BOARD' })),
      el('div', { class: 'top-meta' },
        el('span', null, 'Snapshot ', el('b', { text: DATA.as_of })),
        el('span', null, 'DefiLlama protocol index'),
        el('span', null, el('b', { text: DATA.model_version }), ' model')
      )
    );
  }

  function lede() {
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', { text: DATA.watchlist_size + ' watchlist protocols, ranked by implied value' }),
        el('p', { text: 'The watchlist is the floor: every protocol with at least $' + Math.round(DATA.floor_usd / 1e6) + 'M of TVL that records no token. The early radar adds ' + DATA.early_size + ' pre-token protocols below that floor, by TVL. Implied value is this board\u2019s model, not a promise and not a prediction of a launch.' })
      ),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })),
        el('div', { class: 'fact' }, el('span', { text: 'Pre-token rows scored' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Early rows below the floor' }), el('b', { text: String(DATA.early_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Live-token protocols set aside' }), el('b', { text: String(DATA.live_size) }))
      )
    );
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chains = Array.from(new Set(DATA.rows.reduce(function (acc, r) { return acc.concat(r.chains || []); }, []))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeParams(); render(); });
    var select = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); })
    );
    select.addEventListener('change', function () { state.category = select.value; writeParams(); render(); });
    var chainSel = el('select', { id: 'chain', 'aria-label': 'Filter by chain' },
      el('option', { value: 'all', text: 'All chains' }),
      chains.map(function (c) { return el('option', { value: c, text: c, selected: c === state.chain ? 'selected' : null }); })
    );
    chainSel.addEventListener('change', function () { state.chain = chainSel.value; writeParams(); render(); });
    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token', onclick: function () { state.tab = 'pre-token'; state.selected = null; render(); } });
    var live = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live token', onclick: function () { state.tab = 'live'; state.selected = null; render(); } });
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), select),
      el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Chain' }), chainSel),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Token status' }), el('div', { class: 'tabs' }, pre, live)),
      el('span', { class: 'count', text: state.tab === 'pre-token' ? rows().length + ' rows shown' : DATA.live.length + ' live-token protocols' })
    );
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } render(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' \u25bc' : ' \u25b2' }) : null
      )
    );
  }

  // One panel holding one table: a caption, a header row and a body.
  function panelTable(caption, headCells, body) {
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { text: caption }),
          el('thead', null, el('tr', null, headCells)),
          body
        )
      )
    );
  }
  // A protocol's name cell: the name over its category and chains.
  function nameCell(r) {
    var where = (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain');
    return el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: where })));
  }
  // One board row: rank, name, TVL, growth, age, chain count, implied value with a bar.
  function boardRow(r, maxImplied) {
    var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
    var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
    var pct = Math.max(3, Math.round((r.implied_value_usd / maxImplied) * 100));
    return el('tr', {
      'data-selected': state.selected === r.slug ? 'true' : 'false',
      tabindex: '0',
      onclick: function () { openDetail(r.slug); },
      onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
    },
      el('td', { class: 'num', text: String(r.rank) }),
      nameCell(r),
      el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
      el('td', { class: 'num ' + growthClass, text: growth }),
      el('td', { class: 'num', text: fmtAge(r.age_days) }),
      el('td', { class: 'num', text: String((r.chains || []).length) }),
      el('td', null, el('div', { class: 'implied' },
        el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + pct + '%' })),
        el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) })
      )),
      el('td', null, el('span', { class: 'status', text: 'no token' }))
    );
  }

  function boardTable() {
    var list = sortedRows(rows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category to see the board again.' }),
        el('button', { class: 'button', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; writeParams(); render(); } })
      ));
    }
    var max = list[0].implied_value_usd || 1;
    var tbody = el('tbody');
    list.forEach(function (r) { tbody.appendChild(boardRow(r, max)); });
    return panelTable(
      'Pre-token protocols, strongest implied value first. Select a row for its model and farm plan.',
      [sortHeader('implied', 'Rank'), sortHeader('name', 'Protocol'), sortHeader('tvl', 'TVL'), sortHeader('growth', '7d'),
        sortHeader('age', 'Age'), sortHeader('chains', 'Chains'), sortHeader('implied', 'Implied value'),
        el('th', { scope: 'col', text: 'Token' })],
      tbody
    );
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      var growthClass = r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg';
      tbody.appendChild(el('tr', null,
        el('td', { class: 'num', text: 'live' }),
        nameCell(r),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', null, el('span', { class: 'status live', text: 'already trades' }))
      ));
    });
    var heads = ['Status', 'Protocol', 'TVL', '7d', 'Market cap', 'Token'].map(function (t) {
      return el('th', { scope: 'col', text: t });
    });
    return panelTable(
      'Token live: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking.',
      heads,
      tbody
    );
  }

  function modelPanel() {
    var m = DATA.model;
    return el('section', { class: 'panel model' },
      el('h2', { text: 'How implied value is computed' }),
      el('p', { text: 'Every row is scored by one function of the snapshot figures. No protocol name is special-cased, and no row is hand-picked.' }),
      el('div', { class: 'formula' },
        'implied = round( tvl_usd x ' + m.base_multiple + ' x (1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 x ' + m.growth_weight + ') x (' + m.maturity_floor + ' + min(age_days, ' + m.maturity_days + ') / ' + m.maturity_days + ' x ' + m.maturity_range + ') x (1 + 0.04 x min(chains - 1, 5)) )'
      ),
      el('p', { text: 'TVL and seven-day growth come from the snapshot. Age is the time since the protocol was first listed, the best record of how long it has run with no token; an unlisted age uses ' + m.unknown_age_days + ' days. Breadth counts the chains it runs on: each extra chain up to five adds 4%. The early radar is every pre-token protocol below the watchlist floor, by TVL, and the live-token protocols are set aside with their market caps shown.' })
    );
  }

  function detailPanel() {
    var row = null;
    for (var i = 0; i < DATA.rows.length; i++) if (DATA.rows[i].slug === state.selected) { row = DATA.rows[i]; break; }
    if (!row) return null;
    var steps = farmSteps(row);
    var check = impliedOf(row, DATA.model);
    return el('section', { class: 'panel detail', id: 'detail' },
      el('div', { class: 'detail-head' },
        el('div', null,
          el('span', { class: 'kicker', text: 'Rank ' + row.rank + ' of ' + DATA.board_size + ' · pre-token' }),
          el('h2', { text: row.name }),
          el('p', { text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') + ' · first listed ' + (row.listed_at || 'unknown') })
        ),
        el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { state.selected = null; writeParams(); render(); } })
      ),
      el('div', { class: 'detail-section' },
        el('h3', { text: 'Implied value' }),
        el('div', { class: 'equation' },
          el('div', null, el('span', { text: 'TVL' }), el('b', { text: fmtUsd(row.tvl_usd) })),
          el('div', null, el('span', { text: 'Seven-day growth' }), el('b', { text: fmtPct(row.change_7d) })),
          el('div', null, el('span', { text: 'Age with no token' }), el('b', { text: fmtAge(row.age_days) })),
          el('div', null, el('span', { text: 'Chains' }), el('b', { text: String((row.chains || []).length) })),
          el('div', null, el('span', { text: 'Growth multiplier' }), el('b', { text: String(row.growth_multiplier) })),
          el('div', null, el('span', { text: 'Maturity multiplier' }), el('b', { text: String(row.maturity_multiplier) })),
          el('div', null, el('span', { text: 'Breadth multiplier' }), el('b', { text: String(row.breadth_multiplier) })),
          el('div', null, el('span', { text: 'Implied value' }), el('b', { text: fmtUsd(row.implied_value_usd) })),
          el('div', { class: 'wide' }, el('span', { text: 'Model check' }), el('b', { text: 'Model ' + DATA.model_version + ' recomputes this row as ' + fmtUsd(check) + (check === row.implied_value_usd ? ', the same number board.json carries.' : ', which differs from the board: the data would be stale.') + ' This is an estimate, not a price.' }))
        )
      ),
      el('div', { class: 'detail-section' },
        el('h3', { text: 'Farm plan' }),
        el('ol', { class: 'steps' }, steps.map(function (s) {
          var at = s.indexOf(' Cost: ');
          var action = at >= 0 ? s.slice(0, at) : s;
          var tail = at >= 0 ? s.slice(at + 1) : '';
          return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
        }))
      )
    );
  }

  function openDetail(slug) {
    state.selected = slug;
    writeParams();
    render();
    var d = document.getElementById('detail');
    if (d && d.scrollIntoView) d.scrollIntoView({ block: 'start' });
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(lede());
    shell.appendChild(controls());
    if (state.selected && state.tab === 'pre-token') {
      var detail = detailPanel();
      if (detail) shell.appendChild(detail);
    }
    shell.appendChild(state.tab === 'pre-token' ? boardTable() : liveTable());
    if (state.tab === 'pre-token') shell.appendChild(modelPanel());
    shell.appendChild(el('p', { class: 'note' },
      el('b', { text: 'Reading the board: ' }),
      '“No token” means the protocol records no token in this snapshot, never that it has none. A protocol on the list may still have a token its record does not carry. Implied values are this entry\u2019s own claim from the snapshot figures; they do not predict whether or when a token is issued.'
    ));
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
  }

  readParams();
  render();
})();

