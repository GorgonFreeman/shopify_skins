(() => {
  const BUTTON_ATTR = 'data-shopify-skins-preview-btn';
  const EYE_SVG = `
    <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path d="M10 4.5C5 4.5 1.73 8.11 1 10c.73 1.89 4 5.5 9 5.5s8.27-3.61 9-5.5c-.73-1.89-4-5.5-9-5.5Zm0 9a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7Zm0-2a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z"/>
    </svg>
  `.trim();

  function previewUrlForTheme(storeHandle, themeId) {
    const id = gidToId(themeId);
    return `https://${ storeHandle }.myshopify.com/?preview_theme_id=${ id }`;
  }

  async function copyPreviewLink(url) {
    try {
      await navigator.clipboard.writeText(url);
      toast('Preview link copied.');
    } catch (error) {
      console.log('clipboardError', error);
      toast('Could not copy preview link.', 'error');
    }
  }

  async function openThemePreview(themeId) {
    const storeHandle = await ThemeActions.resolveStoreHandle();
    if (!storeHandle) {
      toast('Open a store admin tab to preview themes.', 'error');
      return;
    }
    const url = previewUrlForTheme(storeHandle, themeId);
    await copyPreviewLink(url);
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  ThemeActions.register({
    id: 'preview',
    buttonAttr: BUTTON_ATTR,
    title: 'Preview theme',
    svg: EYE_SVG,
    async isEnabled(settings) {
      return settings.themePreviewEnabled === true;
    },
    onActivate(_labelEl, themeId) {
      openThemePreview(themeId);
    },
  });

  window.shopifySkinsDebugPreview = async () => {
    await ThemeActions.refreshAndDecorate();
    const storeHandle = await ThemeActions.resolveStoreHandle();
    const targets = ThemeActions.collectThemeNameTargets().map((el) => ({
      tag: el.tagName,
      text: cleanText(el),
      themeId: el.dataset.shopifySkinsThemeId || ThemeActions.findThemeIdNear(el),
    }));
    const report = {
      enabled: ThemeActions.isEnabled('preview'),
      href: location.href,
      storeHandle,
      targets,
      previewCount: document.querySelectorAll(`[${ BUTTON_ATTR }]`).length,
      samplePreviewUrl: targets[0]?.themeId && storeHandle
        ? previewUrlForTheme(storeHandle, targets[0].themeId)
        : null,
    };
    console.log('shopifySkinsDebugPreview', report);
    return report;
  };
})();
