/* A curated shortlist of Google Fonts that hold up on a projector.
   The pickers are free-text, so any Google Font family can be typed in. */
window.THEMER_FONTS = {
  sans: [
    'Inter', 'Lato', 'Open Sans', 'Roboto', 'Source Sans 3', 'Source Sans Pro', 'Noto Sans',
    'Nunito Sans', 'Work Sans', 'Public Sans', 'Manrope', 'Figtree', 'Outfit',
    'Poppins', 'Montserrat', 'Raleway', 'Karla', 'Rubik', 'DM Sans', 'Barlow',
    'Archivo', 'Space Grotesk', 'Libre Franklin', 'Assistant', 'Mulish', 'Cabin',
    'Fira Sans', 'IBM Plex Sans', 'Atkinson Hyperlegible', 'Plus Jakarta Sans',
    'Lexend', 'Sora', 'Urbanist', 'Epilogue', 'Red Hat Display', 'Jost'
  ],
  serif: [
    'Source Serif 4', 'Lora', 'Merriweather', 'Playfair Display', 'EB Garamond',
    'Crimson Pro', 'Bitter', 'Libre Baskerville', 'Spectral', 'Newsreader',
    'Fraunces', 'DM Serif Display', 'Cormorant Garamond', 'IBM Plex Serif',
    'Zilla Slab', 'Alegreya', 'Petrona', 'Literata', 'Vollkorn'
  ],
  display: [
    'Oswald', 'Bebas Neue', 'Anton', 'Archivo Black', 'Josefin Sans', 'Chivo',
    'Syne', 'Bricolage Grotesque', 'Alfa Slab One', 'Righteous'
  ],
  mono: [
    'SFMono-Regular', 'Fira Code', 'JetBrains Mono', 'IBM Plex Mono', 'Source Code Pro',
    'Roboto Mono', 'Space Mono', 'Inconsolata', 'DM Mono', 'Azeret Mono',
    'Red Hat Mono', 'Ubuntu Sans Mono', 'Overpass Mono', 'Martian Mono',
    'Courier Prime', 'Anonymous Pro', 'Cousine', 'PT Mono', 'Victor Mono',
    'Chivo Mono', 'Geist Mono', 'Noto Sans Mono'
  ]
};

/* Starting points, not a house style — each is a full theme. */
window.THEMER_PRESETS = [
  {
    name: 'Default',
    theme: {}
  },
  {
    name: 'Paper',
    theme: {
      bg: '#fbf9f4', text: '#2e2a25', h1: '#1a1714', h2: '#3d372f',
      subtitle: '#7a7167', link: '#9c4221', codeBg: '#f2ede2', code: '#3d372f',
      fontBase: 'Source Serif 4', fontMono: 'IBM Plex Mono'
    }
  }
];
