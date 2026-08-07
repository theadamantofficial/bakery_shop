"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const clamp = (value: number) => Math.min(1, Math.max(0, value));

function span(progress: number, start: number, end: number) {
  return clamp((progress - start) / (end - start));
}

function windowed(progress: number, start: number, peakIn: number, peakOut: number, end: number) {
  return Math.min(span(progress, start, peakIn), 1 - span(progress, peakOut, end));
}

type WebAudioContext = AudioContext & { webkitAudioContext?: typeof AudioContext };

export function BakeryExperience() {
  const storyRef = useRef<HTMLElement>(null);
  const audioRef = useRef<AudioContext | null>(null);
  const lastSoundRef = useRef(0);
  const frameRef = useRef<number | null>(null);
  const [progress, setProgress] = useState(0);
  const [entered, setEntered] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [stage, setStage] = useState(0);

  const makeAudio = useCallback(() => {
    if (audioRef.current) return audioRef.current;
    const AudioConstructor = window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioConstructor) return null;
    const context = new AudioConstructor() as WebAudioContext;
    audioRef.current = context;
    return context;
  }, []);

  const playBell = useCallback((context: AudioContext, delay = 0) => {
    [740, 1110, 1480].forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = index === 0 ? "sine" : "triangle";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, context.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(0.045 / (index + 1), context.currentTime + delay + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + delay + 1.8);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(context.currentTime + delay);
      oscillator.stop(context.currentTime + delay + 1.9);
    });
  }, []);

  const playDoor = useCallback((context: AudioContext) => {
    const duration = 1.35;
    const buffer = context.createBuffer(1, context.sampleRate * duration, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < data.length; index += 1) {
      data[index] = (Math.random() * 2 - 1) * (1 - index / data.length);
    }
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    source.buffer = buffer;
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(160, context.currentTime);
    filter.frequency.exponentialRampToValueAtTime(620, context.currentTime + duration);
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.14, context.currentTime + 0.18);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + duration);
    source.connect(filter).connect(gain).connect(context.destination);
    source.start();
    playBell(context, 0.72);
  }, [playBell]);

  const playOven = useCallback((context: AudioContext) => {
    const duration = 0.85;
    const buffer = context.createBuffer(1, context.sampleRate * duration, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < data.length; index += 1) {
      const pop = Math.random() > 0.986 ? Math.random() * 0.9 : 0;
      data[index] = (Math.random() * 2 - 1) * 0.05 + pop;
    }
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    source.buffer = buffer;
    filter.type = "bandpass";
    filter.frequency.value = 920;
    filter.Q.value = 0.7;
    gain.gain.setValueAtTime(0.12, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + duration);
    source.connect(filter).connect(gain).connect(context.destination);
    source.start();
  }, []);

  const enterBakery = useCallback(async () => {
    setEntered(true);
    if (!soundOn) return;
    const context = makeAudio();
    if (!context) return;
    await context.resume();
    playDoor(context);
    lastSoundRef.current = 1;
  }, [makeAudio, playDoor, soundOn]);

  const toggleSound = useCallback(async () => {
    const next = !soundOn;
    setSoundOn(next);
    if (next) {
      const context = makeAudio();
      if (context) {
        await context.resume();
        playBell(context, 0);
      }
    }
  }, [makeAudio, playBell, soundOn]);

  useEffect(() => {
    const update = () => {
      frameRef.current = null;
      const element = storyRef.current;
      if (!element) return;
      const rect = element.getBoundingClientRect();
      const distance = Math.max(1, element.offsetHeight - window.innerHeight);
      const next = clamp(-rect.top / distance);
      setProgress(next);

      const nextStage = next < 0.17 ? 0 : next < 0.39 ? 1 : next < 0.63 ? 2 : next < 0.86 ? 3 : 4;
      setStage((current) => (current === nextStage ? current : nextStage));
    };

    const onScroll = () => {
      if (frameRef.current === null) frameRef.current = requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, []);

  useEffect(() => {
    if (!entered || !soundOn || stage <= lastSoundRef.current) return;
    const context = audioRef.current;
    if (!context) return;
    if (stage === 1) playBell(context, 0);
    if (stage === 3) playOven(context);
    lastSoundRef.current = stage;
  }, [entered, playBell, playOven, soundOn, stage]);

  useEffect(() => {
    return () => {
      audioRef.current?.close();
    };
  }, []);

  const introOpen = entered ? 0.34 : 0;
  const doorOpen = Math.max(introOpen, span(progress, 0.015, 0.17));
  const entranceOpacity = 1 - span(progress, 0.08, 0.2);
  const cakeOpacity = windowed(progress, 0.12, 0.21, 0.34, 0.44);
  const kitchenOpacity = windowed(progress, 0.36, 0.45, 0.57, 0.67);
  const ovenOpacity = windowed(progress, 0.59, 0.68, 0.81, 0.9);
  const finaleOpacity = span(progress, 0.84, 0.97);
  const ovenBake = span(progress, 0.65, 0.84);

  return (
    <main className="site-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Maison Miette, back to entrance">
          <span className="brand-mark">M</span>
          <span>
            <strong>Maison Miette</strong>
            <small>Pâtisserie · Boulangerie</small>
          </span>
        </a>
        <div className="topbar-actions">
          <a href="#menu" className="nav-order">Today&apos;s bakes</a>
          <button className="sound-toggle" onClick={toggleSound} aria-pressed={soundOn} type="button">
            <span className={`sound-icon ${soundOn ? "is-on" : ""}`} aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            {soundOn ? "Sound on" : "Sound off"}
          </button>
        </div>
      </header>

      <aside className="chapter-rail" aria-label="Story progress">
        <span className="chapter-line"><i style={{ height: `${progress * 100}%` }} /></span>
        {["Enter", "Taste", "Kitchen", "Oven", "Welcome"].map((label, index) => (
          <span className={stage >= index ? "active" : ""} key={label}>
            <b>{String(index + 1).padStart(2, "0")}</b>{label}
          </span>
        ))}
      </aside>

      <section className="scroll-story" id="top" ref={storyRef} aria-label="The Maison Miette story">
        <div className="story-stage">
          <div
            className="bakery-world"
            aria-hidden="true"
            style={{
              transform: `scale(${1.02 + progress * 0.48}) translate3d(${progress * -3}%, ${progress * 1.5}%, 0)`,
              filter: `saturate(${0.84 + progress * 0.28}) brightness(${0.72 + progress * 0.13})`,
            }}
          />
          <div className="world-vignette" aria-hidden="true" />
          <div className="film-grain" aria-hidden="true" />

          <div className="entrance-copy scene" style={{ opacity: entranceOpacity }}>
            <p className="eyebrow"><span /> 17 Rue des Lilas · Since 1987 <span /></p>
            <h1>Every crumb<br /><em>tells a story.</em></h1>
            <p className="lede">Come in before the city wakes. The butter is folding,<br className="desktop-only" /> the copper is warming, and something beautiful is rising.</p>
            <button className={`enter-button ${entered ? "entered" : ""}`} type="button" onClick={enterBakery}>
              <span>{entered ? "The doors are open" : "Enter the bakery"}</span>
              <i aria-hidden="true">↘</i>
            </button>
            <small className="sound-note">Best experienced with sound</small>
          </div>

          <div
            className="door door-left"
            aria-hidden="true"
            style={{ transform: `perspective(1500px) translateX(${-doorOpen * 94}%) rotateY(${doorOpen * 24}deg)` }}
          >
            <div className="door-panel top" /><div className="door-panel middle" /><div className="door-panel bottom" />
            <span className="door-knob" />
          </div>
          <div
            className="door door-right"
            aria-hidden="true"
            style={{ transform: `perspective(1500px) translateX(${doorOpen * 94}%) rotateY(${-doorOpen * 24}deg)` }}
          >
            <div className="door-panel top" /><div className="door-panel middle" /><div className="door-panel bottom" />
            <span className="door-knob" />
          </div>

          <section className="cake-scene scene" style={{ opacity: cakeOpacity, pointerEvents: cakeOpacity > 0.6 ? "auto" : "none" }} aria-label="Our signature cakes">
            <div className="scene-heading left-heading">
              <p className="eyebrow">Act II · The counter</p>
              <h2>Little works<br />of <em>edible art.</em></h2>
              <p>Built by hand, finished by instinct, and made to disappear.</p>
            </div>
            <div className="cake-orbit" style={{ transform: `translate3d(0, ${(0.5 - span(progress, 0.13, 0.39)) * 80}px, 0)` }}>
              <article className="cake-medallion cake-one">
                <div className="cake-crop" />
                <span><b>01</b> Raspberry Opera</span>
              </article>
              <article className="cake-medallion cake-two">
                <div className="cake-crop" />
                <span><b>02</b> Pistachio Cloud</span>
              </article>
              <article className="cake-medallion cake-three">
                <div className="cake-crop" />
                <span><b>03</b> Dark Cacao No. 7</span>
              </article>
            </div>
          </section>

          <section className="kitchen-scene scene" style={{ opacity: kitchenOpacity }} aria-label="Inside the kitchen">
            <div className="kitchen-frame" aria-hidden="true">
              <span className="flour flour-one" /><span className="flour flour-two" /><span className="flour flour-three" />
              <div className="counter-line" />
            </div>
            <div className="kitchen-copy">
              <p className="eyebrow">Act III · Behind the glass</p>
              <h2>The kitchen<br />keeps <em>its own time.</em></h2>
              <div className="ingredient-note">
                <span>04:12</span>
                <p><strong>First fold</strong>French butter meets stone-milled flour. Then we wait.</p>
              </div>
            </div>
            <div className="process-strip" aria-hidden="true">
              <span className={progress > 0.4 ? "lit" : ""}>Fold</span>
              <span className={progress > 0.47 ? "lit" : ""}>Rest</span>
              <span className={progress > 0.54 ? "lit" : ""}>Shape</span>
              <span className={progress > 0.6 ? "lit" : ""}>Bake</span>
            </div>
          </section>

          <section className="oven-scene scene" style={{ opacity: ovenOpacity }} aria-label="The baking process">
            <div className="oven-shell" style={{ transform: `translate(-50%, -50%) scale(${0.88 + ovenOpacity * 0.12})` }}>
              <div className="oven-arch">
                <div className="heat-lines" aria-hidden="true"><i /><i /><i /></div>
                <div className="baking-cake" style={{ transform: `translateX(-50%) scaleY(${0.72 + ovenBake * 0.28})` }}>
                  <span className="cake-top" />
                  <span className="cake-body" />
                </div>
                <div className="oven-stone" />
              </div>
              <div className="oven-dial"><i style={{ transform: `rotate(${-42 + ovenBake * 84}deg)` }} /></div>
            </div>
            <div className="oven-copy">
              <p className="eyebrow">Act IV · The rise</p>
              <h2>Heat turns patience<br />into <em>pleasure.</em></h2>
              <p className="temperature"><span>{Math.round(120 + ovenBake * 60)}°</span> Slow, even, golden.</p>
            </div>
            <div className="bake-notes">
              <article className={ovenBake > 0.12 ? "revealed" : ""}><b>01</b><span><strong>Real time</strong>No shortcuts. No premixes.</span></article>
              <article className={ovenBake > 0.46 ? "revealed" : ""}><b>02</b><span><strong>Real seasons</strong>Fruit when it tastes like itself.</span></article>
              <article className={ovenBake > 0.78 ? "revealed" : ""}><b>03</b><span><strong>Real hands</strong>Every layer, every morning.</span></article>
            </div>
          </section>

          <section className="finale-scene scene" style={{ opacity: finaleOpacity, pointerEvents: finaleOpacity > 0.7 ? "auto" : "none" }} aria-label="Welcome to Maison Miette">
            <div className="finale-halo" aria-hidden="true" />
            <p className="eyebrow">And now, the best part</p>
            <h2>Come for the cake.<br /><em>Stay for the ritual.</em></h2>
            <a className="primary-link" href="#menu">See what&apos;s warm <span>↓</span></a>
          </section>

          <div className="scroll-cue" style={{ opacity: 1 - span(progress, 0.04, 0.15) }} aria-hidden="true">
            <span>Scroll to follow the flour</span><i />
          </div>
        </div>
      </section>

      <section className="menu-section" id="menu">
        <div className="menu-intro reveal-block">
          <p className="eyebrow dark">Fresh from the oven · Friday, 7 August</p>
          <h2>Today&apos;s small<br /><em>temptations.</em></h2>
          <p>We bake in small numbers because the best things are not meant for shelves.</p>
        </div>
        <div className="menu-grid">
          <article className="menu-card card-raspberry">
            <div className="menu-image"><span>New</span></div>
            <div className="menu-card-copy"><p><b>01</b> Seasonal</p><h3>Raspberry<br />Rose Gateau</h3><small>Almond sponge · rose cream · fresh berries</small><strong>₹ 620</strong></div>
          </article>
          <article className="menu-card card-cacao">
            <div className="menu-image" />
            <div className="menu-card-copy"><p><b>02</b> Maison classic</p><h3>Dark Cacao<br />No. 7</h3><small>70% cacao · brown butter · sea salt</small><strong>₹ 580</strong></div>
          </article>
          <article className="menu-card card-croissant">
            <div className="menu-image" />
            <div className="menu-card-copy"><p><b>03</b> Morning only</p><h3>Butter<br />Croissant</h3><small>Three-day lamination · cultured butter</small><strong>₹ 240</strong></div>
          </article>
        </div>
      </section>

      <section className="philosophy-section">
        <div className="stamp" aria-hidden="true"><span>MM</span><small>Handmade daily</small></div>
        <p className="eyebrow dark">Our promise</p>
        <blockquote>“If it cannot be made slowly,<br />it does not belong here.”</blockquote>
        <div className="promise-grid">
          <span><b>01</b> Cultured butter</span><span><b>02</b> Local fruit</span><span><b>03</b> Stone-milled flour</span><span><b>04</b> Zero premixes</span>
        </div>
      </section>

      <footer className="site-footer">
        <div><span className="brand-mark light">M</span><h2>Save room<br /><em>for wonder.</em></h2></div>
        <div className="footer-details"><p><small>Visit us</small>17 Rue des Lilas<br />Colaba, Mumbai</p><p><small>Hours</small>Tue–Sun · 7:30–19:00<br />Monday · We rest</p><p><small>Say bonjour</small>hello@maisonmiette.in<br />+91 22 4800 1987</p></div>
        <div className="footer-bottom"><span>© 2026 Maison Miette</span><a href="#top">Return to the doors ↑</a></div>
      </footer>
    </main>
  );
}
