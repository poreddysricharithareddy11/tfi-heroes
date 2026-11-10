// TFI hero roster + costume system.
// Each hero is a stylised illustrated character with signature features (hairstyle, facial hair,
// skin tone, glasses, face shape, colour). For a true photographic likeness, users attach their own
// licensed/personal photo to a hero (see avatar.js photo mode) - we ship no copyrighted photographs.

const L = (top, bottom, jacket, shoes, acc = []) => ({ top, bottom, jacket, shoes, acc });

// fields: id, name, tag, skin, hair, hs (hair style), beard, must (moustache), glasses, face, accent, look
export const HEROES = [
  { id: 'allu-arjun', name: 'Allu Arjun', tag: 'Stylish Star', skin: '#d9a47c', hair: '#1c1412', hs: 'swept', beard: 'short', must: 'none', glasses: 'none', face: 'oval', accent: '#e4572e',
    look: L(['tee', '#222831'], ['jeans', '#2b3a55'], ['leather', '#1b1b1f'], ['sneaker', '#f4f4f4'], ['chain']) },
  { id: 'prabhas', name: 'Prabhas', tag: 'Rebel Star', skin: '#e2b48c', hair: '#3a2a20', hs: 'side', beard: 'short', must: 'none', glasses: 'none', face: 'square', accent: '#3a86ff',
    look: L(['shirt', '#e8e1d5'], ['trousers', '#2c2f3a'], ['bandhgala', '#33415c'], ['formal', '#2a1a12']) },
  { id: 'mahesh-babu', name: 'Mahesh Babu', tag: 'Prince', skin: '#e8bb94', hair: '#2a1d18', hs: 'side', beard: 'stubble', must: 'none', glasses: 'none', face: 'oval', accent: '#00a896',
    look: L(['polo', '#1f3a5f'], ['trousers', '#2d2d34'], null, ['formal', '#4a2c1a'], ['watch']) },
  { id: 'jr-ntr', name: 'Jr. NTR', tag: 'Man of Masses', skin: '#cf9468', hair: '#150f0d', hs: 'crop', beard: 'short', must: 'thin', glasses: 'none', face: 'round', accent: '#d62828',
    look: L(['shirt', '#f1f1f1'], ['trousers', '#1d1d22'], ['waistcoat', '#26262c'], ['formal', '#1a1210']) },
  { id: 'ram-charan', name: 'Ram Charan', tag: 'Mega Power Star', skin: '#cf9a70', hair: '#1a1210', hs: 'crop', beard: 'full', must: 'none', glasses: 'none', face: 'square', accent: '#7b2cbf',
    look: L(['tee', '#7b2cbf'], ['jeans', '#1f2430'], ['denim', '#3b5b8c'], ['sneaker', '#f4f4f4']) },
  { id: 'pawan-kalyan', name: 'Pawan Kalyan', tag: 'Power Star', skin: '#d29a70', hair: '#241915', hs: 'wavy', beard: 'stubble', must: 'none', glasses: 'none', face: 'oval', accent: '#0077b6',
    look: L(['kurta', '#f4efe6'], ['pyjama', '#f5f1e6'], null, ['sandal', '#a9713d'], ['shawl']) },
  { id: 'chiranjeevi', name: 'Chiranjeevi', tag: 'Megastar', skin: '#d8a37a', hair: '#8c8c8c', hs: 'wavy', beard: 'none', must: 'none', glasses: 'none', face: 'oval', accent: '#c9a227',
    look: L(['shirt', '#f8f4e8'], ['trousers', '#222'], ['blazer', '#1e2a44'], ['formal', '#201510']) },
  { id: 'nani', name: 'Nani', tag: 'Natural Star', skin: '#dcae88', hair: '#2b1e19', hs: 'crop', beard: 'stubble', must: 'none', glasses: 'none', face: 'round', accent: '#2a9d8f',
    look: L(['tee', '#2a9d8f'], ['jeans', '#3a4f73'], null, ['sneaker', '#f4f4f4']) },
  { id: 'vijay-deverakonda', name: 'Vijay Deverakonda', tag: 'Rowdy Star', skin: '#d9a47c', hair: '#1d1411', hs: 'wavy', beard: 'stubble', must: 'none', glasses: 'none', face: 'square', accent: '#ff6b35',
    look: L(['hoodie', '#2d2d2d'], ['jeans', '#2b3a55'], null, ['sneaker', '#ff6b35']) },
  { id: 'ravi-teja', name: 'Ravi Teja', tag: 'Mass Maharaja', skin: '#c99066', hair: '#1c1411', hs: 'crop', beard: 'stubble', must: 'none', glasses: 'none', face: 'oval', accent: '#e63946',
    look: L(['shirt', '#b83232'], ['jeans', '#26324a'], null, ['formal', '#2a1a12']) },
  { id: 'balakrishna', name: 'Balakrishna', tag: 'Balayya', skin: '#d6a07a', hair: '#1a1a1a', hs: 'swept', beard: 'none', must: 'thick', glasses: 'none', face: 'round', accent: '#f1f1f1',
    look: L(['shirt', '#ffffff'], ['dhoti', '#ffffff'], null, ['sandal', '#a9713d'], ['chain']) },
  { id: 'venkatesh', name: 'Venkatesh', tag: 'Victory', skin: '#e0ae88', hair: '#4f4f4f', hs: 'side', beard: 'stubble', must: 'none', glasses: 'none', face: 'oval', accent: '#f4a261',
    look: L(['polo', '#f4a261'], ['trousers', '#2e3140'], null, ['formal', '#4a2c1a']) },
  { id: 'nagarjuna', name: 'Nagarjuna', tag: 'King', skin: '#e6b890', hair: '#707070', hs: 'swept', beard: 'stubble', must: 'none', glasses: 'none', face: 'oval', accent: '#264653',
    look: L(['shirt', '#e9eef2'], ['trousers', '#20242e'], ['blazer', '#264653'], ['formal', '#201510']) },
  { id: 'akhil-akkineni', name: 'Akhil Akkineni', tag: 'TFI Hero', skin: '#e3b48d', hair: '#2a1d18', hs: 'swept', beard: 'stubble', must: 'none', glasses: 'none', face: 'oval', accent: '#4361ee',
    look: L(['tee', '#4361ee'], ['jeans', '#2b3a55'], ['bomber', '#1d2433'], ['sneaker', '#f4f4f4']) },
  { id: 'naga-chaitanya', name: 'Naga Chaitanya', tag: 'TFI Hero', skin: '#e0b08a', hair: '#2a1d18', hs: 'side', beard: 'short', must: 'none', glasses: 'none', face: 'oval', accent: '#2b9348',
    look: L(['polo', '#2b9348'], ['trousers', '#2d2d34'], null, ['sneaker', '#f4f4f4']) },
  { id: 'sai-dharam-tej', name: 'Sai Dharam Tej', tag: 'TFI Hero', skin: '#d5a078', hair: '#1c1412', hs: 'crop', beard: 'stubble', must: 'none', glasses: 'none', face: 'square', accent: '#f72585',
    look: L(['hoodie', '#f72585'], ['jeans', '#1f2430'], null, ['sneaker', '#f4f4f4']) },
  { id: 'varun-tej', name: 'Varun Tej', tag: 'TFI Hero', skin: '#dcab84', hair: '#241915', hs: 'swept', beard: 'short', must: 'none', glasses: 'none', face: 'square', accent: '#06d6a0',
    look: L(['shirt', '#0f4c5c'], ['trousers', '#22262e'], ['bomber', '#1b1b1f'], ['formal', '#201510']) },
  { id: 'rana-daggubati', name: 'Rana Daggubati', tag: 'Bhallaladeva', skin: '#e8bd96', hair: '#6b5440', hs: 'buzz', beard: 'full', must: 'none', glasses: 'none', face: 'square', accent: '#8d6e63',
    look: L(['shirt', '#37474f'], ['jeans', '#1f2430'], ['leather', '#2a2018'], ['formal', '#201510']) },
  { id: 'ram-pothineni', name: 'Ram Pothineni', tag: 'Energetic Star', skin: '#e0b08a', hair: '#2a1d18', hs: 'curly', beard: 'stubble', must: 'none', glasses: 'none', face: 'round', accent: '#ffd60a',
    look: L(['tee', '#ffd60a'], ['jeans', '#2b3a55'], null, ['sneaker', '#f4f4f4']) },
  { id: 'nithiin', name: 'Nithiin', tag: 'TFI Hero', skin: '#e2b48c', hair: '#2a1d18', hs: 'side', beard: 'none', must: 'none', glasses: 'none', face: 'oval', accent: '#9b5de5',
    look: L(['shirt', '#9b5de5'], ['jeans', '#2b3a55'], null, ['sneaker', '#f4f4f4']) },
  { id: 'sharwanand', name: 'Sharwanand', tag: 'TFI Hero', skin: '#dcae88', hair: '#2b1e19', hs: 'crop', beard: 'stubble', must: 'none', glasses: 'none', face: 'round', accent: '#fb8500',
    look: L(['polo', '#fb8500'], ['trousers', '#2d2d34'], null, ['formal', '#4a2c1a']) },
  { id: 'adivi-sesh', name: 'Adivi Sesh', tag: 'Major Star', skin: '#e0b08a', hair: '#1d1411', hs: 'wavy', beard: 'short', must: 'none', glasses: 'none', face: 'oval', accent: '#3d405b',
    look: L(['tee', '#3d405b'], ['jeans', '#26324a'], ['denim', '#2f4b73'], ['sneaker', '#f4f4f4']) },
  { id: 'kalyan-ram', name: 'Nandamuri Kalyan Ram', tag: 'TFI Hero', skin: '#d6a07a', hair: '#1a1a1a', hs: 'side', beard: 'short', must: 'thin', glasses: 'none', face: 'round', accent: '#bc4749',
    look: L(['shirt', '#bc4749'], ['trousers', '#22262e'], null, ['formal', '#201510']) },
  { id: 'siddhu-jonnalagadda', name: 'Siddhu Jonnalagadda', tag: 'DJ Tillu', skin: '#dcae88', hair: '#1c1412', hs: 'curly', beard: 'stubble', must: 'none', glasses: 'round', face: 'oval', accent: '#118ab2',
    look: L(['tee', '#118ab2'], ['jeans', '#2b3a55'], ['bomber', '#1d2433'], ['sneaker', '#f4f4f4']) },
];

export const COLORS = ['#ffffff', '#f4efe6', '#111827', '#374151', '#9ca3af', '#e63946', '#e4572e', '#fb8500', '#ffd60a', '#2b9348',
  '#06d6a0', '#2a9d8f', '#118ab2', '#3a86ff', '#1e2a44', '#7b2cbf', '#f72585', '#8d6e63', '#a9713d'];
export const HAIR_COLORS = ['#0f0b0a', '#1c1412', '#3a2a20', '#6b5440', '#707070', '#a8a8a8', '#e8e8e8'];

export const OPTIONS = {
  top: ['tee', 'polo', 'shirt', 'hoodie', 'kurta', 'sherwani'],
  bottom: ['jeans', 'trousers', 'pyjama', 'dhoti'],
  jacket: ['none', 'denim', 'leather', 'bomber', 'blazer', 'bandhgala', 'waistcoat'],
  shoes: ['sneaker', 'formal', 'sandal'],
  acc: ['sunglasses', 'cap', 'watch', 'chain', 'scarf', 'shawl', 'tie'],
  hair: ['crop', 'side', 'swept', 'wavy', 'curly', 'long', 'buzz', 'bald'],
};
export const LABELS = {
  tee: 'T-shirt', polo: 'Polo', shirt: 'Formal shirt', hoodie: 'Hoodie', kurta: 'Kurta', sherwani: 'Sherwani',
  jeans: 'Jeans', trousers: 'Trousers', pyjama: 'Pyjama', dhoti: 'Dhoti / Panche',
  none: 'None', denim: 'Denim jacket', leather: 'Leather jacket', bomber: 'Bomber', blazer: 'Blazer', bandhgala: 'Bandhgala', waistcoat: 'Waistcoat',
  sneaker: 'Sneakers', formal: 'Formal shoes', sandal: 'Sandals / Mojari',
  sunglasses: 'Sunglasses', cap: 'Cap', watch: 'Watch', chain: 'Gold chain', scarf: 'Scarf', shawl: 'Angavastram', tie: 'Tie',
  crop: 'Crop', side: 'Side part', swept: 'Swept back', wavy: 'Wavy', curly: 'Curly', long: 'Long', buzz: 'Buzz', bald: 'Receding',
};

const mk = (preset, o) => ({
  preset,
  top: { style: o.top[0], color: o.top[1] },
  bottom: { style: o.bottom[0], color: o.bottom[1] },
  jacket: o.jacket ? { style: o.jacket[0], color: o.jacket[1] } : null,
  shoes: { style: o.shoes[0], color: o.shoes[1] },
  acc: [...(o.acc || [])],
  hair: null, hairColor: null,
});

export const PRESETS = ['default', 'casual', 'traditional', 'western'];
export const PRESET_LABELS = { default: 'Original Look', casual: 'Casual', traditional: 'Traditional', western: 'Western', custom: 'Custom' };

export function presetCostume(hero, preset) {
  const a = hero.accent;
  switch (preset) {
    case 'casual': return mk('casual', { top: ['tee', a], bottom: ['jeans', '#33507a'], jacket: null, shoes: ['sneaker', '#f4f4f4'] });
    case 'traditional': return mk('traditional', { top: ['kurta', '#f4efe6'], bottom: ['pyjama', '#f5f1e6'], jacket: null, shoes: ['sandal', '#a9713d'], acc: ['shawl'] });
    case 'western': return mk('western', { top: ['shirt', '#f6f6f6'], bottom: ['trousers', '#2b2d38'], jacket: ['blazer', '#1f2a44'], shoes: ['formal', '#2a1a12'], acc: ['tie'] });
    default: return mk('default', hero.look);
  }
}

export const QUICK_OUTFITS = {
  formal: { label: 'Formal', build: () => mk('custom', { top: ['shirt', '#ffffff'], bottom: ['trousers', '#1f2430'], jacket: ['blazer', '#1e2a44'], shoes: ['formal', '#201510'], acc: ['tie', 'watch'] }) },
  festive: { label: 'Festive Sherwani', build: () => mk('custom', { top: ['sherwani', '#8c1c13'], bottom: ['pyjama', '#f5f1e6'], jacket: null, shoes: ['sandal', '#a9713d'], acc: ['shawl'] }) },
  street: { label: 'Street Jacket', build: () => mk('custom', { top: ['hoodie', '#374151'], bottom: ['jeans', '#1f2430'], jacket: ['bomber', '#e4572e'], shoes: ['sneaker', '#f4f4f4'], acc: ['cap'] }) },
};

/** A hero's costume at a reminder/preview time. mode: 'saved' | preset name. */
export function resolveCostume(hero, mode, saved) {
  if (mode === 'saved' || !mode) return saved || presetCostume(hero, 'default');
  return presetCostume(hero, mode);
}

export function heroById(id, custom = []) {
  return HEROES.find((h) => h.id === id) || custom.find((h) => h.id === id) || HEROES[0];
}

/** A user-created hero (own name + own photo). Neutral base look; photo supplies the face. */
export function makeCustomHero(id, name) {
  return {
    id, name, tag: 'My Custom Avatar', custom: true, skin: '#d9a47c', hair: '#1c1412', hs: 'crop', beard: 'none', must: 'none',
    glasses: 'none', face: 'oval', accent: '#3a86ff',
    look: L(['tee', '#3a86ff'], ['jeans', '#2b3a55'], null, ['sneaker', '#f4f4f4']),
  };
}
