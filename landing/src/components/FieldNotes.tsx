import { Fragment, useState } from 'react';
import { SYMPTOMS, type Symptom } from '../content/symptoms';

// One symptom at a time: the checked radio picks its photo, caption and entry. All four stay in the HTML and the
// rest get `hidden` (not :has(), which iOS < 15.4 and Firefox < 121 lack); the server renders "tips" active, so
// the first symptom shows even without JS.
export function FieldNotes() {
  const [active, setActive] = useState<Symptom['id']>('tips');

  return (
    <section className="wrap py-[clamp(80px,12vw,160px)]" aria-labelledby="notes-title">
      <div className="grid max-w-[760px] gap-5">
        <h2 id="notes-title">Field notes</h2>
        <p className="max-w-[46ch] text-[19px] text-ink-2">Four problems we see most often on houseplants. Pick one to see what causes it and how to treat it.</p>
      </div>

      <div className="mt-[clamp(40px,6vw,72px)] grid items-start gap-[clamp(32px,5vw,80px)] min-[900px]:grid-cols-[5fr_6fr]">
        {/* A specimen plate: one photo per symptom. */}
        <figure className="m-0 rounded-[6px] border border-line bg-surface p-3 min-[900px]:sticky min-[900px]:top-6">
          {SYMPTOMS.map((s, i) => (
            <img key={s.id} data-s={s.id} hidden={s.id !== active} src={s.photo} width={896} height={1120} alt={s.alt}
              loading={i === 0 ? undefined : 'lazy'}
              className="aspect-[4/5] w-full rounded-[3px] bg-photo object-cover max-[899px]:max-h-[52svh]" />
          ))}
          <figcaption className="flex items-baseline justify-between gap-4 px-1.5 pb-1 pt-[14px] text-[13px] text-ink-2">
            {SYMPTOMS.map(s => (
              <i key={s.id} data-s={s.id} hidden={s.id !== active} className="font-serif text-[19px] text-ink">{s.plate}</i>
            ))}
            <span>Illustrative photo</span>
          </figcaption>
        </figure>

        <div>
          <fieldset className="symptoms m-0 flex flex-wrap gap-2 border-0 p-0">
            <legend className="mb-[14px] p-0 font-semibold">What do you see?</legend>
            {SYMPTOMS.map(s => (
              <Fragment key={s.id}>
                <input type="radio" name="symptom" id={`s-${s.id}`} checked={s.id === active} onChange={() => setActive(s.id)}
                  className="pointer-events-none absolute opacity-0" />
                <label htmlFor={`s-${s.id}`}
                  className="inline-flex min-h-[44px] cursor-pointer items-center rounded-full border px-[18px] text-[15px] font-semibold">
                  {s.label}
                </label>
              </Fragment>
            ))}
          </fieldset>

          <div aria-live="polite">
            {SYMPTOMS.map(s => (
              <article key={s.id} data-s={s.id} hidden={s.id !== active} className="mt-9">
                <h3 className="text-[clamp(2rem,3.5vw,2.75rem)] leading-[1.05]">{s.title}</h3>
                <dl className="mt-6 grid">
                  {([['Likely cause', s.cause], ['Natural fix', s.natural], ['Chemical fix', s.chemical]] as const).map(([dt, dd]) => (
                    <div key={dt} className="grid gap-x-6 gap-y-1 border-t border-line py-4 min-[600px]:grid-cols-[9.5rem_1fr]">
                      <dt className="text-[15px] font-bold">{dt}</dt>
                      <dd className="m-0 max-w-[52ch] text-ink-2">{dd}</dd>
                    </div>
                  ))}
                </dl>
              </article>
            ))}
          </div>
          <p className="mt-7 max-w-[52ch] text-[15px] text-ink-2">Several problems look alike in a photo. In the app, Rebloom asks a few questions before naming a cause, and tells you when it isn't sure.</p>
        </div>
      </div>
    </section>
  );
}
