import { WaitlistForm } from './WaitlistForm';

export function Final() {
  return (
    <section className="final relative isolate overflow-hidden bg-olive pt-[clamp(140px,22vw,300px)] text-surface" aria-labelledby="final-title">
      <div className="final-media" aria-hidden="true" />
      <div className="wrap">
        <h2 id="final-title" className="max-w-[12ch] text-[clamp(3.2rem,9vw,8rem)] leading-[.92] tracking-[-0.025em]">Get Rebloom first.</h2>
        <p className="mb-9 mt-7 max-w-[34ch] text-[clamp(17px,1.6vw,20px)] text-surface/[.82]">Join the waitlist and we'll email you once, on launch day.</p>
        <WaitlistForm source="final" />
        <footer className="mt-[clamp(80px,10vw,140px)] flex flex-wrap items-center justify-between gap-x-8 gap-y-4 border-t border-surface/[.18] py-7 text-[14px] text-surface/[.65]">
          <img src="/assets/rebloom-logo-bloom.svg" alt="Rebloom" width={81} height={22} className="h-[22px] w-auto" />
          <span>© 2026 Rebloom. Plant Doctor &amp; Care. <a className="tap-link" href="privacy.html">Privacy</a></span>
        </footer>
      </div>
    </section>
  );
}
