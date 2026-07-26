function fontSet(): FontFaceSet | undefined {
  return typeof document === 'undefined' ? undefined : document.fonts;
}

export function fontsLoaded(): boolean {
  const fonts = fontSet();
  return !fonts || fonts.status === 'loaded';
}

export function subscribeToFonts(onChange: () => void): () => void {
  const fonts = fontSet();
  if (!fonts || !fonts.addEventListener) return () => {};
  fonts.addEventListener('loading', onChange);
  fonts.addEventListener('loadingdone', onChange);
  return () => {
    fonts.removeEventListener('loading', onChange);
    fonts.removeEventListener('loadingdone', onChange);
  };
}
