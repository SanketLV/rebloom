const PROMISES = [
  { head: 'Your first diagnosis is free.', body: 'No card, no trial to cancel. Scan a plant and see the whole plan.' },
  { head: 'We remind you before any charge.', body: 'If you start a trial, you get a notice before it turns into a payment.' },
  { head: 'Cancel in one tap.', body: 'From the app, any time. No emails to send, no hoops.' },
];

export function OurPromise() {
  return (
    <section className="bg-amber py-[clamp(80px,12vw,150px)]" aria-labelledby="promise-title">
      <div className="wrap grid items-center gap-x-[72px] gap-y-10 min-[900px]:grid-cols-[5fr_7fr]">
        <img src="/assets/promise.webp" width={896} height={1120} alt="" loading="lazy"
          className="aspect-[4/5] w-full rounded bg-photo object-cover max-[899px]:max-h-[52svh]" />
        <div>
          <h2 id="promise-title" className="text-walnut">Our promise</h2>
          <ul className="mt-8">
            {PROMISES.map(p => (
              <li key={p.head} className="border-t border-walnut/30 py-6 last:border-b">
                <strong className="block font-serif text-[clamp(1.75rem,3vw,2.4rem)] font-normal leading-[1.1]">{p.head}</strong>
                <span className="mt-1.5 block max-w-[50ch] text-walnut">{p.body}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
