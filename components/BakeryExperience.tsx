"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cakes, chapters, chapterDurations, chooseCake, frostingLabels, initialOrder, money, orderPrice, processLabel, toppingLabels, type CakeKind, type CakeOrder, type Frosting, type Topping } from "./bakery-order";
import type { BakeryWorld } from "./bakery-world";

const narrative = [
  { eyebrow: "17 Rue des Lilas · Since 1987", title: <>Every crumb<br />{" "}tells a <em>story.</em></>, copy: "A quiet street. A golden window. And the beginning of something delicious." },
  { eyebrow: "Chapter 02 · A warm welcome", title: <>Make yourself<br />{" "}<em>at home.</em></>, copy: "The bell rings. Butter fills the air. Behind the counter, Émile is already making a little magic." },
  { eyebrow: "Chapter 03 · Today’s small temptations", title: <>Love at<br />{" "}<em>first layer.</em></>, copy: "Three signature cakes, made by hand. Choose the one that catches your eye." },
  { eyebrow: "Chapter 04 · A cake with your name on it", title: <>A little more<br />{" "}<em>you.</em></>, copy: "Choose your layers, your finish, your little flourish. We’ll make it just for you." },
  { eyebrow: "Chapter 05 · Behind the counter", title: <>Good things<br />{" "}start <em>simply.</em></>, copy: "Stone-milled flour. Fresh eggs. Cultured butter. Émile follows your order into the kitchen." },
  { eyebrow: "Chapter 06 · Patience, made golden", title: <>A little heat.<br />{" "}<em>A little wonder.</em></>, copy: "Silky batter meets the copper oven. Watch your cake rise, then rest on the cooling rack." },
  { eyebrow: "Chapter 07 · The finishing touch", title: <>The art is<br />{" "}in the <em>details.</em></>, copy: "Your chosen frosting. Little clouds of cream. Each finishing touch, placed by hand." },
  { eyebrow: "Chapter 08 · From our hands to yours", title: <>Made with love.<br />{" "}<em>Made for you.</em></>, copy: "A cream box, a raspberry ribbon, and a little piece of Maison Miette to take home." },
];

export function BakeryExperience() {
  const host = useRef<HTMLDivElement>(null);
  const world = useRef<BakeryWorld | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const audio = useRef<AudioContext | null>(null);
  const [stage, setStage] = useState(0);
  const [visited, setVisited] = useState(0);
  const [order, setOrder] = useState<CakeOrder>(initialOrder);
  const [progress, setProgress] = useState<Record<number, number>>({});
  const [loading, setLoading] = useState(5);
  const [fallback, setFallback] = useState(false);
  const [sound, setSound] = useState(false);
  const [paused, setPaused] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [summary, setSummary] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const currentProgress = progress[stage] ?? 0;
  const cake = cakes[order.cake];
  const price = orderPrice(order);
  const busy = stage >= 4 && currentProgress < 1;

  const chime = useCallback((chapter: number) => {
    if (!audio.current) return;
    const context = audio.current;
    void context.resume().then(() => {
      [chapter === 1 ? 880 : 523.25, 1046.5, 1318.5].forEach((frequency, i) => {
        const tone = context.createOscillator();
        const volume = context.createGain();
        tone.frequency.value = frequency;
        tone.type = "sine";
        volume.gain.setValueAtTime(.0001, context.currentTime);
        volume.gain.exponentialRampToValueAtTime(.035 / (i + 1), context.currentTime + .025);
        volume.gain.exponentialRampToValueAtTime(.0001, context.currentTime + 1.3);
        tone.connect(volume).connect(context.destination);
        tone.start(); tone.stop(context.currentTime + 1.4);
      });
    }).catch(() => {});
  }, []);

  const go = useCallback((next: number) => {
    setStage(next); setVisited(old => Math.max(old, next)); setPaused(false);
    if (sound) chime(next);
  }, [chime, sound]);

  const selectCake = useCallback((kind: CakeKind) => {
    setOrder(old => chooseCake(old, kind));
    setSubmitted(false); setConfirmed(false); setProgress({});
    setVisited(old => Math.min(old, 3));
  }, []);

  useEffect(() => {
    let disposed = false;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onMotion = () => setReducedMotion(motion.matches);
    onMotion(); motion.addEventListener("change", onMotion);
    import("./bakery-world").then(({ createBakeryWorld }) => {
      if (disposed || !host.current) return;
      setLoading(35);
      world.current = createBakeryWorld(host.current, {
        onReady: () => { if (!disposed) setLoading(100); },
        onFailure: () => { if (!disposed) { setFallback(true); setLoading(100); } },
        onSelect: selectCake,
      });
    }).catch(() => { if (!disposed) { setFallback(true); setLoading(100); } });
    return () => { disposed = true; world.current?.dispose(); world.current = null; motion.removeEventListener("change", onMotion); };
  }, [selectCake]);

  useEffect(() => { world.current?.update({ stage, progress: currentProgress, order, reducedMotion, paused }); }, [stage, currentProgress, order, reducedMotion, paused, loading]);
  useEffect(() => { if (stage > 0) heading.current?.focus({ preventScroll: true }); }, [stage]);
  useEffect(() => () => { void audio.current?.close(); }, []);

  useEffect(() => {
    if (stage < 4 || paused || loading < 100) return;
    let previous = performance.now();
    const timer = window.setInterval(() => {
      const now = performance.now();
      const delta = Math.min((now - previous) / 1000, .3);
      previous = now;
      if (document.hidden) return;
      setProgress(old => {
        const value = old[stage] ?? 0;
        return value >= 1 ? old : { ...old, [stage]: Math.min(1, value + delta / chapterDurations[stage]) };
      });
    }, 100);
    return () => clearInterval(timer);
  }, [stage, paused, loading]);

  useEffect(() => {
    if (stage < 4 || stage > 6 || currentProgress < 1 || paused) return;
    const timer = setTimeout(() => go(stage + 1), 1600);
    return () => clearTimeout(timer);
  }, [stage, currentProgress, paused, go]);

  function customize(next: Partial<CakeOrder>) {
    setOrder(old => ({ ...old, ...next }));
    setSubmitted(false); setConfirmed(false); setProgress({}); setVisited(3);
  }
  function placeOrder() { setSubmitted(true); setConfirmed(false); setProgress({}); go(4); }
  function skip() {
    setProgress(old => ({ ...old, [stage]: 1 }));
    if (stage < 7) go(stage + 1);
  }
  function restart() {
    setOrder(initialOrder); setSubmitted(false); setConfirmed(false); setProgress({}); setVisited(0); setSummary(false); go(0);
  }
  function toggleSound() {
    const next = !sound;
    setSound(next);
    if (next) {
      const Constructor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Constructor) { setSound(false); return; }
      audio.current ??= new Constructor(); chime(stage);
    } else void audio.current?.suspend();
  }

  return (
    <main className={`journey-shell chapter-${stage}`} id="top">
      <a className="skip-link" href="#journey-controls">Skip to story controls</a>
      <div className="world-host" ref={host} aria-hidden="true" />
      <div className="world-wash" aria-hidden="true" />
      {loading < 100 && <div className="world-loading" role="status"><span className="loading-monogram">M</span><span>Warming up the bakery</span><progress value={loading} max={100} /><small>Setting the table for your story.</small></div>}
      {fallback && <div className="world-fallback"><span className="fallback-monogram" aria-hidden="true">M</span><p>The kitchen view is resting.<br />{" "}You can still create your cake and follow every step below.</p><button type="button" onClick={() => window.location.reload()}>Try the 3D experience again</button></div>}

      <header className="journey-header">
        <a className="journey-brand" href="#top" onClick={event => { event.preventDefault(); go(0); }} aria-label="Maison Miette, back to entrance"><span className="brand-seal">M<span>·</span></span><span><strong>Maison Miette</strong><small>PÂTISSERIE & BOULANGERIE</small></span></a>
        <div className="header-center"><span className="live-dot" /> A little Paris, a little closer.</div>
        <div className="header-tools"><button type="button" className="sound-button" aria-pressed={sound} aria-label={sound ? "Mute bakery sound" : "Enable bakery sound"} onClick={toggleSound}><span aria-hidden="true">{sound ? "♫" : "♩"}</span><span>Sound {sound ? "on" : "off"}</span></button><button type="button" className="order-button" aria-expanded={summary} aria-controls="order-summary" onClick={() => setSummary(!summary)}><span aria-hidden="true">♧</span> Your cake <span className="order-count">{submitted ? "1" : "0"}</span></button></div>
      </header>

      <div className="location-tag"><span aria-hidden="true">⌖</span> {stage === 0 ? "Outside the maison" : stage < 4 || stage === 7 ? "Inside the maison" : "Émile’s open kitchen"}<span className="location-rule" /><span>07:30 AM</span></div>
      <section className="story-panel" id="journey-controls" aria-label={chapters[stage]}>
        <p className="chapter-eyebrow"><span className="chapter-index">{String(stage + 1).padStart(2, "0")}</span>{narrative[stage].eyebrow}</p>
        <h1 tabIndex={-1} ref={heading}>{confirmed && stage === 7 ? <>A sweet ending.<br />{" "}<em>Until next time.</em></> : narrative[stage].title}</h1>
        <p className="story-copy">{confirmed && stage === 7 ? "Your demo order is complete. No payment was taken. Émile will keep a little room for you at the counter." : narrative[stage].copy}</p>

        {stage === 0 && <><button className="journey-primary" type="button" onClick={() => go(1)}>Enter the bakery <span aria-hidden="true">↗</span></button><div className="intro-footnote"><span className="tiny-flower" aria-hidden="true">✳</span><span><strong>Our promise</strong>Everything made slowly. Every morning.</span></div></>}
        {stage === 1 && <><div className="welcome-note"><span aria-hidden="true">“</span><p>Bonjour, I’m Émile.<br />{" "}Let’s make something beautiful.</p><small>YOUR BAKER, SINCE 1987</small></div><button className="journey-primary" type="button" onClick={() => go(2)}>Explore the counter <span aria-hidden="true">→</span></button></>}
        {stage === 2 && <div className="cake-selection"><div className="cake-options" role="group" aria-label="Choose your signature cake">{(Object.keys(cakes) as CakeKind[]).map((kind, i) => <button type="button" key={kind} aria-pressed={kind === order.cake} className={kind === order.cake ? "cake-option selected" : "cake-option"} onClick={() => selectCake(kind)}><span className="cake-swatch" style={{ backgroundColor: cakes[kind].color }} aria-hidden="true">{String(i + 1).padStart(2, "0")}</span><span><strong>{cakes[kind].short}</strong><small>From {money(cakes[kind].price)} · 4 servings</small></span><span className="selection-check" aria-hidden="true">{kind === order.cake ? "✓" : "↗"}</span></button>)}</div><p className="selected-ingredients">{cake.ingredients}<br />{" "}<span>Contains dairy, eggs & nuts.</span></p><button className="journey-primary" type="button" onClick={() => go(3)}>Make this cake yours <span aria-hidden="true">→</span></button></div>}
        {stage === 3 && <div className="customizer"><div className="selected-cake-name"><span style={{ backgroundColor: cake.color }} /><strong>{cake.name}</strong><button type="button" onClick={() => go(2)}>Change</button></div><fieldset><legend>A little gathering</legend><div className="choice-row">{([4, 6, 8] as const).map(size => <button type="button" key={size} aria-pressed={order.servings === size} onClick={() => customize({ servings: size })}>{size} servings</button>)}</div></fieldset><fieldset><legend>The frosting</legend><div className="choice-row">{(Object.keys(frostingLabels) as Frosting[]).map(kind => <button type="button" key={kind} aria-pressed={order.frosting === kind} onClick={() => customize({ frosting: kind })}>{frostingLabels[kind]}</button>)}</div></fieldset><fieldset><legend>The finishing touch</legend><div className="choice-row">{(Object.keys(toppingLabels) as Topping[]).map(kind => <button type="button" key={kind} aria-pressed={order.topping === kind} onClick={() => customize({ topping: kind })}>{toppingLabels[kind]}</button>)}</div></fieldset><div className="price-line"><span>Made just for you <small>{order.servings} servings · whole cake</small></span><strong>{money(price)}</strong></div><button className="journey-primary" type="button" onClick={placeOrder}>Give Émile my order <span aria-hidden="true">→</span></button><small className="demo-note">A bakery story, with a demo order. No payment required.</small></div>}
        {stage >= 4 && (stage !== 7 || !confirmed) && <div className="making-panel"><div className="order-ticket"><span className="ticket-mark">M</span><div><small>ÉMILE’S ORDER · NO. 001</small><strong>{cake.short}</strong><span>{order.servings} servings · {frostingLabels[order.frosting]}<br />{" "}{toppingLabels[order.topping]}</span></div><span className="ticket-price">{money(price)}</span></div><div className="making-status" aria-live="polite"><span>{currentProgress >= 1 ? stage === 7 ? "Your box is ready at the counter" : "Beautiful. On to the next little ritual." : processLabel(stage, currentProgress)}</span><span aria-hidden="true">{Math.round(currentProgress * 100)}%</span></div><progress className="making-progress" value={currentProgress} max={1} aria-label={`${chapters[stage]} progress`} /><p className="time-note">{stage === 5 ? "Our 35-minute bake, shown in 24 seconds." : stage === 7 ? "Wrapped by hand. Ready to take home." : "A little time with Émile. The story continues automatically."}</p>{stage === 4 && busy && <button type="button" className="journey-primary" onClick={() => setProgress(old => ({ ...old, [stage]: Math.min(1, (old[stage] ?? 0) + .18) }))}>{currentProgress < .6 ? "Help sprinkle the flour" : "Give it a gentle stir"} <span aria-hidden="true">✳</span></button>}{stage === 7 && currentProgress >= 1 && <button type="button" className="journey-primary" onClick={() => { setConfirmed(true); if (sound) chime(7); }}>Confirm demo order · {money(price)} <span aria-hidden="true">✓</span></button>}{!busy && stage < 7 && <button type="button" className="journey-primary" onClick={() => go(stage + 1)}>Continue the story <span aria-hidden="true">→</span></button>}{busy && <div className="playback-controls"><button type="button" aria-pressed={paused} onClick={() => setPaused(!paused)}>{paused ? "▶ Resume" : "Ⅱ Pause"}</button><button type="button" onClick={skip}>{stage === 7 ? "Finish wrapping" : "Skip this step"} <span aria-hidden="true">→</span></button></div>}</div>}
        {confirmed && stage === 7 && <div className="completion"><div className="completion-seal" aria-hidden="true">✓</div><p><strong>{cake.name}</strong><br />{" "}{order.servings} servings · {money(price)}<br />{" "}<small>Demo order confirmed · No payment taken</small></p><button type="button" className="journey-primary" onClick={() => { setConfirmed(false); setSubmitted(false); setProgress({}); setVisited(3); go(2); }}>Create another cake <span aria-hidden="true">→</span></button><button type="button" className="text-button" onClick={restart}>Take the walk again ↗</button></div>}
      </section>

      {(stage === 2 || stage === 3 || stage === 6) && <div className="inspection-tools"><button type="button" aria-label="Rotate cake left" onClick={() => world.current?.rotate(-.45)}>↶</button><span>Drag to admire every layer</span><button type="button" aria-label="Rotate cake right" onClick={() => world.current?.rotate(.45)}>↷</button></div>}
      <div className="scene-caption" aria-hidden="true"><span>{stage === 0 ? "THE DOOR IS ALWAYS OPEN" : stage === 1 ? "A PLACE FOR THE LITTLE RITUALS" : stage === 2 ? "THREE CAKES. COUNTLESS LITTLE DETAILS." : stage === 3 ? "YOUR CAKE, TAKING SHAPE" : stage === 4 ? "THE GOODNESS IS IN THE INGREDIENTS" : stage === 5 ? "SLOW, EVEN, GOLDEN" : stage === 6 ? "FINISHED BY HAND, ALWAYS" : "A LITTLE BOX OF HAPPINESS"}</span><span>MAISON MIETTE · EST. 1987</span></div>

      <nav className="chapter-navigation" aria-label="Story progress"><div className="chapter-current"><span>{String(stage + 1).padStart(2, "0")}<small> / 08</small></span><strong>{chapters[stage]}</strong></div><div className="chapter-steps">{chapters.map((name, i) => <button type="button" key={name} disabled={i > visited} aria-label={`${i + 1}. ${name}`} aria-pressed={i === stage} aria-current={i === stage ? "step" : undefined} onClick={() => { go(i); if (i >= 4) setPaused(true); }} className={`${i === stage ? "current" : ""} ${i < stage ? "complete" : ""}`}><span>{i < stage ? "✓" : String(i + 1).padStart(2, "0")}</span><small>{name}</small></button>)}</div><div className="chapter-back">{stage > 0 && <button type="button" onClick={() => { go(stage - 1); if (stage - 1 >= 4) setPaused(true); }} aria-label="Previous chapter">←</button>}<span>A story worth taking slowly.</span></div></nav>
      {summary && <aside id="order-summary" className="summary-drawer" aria-label="Your cake order"><div className="drawer-heading"><p className="chapter-eyebrow">YOUR LITTLE CREATION</p><button type="button" aria-label="Close order summary" onClick={() => setSummary(false)}>×</button></div><h2>{cake.name}</h2><dl><div><dt>Gathering</dt><dd>{order.servings} servings</dd></div><div><dt>Frosting</dt><dd>{frostingLabels[order.frosting]}</dd></div><div><dt>Finishing touch</dt><dd>{toppingLabels[order.topping]}</dd></div><div><dt>Total</dt><dd>{money(price)}</dd></div></dl><p>{confirmed ? "Demo order confirmed. No payment taken." : submitted ? "Émile is making your cake." : "Your cake is waiting for your finishing touches."}</p><button type="button" className="journey-primary" onClick={() => { setSummary(false); go(3); }}>Edit my cake <span aria-hidden="true">↗</span></button><small>Contains dairy, eggs & nuts. Demo experience.</small></aside>}
    </main>
  );
}
