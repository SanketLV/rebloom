import { FieldNotes } from '../components/FieldNotes';
import { Final } from '../components/Final';
import { Hero } from '../components/Hero';
import { HowItWorks } from '../components/HowItWorks';
import { OurPromise } from '../components/OurPromise';

export function LandingPage() {
  return (
    <>
      <Hero />
      <main>
        <FieldNotes />
        <HowItWorks />
        <OurPromise />
      </main>
      <Final />
    </>
  );
}
