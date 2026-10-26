// The Kelly course: four parts, each a list of blocks shown one after another.
// Block kinds: text · choice (tap one) · sim (something to play with) · type (write algebra or a number;
// checked by value in kelly.js) · drill (generated number questions until `goal` right).
import { kelly, kellyInvest } from './kelly.js?v=1';

const pick = a => a[Math.floor(Math.random() * a.length)];
const pct = x => `${+(x * 100).toFixed(1)}%`;

export const PARTS = [
  {
    id: 'intuition', title: 'Why not bet it all?', short: 'Intuition',
    blurb: 'A coin game in your favour, played 200 times. How much should you stake?',
    blocks: [
      { kind: 'text', html: `<p>A friend offers you a coin game. The coin lands heads <b>60%</b> of the time, and each bet pays even money: stake $10, win $10 or lose $10.</p><p>You start with $100 and play 200 times. Each time you stake some share of whatever you have then.</p>` },
      { kind: 'choice', id: 'guess', prompt: 'Guess first. What share of your money should you stake each time?', options: ['All of it', '60%', '20%', '5%'], answer: 2, any: true,
        after: 'Every bet is in your favour, so staking more looks better. Try each one below and watch what happens.' },
      { kind: 'sim', sim: 'coin', html: '<p>Each line is one player. Every setting uses the same coin flips, so the only thing that changes is how much they stake. The scale goes up by ×10 per line.</p>' },
      { kind: 'choice', id: 'allin', prompt: 'Staking everything every time: what happens to almost every player?', options: ['They get very rich', 'They end up close to where they started', 'They lose everything at the first tails'], answer: 2,
        why: 'One tails takes all of it, and in 200 flips a tails is all but certain. A great average return means nothing if one loss is fatal.' },
      { kind: 'text', html: `<p><b>Your money multiplies; it doesn't add.</b> A win at stake f multiplies it by (1 + f), a loss by (1 − f). After many bets you have won about 60% of them, so</p>
<p class="eq">wealth ≈ (1 + f)<sup>0.6n</sup> (1 − f)<sup>0.4n</sup></p>
<p>Take logs and divide by n. The growth per bet is</p><p class="eq">G(f) = 0.6 ln(1 + f) + 0.4 ln(1 − f)</p>
<p>Whoever has the biggest G pulls ahead and stays ahead. The <b>Kelly bet</b> is the f that makes G as big as it can be.</p>` },
      { kind: 'sim', sim: 'curve', html: '<p>The growth curve. Change the odds and watch the peak move.</p>' },
      { kind: 'choice', id: 'peak', prompt: 'For the 60% coin at even money, where is the peak?', options: ['10%', '20%', '40%', '60%'], answer: 1,
        why: 'Staking 20% grows fastest: about 2% a bet, so 200 bets turn $100 into roughly $5,600 for a typical player.' },
      { kind: 'choice', id: 'double', prompt: 'Staking 40%, twice the Kelly bet, the typical player grows…', options: ['twice as fast', 'about as fast as at 20%', 'hardly at all'], answer: 2,
        why: 'The curve crosses zero near twice the Kelly bet. Past that, the typical player loses money on a game they are favoured to win.' },
      { kind: 'text', html: `<p class="key">Bet too little and you grow slowly. Bet too much and the losses, which hurt more than the wins help, drag you down. The Kelly bet is the balance point, and twice it is roughly break-even.</p>` },
    ],
  },
  {
    id: 'derive', title: 'Derive it yourself', short: 'Derivation',
    blurb: 'Write the growth rate, differentiate, set it to zero, and solve.',
    blocks: [
      { kind: 'text', html: `<p>Now any bet. You win with chance <b>p</b> and lose with chance <b>q = 1 − p</b>. A win pays <b>b</b> for every 1 you stake (b = 1 is even money, b = 2 pays two to one). You stake a fraction <b>f</b> of your money.</p><p>A win multiplies your money by (1 + bf), a loss by (1 − f).</p><p class="dim">Type on the math keyboard (ln is on the ƒ(x) page), or switch to Write and use your finger.</p>` },
      { kind: 'type', id: 'G', check: 'expr', target: 'p\\ln\\left(1+bf\\right)+q\\ln\\left(1-f\\right)', label: 'G(f) =',
        prompt: 'Write the growth per bet, G(f).', hint: 'Each outcome adds (its chance) × ln(its multiplier). In the coin game it was 0.6 ln(1 + f) + 0.4 ln(1 − f).' },
      { kind: 'type', id: 'dG', check: 'expr', target: '\\frac{pb}{1+bf}-\\frac{q}{1-f}', label: 'G′(f) =',
        prompt: 'Differentiate with respect to f.', hint: 'The derivative of ln(1 + bf) is b/(1 + bf). The derivative of ln(1 − f) is −1/(1 − f).' },
      { kind: 'type', id: 'clear', check: 'eq', target: 'pb\\left(1-f\\right)=q\\left(1+bf\\right)', label: '',
        prompt: 'At the peak the slope is 0. Set G′(f) = 0 and clear the fractions: write an equation with no fractions in it.', hint: 'Move the q term over: pb/(1 + bf) = q/(1 − f). Then multiply both sides by (1 + bf)(1 − f).' },
      { kind: 'type', id: 'solve', check: 'expr', target: 'p-\\frac{q}{b}', label: 'f* =',
        prompt: 'Solve for f.', hint: 'Expand: pb − pbf = q + qbf. Gather the f terms: pb − q = f(pb + qb) = fb, because p + q = 1.' },
      { kind: 'choice', id: 'max', prompt: 'G″(f) = −pb²/(1 + bf)² − q/(1 − f)². Is f* a peak or a dip?', options: ['A peak: G″ is negative for every f', 'A dip: G″ is positive', 'Can\'t tell'], answer: 0,
        why: 'Both terms are squares with a minus sign, so G″ < 0 everywhere. The curve bends down, so the one flat point is the top.' },
      { kind: 'text', html: `<p class="eq">f* = p − q/b = (pb − q) / b</p><p>Read it as <b>edge ÷ odds</b>. The edge pb − q is what you expect to make per 1 staked. Dividing by b means: the longer the odds, the less you stake, even with the same edge.</p><p>If the edge is 0 or negative, f* ≤ 0: don't bet.</p>` },
      { kind: 'drill', id: 'kellyNum', goal: 3, label: 'f* =', prompt: 'Work out the Kelly bet. A decimal or a percent is fine.',
        gen: () => { for (;;) { const p = pick([.52, .55, .6, .65, .7, .75, .8]), b = pick([.5, 1, 1.5, 2, 3]), f = kelly(p, b); if (f > .02) return { q: `You win ${pct(p)} of the time and a win pays <b>${b}</b> per 1 staked.`, ans: f, why: `${p} − ${+(1 - p).toFixed(2)}/${b} = ${+f.toFixed(4)}, so stake ${pct(f)}.` }; } } },
    ],
  },
  {
    id: 'invest', title: 'Kelly for investing', short: 'Investing',
    blurb: 'How much of your money belongs in stocks: (μ − r) / σ².',
    blocks: [
      { kind: 'text', html: `<p>A stock isn't a coin, but the same idea works. Put a fraction <b>f</b> of your money in a stock that returns <b>μ</b> a year on average, with volatility (yearly standard deviation) <b>σ</b>. The rest earns the cash rate <b>r</b>.</p>
<p>Over short steps the growth rate works out to</p><p class="eq">G(f) = r + f(μ − r) − ½ f² σ²</p><p>The last term is the drag from ups and downs: it is the bend in the ln curve from part 1. Lose 50% and you need +100% to get back.</p>
<p class="dim">The keyboard has no Greek μ or σ, so write <b>a = μ − r</b> (the extra return) and <b>s = σ</b>.</p>` },
      { kind: 'type', id: 'dGi', check: 'expr', target: 'a-s^2f', label: 'G′(f) =', prompt: 'G(f) = r + af − ½ s² f². Differentiate.', hint: 'r is a constant; af gives a; −½ s² f² gives −s² f.' },
      { kind: 'type', id: 'fi', check: 'expr', target: '\\frac{a}{s^2}', label: 'f* =', prompt: 'Set G′(f) = 0 and solve for f.', hint: 'a − s² f = 0, so s² f = a.' },
      { kind: 'text', html: `<p class="eq">f* = (μ − r) / σ²</p><p>Extra return over cash, divided by variance. Plug it back in and the best growth rate is r + (μ − r)² / (2σ²).</p>` },
      { kind: 'sim', sim: 'invest', html: '<p>Set the numbers. The dot is the Kelly fraction.</p>' },
      { kind: 'drill', id: 'investNum', goal: 3, label: 'f* =', prompt: 'Kelly fraction to hold in the stock? A decimal or a percent is fine.', tol: .02,
        gen: () => { const mu = pick([.06, .07, .08, .09, .1, .12]), r = pick([.02, .03, .04]), s = pick([.15, .2, .25, .3, .4]), f = kellyInvest(mu, r, s);
          return { q: `Expected return ${pct(mu)} a year, cash pays ${pct(r)}, volatility ${pct(s)}.`, ans: f, why: `(${mu} − ${r}) / ${s}² = ${+(mu - r).toFixed(2)} / ${+(s * s).toFixed(4)} = ${+f.toFixed(3)}${f > 1 ? ': more than all your money, so it means borrowing' : ''}.` }; } },
      { kind: 'choice', id: 'lever', prompt: 'For a broad stock index, guesses like μ − r = 5% and σ = 18% give f* ≈ 1.5. What does a Kelly fraction above 1 mean?', options: ['Put in all your money and borrow half as much again', 'Something went wrong: f can\'t be above 1', 'Keep 50% in cash'], answer: 0,
        why: 'f = 1.5 means $150 in the index for every $100 you own. Few people do this, and part 4 shows why: μ is a guess, and overbetting a guess is expensive.' },
    ],
  },
  {
    id: 'variants', title: 'Variants people use', short: 'Variants',
    blurb: 'Half Kelly, an edge you only estimated, several bets at once, and partial losses.',
    blocks: [
      { kind: 'text', html: `<p><b>Fractional Kelly.</b> Most people who use Kelly stake a fixed share of it, often half. Near the peak, G is close to a parabola, so staking c times the Kelly bet keeps</p><p class="eq">2c − c²</p><p>of the best growth rate, while the swings scale with c.</p>` },
      { kind: 'drill', id: 'half', goal: 1, label: '', prompt: 'What share of the best growth does half Kelly (c = ½) keep?', fixed: { q: 'Use 2c − c².', ans: .75, why: '2(½) − ¼ = ¾: three quarters of the growth for half the swings.' } },
      { kind: 'sim', sim: 'half', html: '<p>The 60% coin, 500 bets, 40 players. Compare the typical result with the typical worst fall from a high point.</p>' },
      { kind: 'text', html: `<p><b>When your edge is a guess.</b> The formula uses p, but you only ever have an estimate of p. Overestimate it and you overbet.</p>` },
      { kind: 'sim', sim: 'edge', html: '<p>You stake the Kelly bet for the p you believe. The curve shows what you really get as the true p changes.</p>' },
      { kind: 'choice', id: 'wrongp', prompt: 'You think the coin wins 60% (so you stake 20%), but it really wins 55%. Your growth is about…', options: ['the same as betting right', 'zero', 'a bit below the best'], answer: 1,
        why: 'For a 55% coin the Kelly bet is 10%, and 20% is twice that: break-even. Underbetting by the same amount would still have grown. Uncertainty is the main reason to bet half Kelly or less.' },
      { kind: 'text', html: `<p><b>Several bets at once.</b> For investments that move independently, each one gets its own (μᵢ − r)/σᵢ². When they move together, the vector version is f = Σ⁻¹(μ − r), with Σ the covariance matrix: correlated holdings share one budget.</p>` },
      { kind: 'drill', id: 'two', goal: 1, label: 'f =', prompt: 'Two independent stocks. A: extra return 4%, volatility 20%. B: extra return 3%, volatility 30%. Kelly fraction in B?', fixed: { q: '', ans: .03 / .09, why: '0.03 / 0.3² = 0.03 / 0.09 = ⅓. (A gets 0.04 / 0.04 = 1.)' } },
      { kind: 'text', html: `<p><b>Partial losses.</b> If a loss costs only a fraction <b>a</b> of the stake (a stop-loss, or a trade you can exit), the same derivation gives</p><p class="eq">f* = p/a − q/b</p><p>With a = 1 it is the bet you derived.</p>` },
      { kind: 'drill', id: 'partial', goal: 1, label: 'f* =', prompt: 'p = 0.6, a win pays b = 1, a loss costs a = 0.5 of the stake. Kelly bet?', fixed: { q: '', ans: .8, why: '0.6/0.5 − 0.4/1 = 1.2 − 0.4 = 0.8.' } },
      { kind: 'text', html: `<p class="key">Kelly gives the fastest long-run growth and never risks ruin, but full Kelly is a rough ride and assumes you know your edge. In practice: estimate honestly, then stake a fraction of Kelly.</p>` },
    ],
  },
];
