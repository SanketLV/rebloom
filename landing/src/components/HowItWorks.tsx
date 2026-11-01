import { RecoveryPanel } from './RecoveryPanel';

const STEPS = [
  { title: 'Scan', photo: '/assets/step-scan.webp', text: 'Photograph the leaf that worries you. One leaf, close up, in good light.' },
  { title: 'Answer', photo: '/assets/step-answer.webp', text: 'A few quick questions about watering, light and where the plant lives. Your answers tell look-alike problems apart.' },
  { title: 'Treat', photo: '/assets/step-treat.webp', text: 'A step-by-step plan, natural fix first. Reminders arrive on the days you need to act.' },
];

export function HowItWorks() {
  return (
    <section className="bg-surface py-[clamp(80px,12vw,160px)]" id="how" aria-labelledby="how-title">
      <div className="wrap">
        <h2 id="how-title">How it works</h2>
        <ol className="steps mt-[clamp(40px,6vw,72px)] grid gap-x-8 gap-y-10 min-[760px]:grid-cols-3">
          {STEPS.map(s => (
            <li key={s.title} className="step">
              {/* The step number sits on the photo, bottom left (CSS counter). */}
              <figure className="step-figure relative mb-5">
                <img src={s.photo} width={896} height={1120} alt="" loading="lazy"
                  className="aspect-[4/5] w-full rounded bg-photo object-cover max-[899px]:max-h-[52svh] min-[760px]:aspect-square" />
              </figure>
              <h3 className="font-sans text-[20px] font-bold tracking-normal">{s.title}</h3>
              <p className="mt-2 max-w-[36ch] text-ink-2">{s.text}</p>
            </li>
          ))}
          <RecoveryPanel />
        </ol>
      </div>
    </section>
  );
}
