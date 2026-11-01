import { useEffect, useRef, useState, type CSSProperties } from 'react';

const valueText = (d: number) => `Day ${d} of 7${d === 7 ? ', recovered' : d === 1 ? ', drooping' : ''}`;

// Day 1 → 7: the slider crossfades the day-7 photo over the day-1 photo of the same plant.
// Server and first client render both show day 7, so hydration matches and no-JS visitors see the recovered plant.
export function RecoveryPanel() {
  const [day, setDay] = useState(7);
  const photo = useRef<HTMLElement>(null);
  const slider = useRef<HTMLInputElement>(null);
  const touched = useRef(false);
  const raf = useRef(0);
  const d = Math.round(day);

  useEffect(() => {
    // A drag made before React loaded counts as a drag: keep that day and never autoplay.
    const early = parseFloat(slider.current!.value);
    if (early !== 7) { touched.current = true; setDay(early); return; }
    // No autoplay for reduced motion or without IntersectionObserver (iOS < 12.2): stay on the recovered plant.
    if (matchMedia('(prefers-reduced-motion: reduce)').matches || typeof IntersectionObserver === 'undefined') return;

    // Play the week once, when the panel is mostly on screen; a drag stops it, and a drag before it starts
    // (on phones the slider is below the photo) means it never starts.
    setDay(1);
    const io = new IntersectionObserver((entries, obs) => {
      if (!entries[0].isIntersecting) return;
      obs.disconnect();
      if (touched.current) return;
      const start = performance.now(), ms = 2800;
      const tick = (now: number) => {
        const t = Math.min(1, (now - start) / ms);
        setDay(1 + 6 * (1 - Math.pow(1 - t, 3)));
        if (t < 1) raf.current = requestAnimationFrame(tick);
      };
      raf.current = requestAnimationFrame(tick);
    }, { threshold: 0.6 });
    io.observe(photo.current!);
    return () => { io.disconnect(); cancelAnimationFrame(raf.current); };
  }, []);

  return (
    <li className="step grid items-center gap-8 rounded-[6px] bg-olive p-[clamp(24px,4vw,56px)] text-surface [grid-column:1/-1] mt-4 min-[760px]:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <figure ref={photo} className="relative mb-5 aspect-square w-full max-w-[480px] overflow-hidden rounded bg-photo">
        <img src="/assets/day1.webp" width={880} height={880} loading="lazy"
          alt="The same houseplant on day 1, wilting with yellow, brown-edged leaves, and by day 7 upright and green"
          className="absolute inset-0 h-full w-full rounded bg-photo object-cover" />
        <img data-testid="day7" src="/assets/day7.webp" width={880} height={880} loading="lazy" alt=""
          style={{ opacity: (day - 1) / 6 }} className="absolute inset-0 h-full w-full rounded bg-photo object-cover" />
      </figure>
      <div className="step-7-text">
        <h3 className="text-[clamp(2.4rem,5vw,4rem)] leading-none">Check on day 7</h3>
        <p className="mt-2 max-w-[40ch] text-surface/[.78]">Scan again a week later. Rebloom compares the two photos, so you know whether the plan is working or needs to change.</p>
        <div className="mt-8 max-w-[440px]">
          <p className="mt-2 text-[15px] font-semibold tabular-nums text-surface/[.78]" aria-hidden="true">
            <b className="mr-1.5 font-serif text-[32px] font-normal text-surface">Day <span>{d}</span></b> of 7
          </p>
          <input
            ref={slider} className="days-range" type="range" min={1} max={7} step={0.01} value={day.toFixed(2)}
            aria-label="Day of recovery" aria-valuetext={valueText(d)}
            style={{ '--p': `${((day - 1) / 6) * 100}%` } as CSSProperties}
            onChange={e => { touched.current = true; cancelAnimationFrame(raf.current); setDay(parseFloat(e.target.value)); }}
          />
          <div className="flex justify-between text-[14px] text-surface/60" aria-hidden="true">
            <span>Day 1, drooping</span><span>Day 7, recovered</span>
          </div>
        </div>
      </div>
    </li>
  );
}
