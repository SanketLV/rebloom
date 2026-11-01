// Field notes: general houseplant guidance. Photos are FLUX-made and labeled "Illustrative photo" on the page.
export type Symptom = {
  id: 'tips' | 'yellow' | 'mildew' | 'mites';
  label: string;
  plate: string;
  photo: string;
  alt: string;
  title: string;
  cause: string;
  natural: string;
  chemical: string;
};

export const SYMPTOMS: Symptom[] = [
  {
    id: 'tips',
    label: 'Brown, crispy tips',
    plate: 'Plate 1. Brown, crispy tips',
    photo: '/assets/sym-tips.webp',
    alt: 'A long green leaf whose tip has dried brown and crisp',
    title: 'Dry air or uneven watering',
    cause: 'The leaf edges lose water faster than the roots can replace it. Common near heaters, or when the soil dries out completely between waterings. Salt build-up from fertiliser does the same.',
    natural: "Water deeply until it drains, then again when the top 2–3 cm is dry. Move the plant away from heaters and group it with others to raise humidity. Trim the brown tips with clean scissors if you like; they won't turn green again.",
    chemical: 'None needed. Pause fertiliser for a month and flush the pot with plain water to clear salts.',
  },
  {
    id: 'yellow',
    label: 'Yellow lower leaves',
    plate: 'Plate 2. Yellow lower leaves',
    photo: '/assets/sym-yellow.webp',
    alt: 'A potted pothos with its lowest leaves turned yellow',
    title: 'Too much water',
    cause: 'Soil that stays wet keeps air from the roots, so the plant drops its oldest leaves first. Check whether the pot drains and whether the soil is still damp a few days after watering.',
    natural: 'Let the top 3 cm of soil dry before watering again. Empty any water standing in the saucer. If the roots are brown and mushy, trim them and repot into fresh, fast-draining mix.',
    chemical: 'Usually none. Feeding a stressed plant makes things worse, so wait until new growth appears.',
  },
  {
    id: 'mildew',
    label: 'White powdery patches',
    plate: 'Plate 3. Powdery mildew',
    photo: '/assets/sym-mildew.webp',
    alt: 'A green leaf dusted with white powdery patches',
    title: 'Powdery mildew',
    cause: 'A fungus that thrives in still air, with dry leaves and humid nights. It spreads to nearby plants, so move this one away from the others.',
    natural: 'Remove the worst leaves. Improve airflow and water at the soil, not over the leaves. Spray with diluted milk (1 part to 9 parts water) once a week in daylight.',
    chemical: 'A potassium bicarbonate or sulphur fungicide, following the label. Test on one leaf first.',
  },
  {
    id: 'mites',
    label: 'Fine speckles and webbing',
    plate: 'Plate 4. Spider mite damage',
    photo: '/assets/sym-mites.webp',
    alt: 'The underside of a leaf with fine webbing and pale speckles',
    title: 'Spider mites',
    cause: 'Tiny mites feeding on the underside of leaves, which leaves pale speckles. They multiply fast in warm, dry rooms. Fine webbing means the colony is established.',
    natural: 'Rinse the whole plant under a lukewarm shower, undersides too. Wipe the leaves every few days for two weeks, and keep the plant away from others.',
    chemical: 'Insecticidal soap or neem oil, sprayed every 5–7 days for three rounds, following the label. Eggs survive one spray.',
  },
];
